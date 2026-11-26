import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { QualityValue } from '../../shared/quality'
import type {
    DownloadJob,
    DownloadRequest,
    ListResult,
    ParseRequest,
    VideoItem,
} from '../../shared/types'
import { formatHeightLabel, getQualityOption } from '../../shared/quality'
import { detectPlatform } from '../../shared/platform'
import { downloadHttpFile } from '../utils/httpDownload'
import { resolveJobOutputDir } from '../utils/outputPath'
import { resolveDouyin } from '../parsers/douyin'
import { resolveTikTok } from '../parsers/tiktok'
import { extractFirstUrl, sanitizeFileName } from '../parsers/urlExtract'
import { withOverseasProxyTip } from '../utils/proxy'
import { getSettings } from '../settingsStore'

type JobListener = (job: DownloadJob) => void
type StopIntent = 'cancel' | 'pause'

interface ResolvedShortVideo {
    platform: 'douyin' | 'tiktok'
    id: string
    title: string
    author?: string
    cover?: string
    duration?: number
    height?: number
    videoUrl: string
    backupUrls?: string[]
}

async function resolveShortVideo(
    input: string,
    signal?: AbortSignal,
): Promise<ResolvedShortVideo> {
    const url = extractFirstUrl(input) || input.trim()
    const platform = detectPlatform(url)
    if (platform === 'douyin') {
        return resolveDouyin(input, signal)
    }
    if (platform === 'tiktok') {
        return resolveTikTok(input, signal)
    }
    throw new Error('短视频引擎仅支持抖音与 TikTok')
}

function refererFor(platform: 'douyin' | 'tiktok'): string {
    return platform === 'douyin' ? 'https://www.douyin.com/' : 'https://www.tiktok.com/'
}

function isActiveState(state: DownloadJob['state']): boolean {
    return (
        state === 'queued' ||
        state === 'resolving' ||
        state === 'downloading' ||
        state === 'concatenating' ||
        state === 'decrypting'
    )
}

export class ShortVideoEngine {
    private readonly jobs = new Map<string, DownloadJob>()
    private readonly customTitles = new Set<string>()
    private readonly abortControllers = new Map<string, AbortController>()
    private readonly runSeq = new Map<string, number>()
    private readonly listeners = new Set<JobListener>()
    private readonly queue: string[] = []
    private readonly stopIntents = new Map<string, StopIntent>()
    private runningJobId: string | null = null
    private parseAbortController: AbortController | null = null

    onJob(listener: JobListener): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    getJobs(): DownloadJob[] {
        return Array.from(this.jobs.values()).sort((a, b) => b.startedAt - a.startedAt)
    }

    cancelParse(): void {
        if (this.parseAbortController) {
            this.parseAbortController.abort()
            this.parseAbortController = null
        }
    }

    cancelActive(): void {
        this.cancelParse()
        for (const job of this.jobs.values()) {
            if (isActiveState(job.state) || job.state === 'paused') {
                this.stopJob(job.id, 'cancel')
            }
        }
    }

    cancelJob(jobId: string): boolean {
        return this.stopJob(jobId, 'cancel')
    }

    pauseJob(jobId: string): boolean {
        const job = this.jobs.get(jobId)
        if (!job || !isActiveState(job.state)) {
            return false
        }
        return this.stopJob(jobId, 'pause')
    }

    resumeJob(jobId: string): boolean {
        const job = this.jobs.get(jobId)
        if (!job || job.state !== 'paused' || !job.url) {
            return false
        }
        this.stopIntents.delete(jobId)
        job.state = 'queued'
        job.message = '等待继续下载…'
        job.finishedAt = undefined
        this.emit(job)
        if (!this.queue.includes(jobId)) {
            this.queue.push(jobId)
        }
        void this.pump()
        return true
    }

    private stopJob(jobId: string, intent: StopIntent): boolean {
        const job = this.jobs.get(jobId)
        if (!job) {
            return false
        }

        const queuedIndex = this.queue.indexOf(jobId)
        if (queuedIndex >= 0) {
            this.queue.splice(queuedIndex, 1)
        }

        const controller = this.abortControllers.get(jobId)
        if (controller) {
            this.stopIntents.set(jobId, intent)
            this.abortControllers.delete(jobId)
            controller.abort()
        }

        if (isActiveState(job.state) || job.state === 'paused') {
            job.state = intent === 'pause' ? 'paused' : 'cancelled'
            job.message = intent === 'pause' ? '已暂停，可随时继续' : '已取消'
            job.finishedAt = intent === 'cancel' ? Date.now() : undefined
            this.emit(job)
            return true
        }
        return Boolean(controller)
    }

    private emit(job: DownloadJob): void {
        if (!this.jobs.has(job.id)) {
            return
        }
        this.jobs.set(job.id, job)
        for (const listener of this.listeners) {
            listener({ ...job })
        }
    }

    async listVideos(request: ParseRequest): Promise<ListResult> {
        this.cancelParse()
        const controller = new AbortController()
        this.parseAbortController = controller
        try {
            const resolved = await resolveShortVideo(request.url, controller.signal)
            if (controller.signal.aborted) {
                throw new Error('解析已取消')
            }
            const item: VideoItem = {
                index: 1,
                guid: resolved.id,
                title: resolved.title,
                length: resolved.duration,
                channel: resolved.author,
                image: resolved.cover,
                platform: resolved.platform,
                url: extractFirstUrl(request.url) || request.url,
            }
            return { videos: [item], rawCount: 1, platform: resolved.platform }
        } catch (error) {
            if (
                controller.signal.aborted ||
                (error instanceof Error && error.message === 'aborted')
            ) {
                throw new Error('解析已取消')
            }
            throw error
        } finally {
            if (this.parseAbortController === controller) {
                this.parseAbortController = null
            }
        }
    }

    async download(request: DownloadRequest): Promise<DownloadJob> {
        const settings = getSettings()
        const quality = (request.quality ?? settings.quality) as QualityValue
        const target = request.url
        if (!target) {
            throw new Error('请提供视频链接')
        }

        const platformHint = request.platform === 'tiktok' ? 'tiktok' : 'douyin'
        const explicitTitle = request.title?.trim()
        const jobId = randomUUID()
        if (explicitTitle) {
            this.customTitles.add(jobId)
        }

        const outputDir = resolveJobOutputDir(settings, platformHint)
        const job: DownloadJob = {
            id: jobId,
            title: explicitTitle || (platformHint === 'tiktok' ? 'TikTok 视频' : '抖音视频'),
            platform: platformHint,
            guid: request.guid,
            url: target,
            quality,
            outputDir,
            progress: 0,
            state: 'queued',
            message: '已加入下载队列',
            startedAt: Date.now(),
        }
        this.jobs.set(jobId, job)
        this.emit(job)
        this.queue.push(jobId)
        void this.pump()
        return { ...job }
    }

    private async pump(): Promise<void> {
        if (this.runningJobId || this.queue.length === 0) {
            return
        }
        const jobId = this.queue.shift()
        if (!jobId) {
            return
        }
        const job = this.jobs.get(jobId)
        if (
            !job ||
            job.state === 'paused' ||
            job.state === 'cancelled' ||
            job.state === 'completed' ||
            job.state === 'failed'
        ) {
            void this.pump()
            return
        }
        this.runningJobId = jobId
        const seq = (this.runSeq.get(jobId) ?? 0) + 1
        this.runSeq.set(jobId, seq)

        try {
            await this.runDownloadJob(jobId, seq)
        } finally {
            if (this.runningJobId === jobId) {
                this.runningJobId = null
            }
            void this.pump()
        }
    }

    private async runDownloadJob(jobId: string, seq: number): Promise<void> {
        const job = this.jobs.get(jobId)
        if (!job || !job.url) {
            return
        }
        const settings = getSettings()
        const quality = job.quality
        const target = job.url

        const controller = new AbortController()
        this.abortControllers.set(jobId, controller)
        const isStale = (): boolean =>
            !this.jobs.has(jobId) ||
            this.runSeq.get(jobId) !== seq ||
            controller.signal.aborted ||
            job.state === 'paused' ||
            job.state === 'cancelled'

        try {
            job.state = 'resolving'
            job.message = '正在解析无水印直链…'
            this.emit(job)

            const resolved = await resolveShortVideo(target, controller.signal)
            if (isStale()) {
                this.stopIntents.delete(jobId)
                return
            }

            job.platform = resolved.platform
            if (!this.customTitles.has(jobId) && resolved.title) {
                job.title = resolved.title
            }
            job.guid = resolved.id
            job.qualityLabel =
                formatHeightLabel(resolved.height) || getQualityOption(quality).label
            job.state = 'downloading'
            job.progress = Math.max(1, job.progress)
            job.message = '开始下载…'

            const outputDir =
                job.outputDir || resolveJobOutputDir(settings, resolved.platform)
            job.outputDir = outputDir
            const fileName = `${sanitizeFileName(job.title)} [${resolved.id}].mp4`
            const outputPath = join(outputDir, fileName)
            job.outputPath = outputPath
            this.emit(job)

            const candidates = [resolved.videoUrl, ...(resolved.backupUrls || [])]
            let lastError: unknown = null

            for (let i = 0; i < candidates.length; i += 1) {
                if (isStale()) {
                    this.stopIntents.delete(jobId)
                    return
                }
                const candidate = candidates[i]
                try {
                    if (i > 0) {
                        job.message = `线路 ${i} 异常，正在切换备用线路…`
                        this.emit(job)
                    }
                    await downloadHttpFile({
                        url: candidate,
                        outputPath,
                        signal: controller.signal,
                        cleanPartOnAbort: () => this.stopIntents.get(jobId) === 'cancel',
                        headers: {
                            'User-Agent':
                                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            Referer: refererFor(resolved.platform),
                        },
                        onProgress: (percent, _downloaded, _total, speedText) => {
                            if (isStale()) {
                                return
                            }
                            job.progress = Math.max(job.progress, percent)
                            job.state = 'downloading'
                            job.message = speedText ? `下载中 ${speedText}` : '下载中…'
                            this.emit(job)
                        },
                    })
                    lastError = null
                    break
                } catch (error) {
                    if (
                        isStale() ||
                        (error instanceof Error && error.message === 'aborted')
                    ) {
                        this.stopIntents.delete(jobId)
                        return
                    }
                    lastError = error
                }
            }

            if (isStale()) {
                this.stopIntents.delete(jobId)
                return
            }

            if (lastError) {
                throw lastError instanceof Error ? lastError : new Error(String(lastError))
            }

            job.state = 'completed'
            job.progress = 100
            job.outputPath = outputPath
            job.message = undefined
            job.finishedAt = Date.now()
            this.emit(job)
        } catch (error) {
            if (!this.jobs.has(jobId) || this.runSeq.get(jobId) !== seq) {
                return
            }
            const intent = this.stopIntents.get(jobId)
            this.stopIntents.delete(jobId)
            if (
                intent === 'pause' ||
                job.state === 'paused' ||
                intent === 'cancel' ||
                job.state === 'cancelled' ||
                (error instanceof Error && error.message === 'aborted')
            ) {
                if (intent === 'pause' || job.state === 'paused') {
                    job.state = 'paused'
                    job.message = '已暂停，可随时继续'
                } else {
                    job.state = 'cancelled'
                    job.message = '已取消'
                    job.finishedAt = job.finishedAt ?? Date.now()
                }
                this.emit(job)
                return
            }
            job.state = 'failed'
            const raw = error instanceof Error ? error.message : String(error)
            job.message = withOverseasProxyTip(job.platform, raw)
            job.finishedAt = Date.now()
            this.emit(job)
        } finally {
            if (this.abortControllers.get(jobId) === controller) {
                this.abortControllers.delete(jobId)
            }
        }
    }

    patchJob(jobId: string, patch: Partial<DownloadJob>): boolean {
        const job = this.jobs.get(jobId)
        if (!job) {
            return false
        }
        Object.assign(job, patch)
        this.emit(job)
        return true
    }

    removeJob(jobId: string): boolean {
        if (!this.jobs.has(jobId)) {
            return false
        }
        this.stopJob(jobId, 'cancel')
        this.jobs.delete(jobId)
        this.customTitles.delete(jobId)
        this.runSeq.delete(jobId)
        this.stopIntents.delete(jobId)
        const queuedIndex = this.queue.indexOf(jobId)
        if (queuedIndex >= 0) {
            this.queue.splice(queuedIndex, 1)
        }
        return true
    }
}

export const shortVideoEngine = new ShortVideoEngine()
