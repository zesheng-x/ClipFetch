import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { formatHeightLabel, getQualityOption, type QualityValue } from '../../shared/quality'
import { downloadHttpFile } from '../utils/httpDownload'
import { resolveJobOutputDir } from '../utils/outputPath'
import { sanitizeFileName } from '../parsers/urlExtract'
import type {
    DownloadJob,
    DownloadRequest,
    ListResult,
    ParseRequest,
    VideoItem,
} from '../../shared/types'
import { proxiedFetch } from '../utils/proxy'
import { getSettings } from '../settingsStore'

type JobListener = (job: DownloadJob) => void
type StopIntent = 'cancel' | 'pause'

const MOBILE_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'

const GRAPHQL_QUERY = `query visionVideoDetail($photoId: String, $type: String, $page: String, $webPageArea: String) {
  visionVideoDetail(photoId: $photoId, type: $type, page: $page, webPageArea: $webPageArea) {
    status
    type
    author { id name }
    photo {
      id
      duration
      caption
      coverUrl
      photoUrl
      timestamp
      manifest {
        adaptationSet {
          representation {
            url
            height
            width
            qualityType
            qualityLabel
            avgBitrate
          }
        }
      }
    }
  }
}`

interface KuaishouResolved {
    photoId: string
    title: string
    duration?: number
    height?: number
    coverUrl?: string
    channel?: string
    videoUrl: string
    backupUrls?: string[]
}

function extractPhotoId(url: string, html: string): string | null {
    const fromHtml =
        html.match(/short-video\/([a-zA-Z0-9_-]+)/i)?.[1] ||
        html.match(/clientCacheKey=([a-zA-Z0-9_-]+)/i)?.[1]?.split('_')[0] ||
        html.match(/"photoId"\s*:\s*"([a-zA-Z0-9_-]+)"/i)?.[1]
    if (fromHtml) {
        return fromHtml
    }
    return (
        url.match(/\/short-video\/([a-zA-Z0-9_-]+)/i)?.[1] ||
        url.match(/\/photo\/([a-zA-Z0-9_-]+)/i)?.[1] ||
        url.match(/\/f\/([a-zA-Z0-9_-]+)/i)?.[1] ||
        null
    )
}

function dedupeUrls(urls: string[]): string[] {
    const unique: string[] = []
    const seen = new Set<string>()
    for (const url of urls) {
        if (!url) {
            continue
        }
        const base = url.split('?')[0]
        if (!seen.has(base)) {
            seen.add(base)
            unique.push(url)
        }
    }
    return unique
}

function pickBestMp4(urls: string[], quality: QualityValue): string | null {
    const unique = dedupeUrls(urls)
    if (unique.length === 0) {
        return null
    }

    const hd = unique.filter((u) => /hd15|_hd/i.test(u))
    const sd = unique.filter((u) => /_b_/i.test(u))
    const other = unique.filter((u) => !hd.includes(u) && !sd.includes(u))

    if (quality === 0 || quality <= 3) {
        return (hd[0] || sd[0] || other[0]) ?? null
    }
    return (sd[0] || other[0] || hd[0]) ?? null
}

function collectMp4FromHtml(html: string): string[] {
    const matches = html.match(/https?:\/\/[^\s"'\\]+?\.mp4(?:\?[^\s"'\\]*)?/gi) || []
    return matches.map((item) => item.replace(/\\u002F/g, '/').replace(/\\\//g, '/'))
}

function extractTitle(html: string, photoId: string): string {
    const og =
        html.match(/property="og:title"\s+content="([^"]+)"/i)?.[1] ||
        html.match(/<title>([^<]+)<\/title>/i)?.[1]
    if (!og) {
        return `快手_${photoId}`
    }
    return og.replace(/[-_|].*快手.*$/i, '').trim() || `快手_${photoId}`
}

async function fetchText(
    url: string,
    signal?: AbortSignal,
): Promise<{ finalUrl: string; html: string }> {
    const response = await proxiedFetch(url, {
        redirect: 'follow',
        signal,
        headers: {
            'User-Agent': MOBILE_UA,
            'Accept-Language': 'zh-CN,zh;q=0.9',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
    })
    if (!response.ok) {
        throw new Error(`打开快手页面失败：HTTP ${response.status}`)
    }
    const html = await response.text()
    return { finalUrl: response.url, html }
}

async function resolveViaGraphql(
    photoId: string,
    quality: QualityValue,
    signal?: AbortSignal,
): Promise<Partial<KuaishouResolved> | null> {
    const endpoints = [
        'https://www.kuaishou.com/graphql',
        'https://video.kuaishou.com/graphql',
    ]
    const maxHeight = getQualityOption(quality).maxHeight

    for (const endpoint of endpoints) {
        if (signal?.aborted) {
            throw new Error('aborted')
        }
        try {
            const response = await proxiedFetch(endpoint, {
                method: 'POST',
                signal,
                timeoutMs: 12_000,
                headers: {
                    'User-Agent': MOBILE_UA,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    Origin: 'https://www.kuaishou.com',
                    Referer: `https://www.kuaishou.com/short-video/${photoId}`,
                },
                body: JSON.stringify({
                    operationName: 'visionVideoDetail',
                    variables: { photoId, page: 'detail' },
                    query: GRAPHQL_QUERY,
                }),
            })
            if (!response.ok) {
                continue
            }
            const json = (await response.json()) as {
                data?: {
                    visionVideoDetail?: {
                        author?: { name?: string }
                        photo?: {
                            id?: string
                            caption?: string
                            duration?: number
                            coverUrl?: string
                            photoUrl?: string
                            manifest?: {
                                adaptationSet?: Array<{
                                    representation?: Array<{
                                        url?: string
                                        height?: number
                                        width?: number
                                        avgBitrate?: number
                                    }>
                                }>
                            }
                        }
                    }
                }
            }
            const detail = json.data?.visionVideoDetail
            const photo = detail?.photo
            if (!photo) {
                continue
            }

            const representations = (
                photo.manifest?.adaptationSet?.flatMap((set) => set.representation || []) || []
            ).filter((rep) => Boolean(rep?.url))

            const withShortSide = representations.map((rep) => {
                const h = Number(rep.height || 0)
                const w = Number(rep.width || 0)
                const shortSide = h > 0 && w > 0 ? Math.min(h, w) : h || w
                return { ...rep, shortSide }
            })

            withShortSide.sort(
                (a, b) => b.shortSide - a.shortSide || (b.avgBitrate || 0) - (a.avgBitrate || 0),
            )

            const matched =
                maxHeight > 0
                    ? withShortSide.find((rep) => rep.shortSide > 0 && rep.shortSide <= maxHeight) ||
                      withShortSide[0]
                    : withShortSide[0]

            const videoUrl = matched?.url || photo.photoUrl
            if (!videoUrl) {
                continue
            }

            const backupUrls = dedupeUrls([
                ...(photo.photoUrl ? [photo.photoUrl] : []),
                ...withShortSide.map((r) => r.url || ''),
            ]).filter((u) => u !== videoUrl)

            return {
                photoId: photo.id || photoId,
                title: photo.caption?.trim() || `快手_${photoId}`,
                duration:
                    typeof photo.duration === 'number'
                        ? Math.round(photo.duration / 1000)
                        : undefined,
                height: matched?.shortSide || undefined,
                coverUrl: photo.coverUrl,
                channel: detail?.author?.name,
                videoUrl,
                backupUrls,
            }
        } catch (err) {
            if (signal?.aborted || (err instanceof Error && err.message === 'aborted')) {
                throw new Error('aborted')
            }
            // 尝试下一个端点
        }
    }
    return null
}

async function resolveKuaishou(
    url: string,
    quality: QualityValue,
    signal?: AbortSignal,
): Promise<KuaishouResolved> {
    const { finalUrl, html } = await fetchText(url, signal)
    const photoId = extractPhotoId(finalUrl, html) || extractPhotoId(url, '')
    if (!photoId) {
        throw new Error('无法从快手链接中提取作品 ID')
    }

    const htmlMp4 = collectMp4FromHtml(html)
    const pickedFromHtml = pickBestMp4(htmlMp4, quality)
    const graphql = await resolveViaGraphql(photoId, quality, signal)

    // 优先使用结构化 GraphQL 选出的清晰度直链，网页正则结果作为后备
    const videoUrl = graphql?.videoUrl || pickedFromHtml
    if (!videoUrl) {
        throw new Error(
            '未能解析快手视频直链。请改用 App 分享短链（v.kuaishou.com），或确认作品未失效。',
        )
    }

    const backups = dedupeUrls([
        ...(graphql?.backupUrls || []),
        ...(pickedFromHtml ? [pickedFromHtml] : []),
        ...htmlMp4,
    ]).filter((u) => u !== videoUrl)

    return {
        photoId,
        title: graphql?.title || extractTitle(html, photoId),
        duration: graphql?.duration,
        height: graphql?.height,
        coverUrl: graphql?.coverUrl,
        channel: graphql?.channel,
        videoUrl,
        backupUrls: backups,
    }
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

export class KuaishouEngine {
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
            const settings = getSettings()
            const resolved = await resolveKuaishou(request.url, settings.quality, controller.signal)
            if (controller.signal.aborted) {
                throw new Error('解析已取消')
            }
            const item: VideoItem = {
                index: 1,
                guid: resolved.photoId,
                title: resolved.title,
                length: resolved.duration,
                channel: resolved.channel,
                image: resolved.coverUrl,
                platform: 'kuaishou',
                url: request.url,
            }
            return { videos: [item], rawCount: 1, platform: 'kuaishou' }
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
        const targetUrl = request.url
        if (!targetUrl) {
            throw new Error('请提供快手视频链接')
        }

        const explicitTitle = request.title?.trim()
        const jobId = randomUUID()
        if (explicitTitle) {
            this.customTitles.add(jobId)
        }

        const outputDir = resolveJobOutputDir(settings, 'kuaishou')
        const job: DownloadJob = {
            id: jobId,
            title: explicitTitle || '快手视频',
            platform: 'kuaishou',
            guid: request.guid,
            url: targetUrl,
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
        const targetUrl = job.url

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
            job.message = '正在解析快手视频…'
            this.emit(job)

            const resolved = await resolveKuaishou(targetUrl, quality, controller.signal)
            if (isStale()) {
                this.stopIntents.delete(jobId)
                return
            }

            if (!this.customTitles.has(jobId) && resolved.title) {
                job.title = resolved.title
            }
            job.guid = resolved.photoId
            job.qualityLabel =
                formatHeightLabel(resolved.height) || getQualityOption(quality).label
            job.state = 'downloading'
            job.progress = Math.max(1, job.progress)
            job.message = '开始下载…'

            const outputDir = job.outputDir || resolveJobOutputDir(settings, 'kuaishou')
            job.outputDir = outputDir
            const fileName = `${sanitizeFileName(job.title)} [${resolved.photoId}].mp4`
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
                            'User-Agent': MOBILE_UA,
                            Referer: 'https://www.kuaishou.com/',
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
            job.message = error instanceof Error ? error.message : String(error)
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

export const kuaishouEngine = new KuaishouEngine()
