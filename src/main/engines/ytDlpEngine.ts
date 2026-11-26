import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import { randomUUID } from 'node:crypto'
import {
    formatHeightLabel,
    getQualityOption,
    qualityToYtDlpFormat,
    type QualityValue,
} from '../../shared/quality'
import {
    extractAbsoluteFilePath,
    findDownloadedFile,
    resolveJobOutputDir,
} from '../utils/outputPath'
import { detectPlatform, type PlatformId } from '../../shared/platform'
import type {
    DownloadJob,
    DownloadRequest,
    ListResult,
    ParseRequest,
    VideoItem,
} from '../../shared/types'
import { resolveFfmpegDir, resolveYtDlpPath } from '../utils/paths'
import { killProcessTree } from '../utils/processTree'
import { withYtDlpProxyArgs } from '../utils/proxy'
import { getSettings } from '../settingsStore'

type JobListener = (job: DownloadJob) => void
type StopIntent = 'cancel' | 'pause'

const MAX_CONCURRENT = 2
const PARSE_TIMEOUT_MS = 120_000
const DEFAULT_JOB_TITLE = '视频下载'
const META_PREFIX = '__ZS_META__:'

function parseJsonBlob(text: string): Record<string, unknown> | null {
    const trimmed = text.trim()
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        return null
    }
    try {
        return JSON.parse(trimmed) as Record<string, unknown>
    } catch {
        return null
    }
}

function parseProgressPercent(line: string): number | null {
    const match = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/)
    if (match) {
        return Math.min(100, Math.max(0, Number(match[1])))
    }
    return null
}

function toVideoItem(
    entry: Record<string, unknown>,
    index: number,
    platform: PlatformId,
    fallbackUrl: string,
): VideoItem {
    const id = String(entry.id ?? entry.display_id ?? entry.url ?? index)
    const webpageUrl = entry.webpage_url || entry.url || fallbackUrl
    return {
        index,
        guid: id,
        title: String(entry.title ?? entry.fulltitle ?? `视频 ${index}`),
        time: entry.upload_date ? String(entry.upload_date) : undefined,
        length: typeof entry.duration === 'number' ? entry.duration : undefined,
        channel: entry.uploader || entry.channel ? String(entry.uploader ?? entry.channel) : undefined,
        image: entry.thumbnail ? String(entry.thumbnail) : undefined,
        platform,
        url: String(webpageUrl),
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

export class YtDlpEngine {
    private parseProcess: ChildProcess | null = null
    private parseCancelled = false
    private readonly jobs = new Map<string, DownloadJob>()
    private readonly customTitles = new Set<string>()
    private readonly processes = new Map<string, ChildProcess>()
    private readonly runSeq = new Map<string, number>()
    private readonly stopIntents = new Map<string, StopIntent>()
    private readonly queue: string[] = []
    private readonly running = new Set<string>()
    private readonly listeners = new Set<JobListener>()

    onJob(listener: JobListener): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    getJobs(): DownloadJob[] {
        return Array.from(this.jobs.values()).sort((a, b) => b.startedAt - a.startedAt)
    }

    cancelActive(): void {
        this.cancelParse()
        for (const job of this.jobs.values()) {
            if (isActiveState(job.state) || job.state === 'paused') {
                this.stopJob(job.id, 'cancel')
            }
        }
    }

    cancelParse(): void {
        this.parseCancelled = true
        if (this.parseProcess) {
            const proc = this.parseProcess
            this.parseProcess = null
            killProcessTree(proc)
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

        const child = this.processes.get(jobId)
        if (child) {
            this.stopIntents.set(jobId, intent)
            this.processes.delete(jobId)
            killProcessTree(child)
        }

        if (isActiveState(job.state) || job.state === 'paused') {
            job.state = intent === 'pause' ? 'paused' : 'cancelled'
            job.message = intent === 'pause' ? '已暂停，可随时继续' : '已取消'
            job.finishedAt = intent === 'cancel' ? Date.now() : undefined
            this.emit(job)
            return true
        }

        return Boolean(child)
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

    private spawnYtDlp(
        args: string[],
        onLine?: (line: string) => void,
    ): { child: ChildProcess; done: Promise<{ code: number; stdout: string; stderr: string }> } {
        const exe = resolveYtDlpPath()
        const fullArgs = ['--encoding', 'utf-8', ...args]
        const child = spawn(exe, fullArgs, {
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: {
                ...process.env,
                PYTHONIOENCODING: 'utf-8',
                PYTHONUTF8: '1',
            },
        })

        const done = new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
            let stdout = ''
            let stderr = ''
            const stdoutRl = createInterface({ input: child.stdout })
            stdoutRl.on('line', (line) => {
                stdout += `${line}\n`
                onLine?.(line)
            })
            stdoutRl.on('error', () => {
                // 进程树被强制终止时可能触发管道关闭错误，直接忽略
            })

            const stderrRl = createInterface({ input: child.stderr })
            stderrRl.on('line', (line) => {
                stderr += `${line}\n`
                onLine?.(line)
            })
            stderrRl.on('error', () => {
                // ignore
            })

            child.on('error', (error) => {
                reject(error)
            })

            child.on('close', (code) => {
                resolve({ code: code ?? 1, stdout, stderr })
            })
        })

        return { child, done }
    }

    async listVideos(request: ParseRequest): Promise<ListResult> {
        if (this.parseProcess) {
            this.cancelParse()
        }

        this.parseCancelled = false
        const platform = detectPlatform(request.url)
        const args = withYtDlpProxyArgs([
            '-J',
            '--flat-playlist',
            '--no-download',
            '--no-warnings',
            '--ignore-no-formats-error',
            '--socket-timeout',
            '30',
            request.url,
        ])

        const { child, done } = this.spawnYtDlp(args)
        this.parseProcess = child

        let timedOut = false
        const timeoutId = setTimeout(() => {
            timedOut = true
            this.parseCancelled = true
            if (this.parseProcess === child) {
                this.parseProcess = null
            }
            killProcessTree(child)
        }, PARSE_TIMEOUT_MS)

        try {
            const { code, stdout, stderr } = await done
            if (this.parseCancelled) {
                throw new Error(
                    timedOut
                        ? '解析超时（超过 2 分钟）。可能是网络较慢、链接无效，或需要开启代理。'
                        : '解析已取消',
                )
            }

            const payload = parseJsonBlob(stdout)
            if (!payload) {
                throw new Error(stderr.trim() || `解析失败（退出码 ${code}）`)
            }

            const videos: VideoItem[] = []
            const entries = Array.isArray(payload.entries) ? payload.entries : null
            if (entries && entries.length > 0) {
                entries.forEach((entry, index) => {
                    if (!entry || typeof entry !== 'object') {
                        return
                    }
                    videos.push(
                        toVideoItem(entry as Record<string, unknown>, index + 1, platform, request.url),
                    )
                })
            } else {
                videos.push(toVideoItem(payload, 1, platform, request.url))
            }

            if (code !== 0 && videos.length === 0) {
                throw new Error(stderr.trim() || `解析失败（退出码 ${code}）`)
            }

            return { videos, rawCount: videos.length, platform }
        } finally {
            clearTimeout(timeoutId)
            if (this.parseProcess === child) {
                this.parseProcess = null
            }
            this.parseCancelled = false
        }
    }

    async download(request: DownloadRequest): Promise<DownloadJob> {
        const settings = getSettings()
        const quality = (request.quality ?? settings.quality) as QualityValue
        const targetUrl = request.url
        if (!targetUrl) {
            throw new Error('请提供视频链接')
        }

        const platform = request.platform ?? detectPlatform(targetUrl)
        const explicitTitle = request.title?.trim()
        const title = explicitTitle || DEFAULT_JOB_TITLE
        const jobId = randomUUID()
        if (explicitTitle) {
            this.customTitles.add(jobId)
        }

        const outputDir = resolveJobOutputDir(settings, platform)
        const job: DownloadJob = {
            id: jobId,
            title,
            platform,
            guid: request.guid,
            url: targetUrl,
            quality,
            qualityLabel: getQualityOption(quality).label,
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
        while (this.running.size < MAX_CONCURRENT && this.queue.length > 0) {
            const nextIndex = this.queue.findIndex((id) => !this.running.has(id))
            if (nextIndex < 0) {
                break
            }
            const [jobId] = this.queue.splice(nextIndex, 1)
            const job = this.jobs.get(jobId)
            if (
                !job ||
                job.state === 'paused' ||
                job.state === 'cancelled' ||
                job.state === 'completed' ||
                job.state === 'failed'
            ) {
                continue
            }
            this.running.add(jobId)
            const seq = (this.runSeq.get(jobId) ?? 0) + 1
            this.runSeq.set(jobId, seq)

            void this.runDownloadJob(jobId, seq).finally(() => {
                if (this.runSeq.get(jobId) === seq) {
                    this.running.delete(jobId)
                    this.processes.delete(jobId)
                }
                void this.pump()
            })
        }
    }

    private async runDownloadJob(jobId: string, seq: number): Promise<void> {
        const job = this.jobs.get(jobId)
        if (!job || !job.url) {
            return
        }

        const isStale = (): boolean =>
            !this.jobs.has(jobId) ||
            this.runSeq.get(jobId) !== seq ||
            this.stopIntents.has(jobId) ||
            job.state === 'paused' ||
            job.state === 'cancelled'

        const settings = getSettings()
        const quality = job.quality
        const platform = job.platform ?? detectPlatform(job.url)
        const outputDir = job.outputDir || resolveJobOutputDir(settings, platform)
        job.outputDir = outputDir
        const outputTemplate = `${outputDir}/%(title).180B [%(id)s].%(ext)s`
        const resume = job.progress > 0 || Boolean(job.outputPath)

        const args = withYtDlpProxyArgs([
            job.url,
            '-f',
            qualityToYtDlpFormat(quality),
            ...(settings.remuxMp4 ? ['--merge-output-format', 'mp4'] : []),
            '--ffmpeg-location',
            resolveFfmpegDir(),
            '-o',
            outputTemplate,
            '--no-mtime',
            '--newline',
            '--print',
            `before_dl:${META_PREFIX}%(height)s\t%(id)s\t%(title)s`,
            '--print',
            'after_move:filepath',
            '-N',
            String(Math.min(16, Math.max(1, settings.threads))),
            '--retries',
            '5',
            '--fragment-retries',
            '5',
            '--socket-timeout',
            '30',
        ])

        if (resume) {
            args.push('--continue')
        }

        if (
            platform === 'douyin' ||
            platform === 'tiktok' ||
            platform === 'twitter' ||
            platform === 'instagram'
        ) {
            args.push('--no-check-certificates')
        }

        try {
            job.state = 'resolving'
            job.message = '正在解析视频信息…'
            this.emit(job)

            let streamIndex = 0
            let lastRawPercent = 0
            let lastEmitAt = 0

            const { child, done } = this.spawnYtDlp(args, (line) => {
                if (isStale()) {
                    return
                }
                const trimmed = line.trim()
                if (trimmed.startsWith(META_PREFIX)) {
                    const metaBody = trimmed.slice(META_PREFIX.length)
                    const [heightRaw, idRaw, ...titleParts] = metaBody.split('\t')
                    const heightNum = Number(heightRaw)
                    if (Number.isFinite(heightNum) && heightNum > 0) {
                        const label = formatHeightLabel(heightNum)
                        if (label) {
                            job.qualityLabel = label
                        }
                    }
                    if (idRaw && idRaw !== 'NA' && !job.guid) {
                        job.guid = idRaw.trim()
                    }
                    const resolvedTitle = titleParts.join('\t').trim()
                    if (
                        resolvedTitle &&
                        resolvedTitle !== 'NA' &&
                        !this.customTitles.has(jobId)
                    ) {
                        job.title = resolvedTitle
                    }
                    this.emit(job)
                    return
                }

                const absolutePath = extractAbsoluteFilePath(trimmed)
                if (absolutePath) {
                    job.outputPath = absolutePath
                    this.emit(job)
                    return
                }

                const destMatch = line.match(/\[download\] Destination:\s*(.+)$/)
                if (destMatch?.[1]) {
                    const maybeDest = extractAbsoluteFilePath(destMatch[1])
                    if (maybeDest && !job.outputPath) {
                        job.outputPath = maybeDest
                    }
                    if (lastRawPercent > 80) {
                        streamIndex = Math.min(streamIndex + 1, 1)
                        lastRawPercent = 0
                    }
                    job.state = 'downloading'
                    job.message = streamIndex === 0 ? '正在下载视频流…' : '正在下载音频流…'
                    this.emit(job)
                    return
                }

                if (line.includes('Downloading item')) {
                    job.state = 'downloading'
                    job.message = '正在下载视频流…'
                    this.emit(job)
                }

                const percent = parseProgressPercent(line)
                if (percent !== null) {
                    if (percent + 25 < lastRawPercent) {
                        streamIndex = Math.min(streamIndex + 1, 1)
                    }
                    lastRawPercent = percent
                    const overall =
                        streamIndex === 0
                            ? Math.floor(percent * 0.55)
                            : Math.floor(55 + percent * 0.4)
                    job.state = 'downloading'
                    job.progress = Math.max(job.progress, Math.min(94, overall))
                    job.message = streamIndex === 0 ? '正在下载视频流…' : '正在下载音频流…'
                    const now = Date.now()
                    if (now - lastEmitAt > 200 || percent >= 99) {
                        lastEmitAt = now
                        this.emit(job)
                    }
                    return
                }
                if (
                    line.includes('[Merger]') ||
                    line.includes('[ExtractAudio]') ||
                    line.includes('[Fixup')
                ) {
                    job.state = 'concatenating'
                    job.progress = Math.max(job.progress, 96)
                    job.message = '正在合并音视频，请稍候…'
                    this.emit(job)
                }
                if (
                    line.includes('has already been downloaded') ||
                    line.includes('Deleting original file')
                ) {
                    job.progress = Math.max(job.progress, 99)
                    job.message = '即将完成…'
                    this.emit(job)
                }
            })

            if (isStale()) {
                killProcessTree(child)
                return
            }

            this.processes.set(jobId, child)
            const { code, stderr } = await done

            if (!this.jobs.has(jobId) || this.runSeq.get(jobId) !== seq) {
                return
            }

            const intent = this.stopIntents.get(jobId)
            this.stopIntents.delete(jobId)
            const currentState = job.state as DownloadJob['state']

            if (intent === 'pause' || currentState === 'paused') {
                job.state = 'paused'
                job.message = '已暂停，可随时继续'
                this.emit(job)
                return
            }
            if (intent === 'cancel' || currentState === 'cancelled') {
                job.state = 'cancelled'
                job.message = '已取消'
                job.finishedAt = job.finishedAt ?? Date.now()
                this.emit(job)
                return
            }

            if (code === 0) {
                job.state = 'completed'
                job.progress = 100
                job.message = undefined
                job.finishedAt = Date.now()
                const resolved = findDownloadedFile(outputDir, {
                    title: job.title,
                    guid: job.guid,
                    preferredPath: job.outputPath,
                    startedAt: job.startedAt,
                    allowRecentFallback: true,
                })
                if (resolved) {
                    job.outputPath = resolved
                }
                this.emit(job)
            } else {
                job.state = 'failed'
                job.message =
                    stderr
                        .trim()
                        .split('\n')
                        .filter(Boolean)
                        .slice(-3)
                        .join('\n') || `下载失败（退出码 ${code}）`
                job.finishedAt = Date.now()
                this.emit(job)
            }
        } catch (error) {
            if (!this.jobs.has(jobId) || this.runSeq.get(jobId) !== seq) {
                return
            }
            const intent = this.stopIntents.get(jobId)
            this.stopIntents.delete(jobId)
            const currentState = job.state as DownloadJob['state']
            if (intent === 'pause' || currentState === 'paused') {
                job.state = 'paused'
                job.message = '已暂停，可随时继续'
                this.emit(job)
                return
            }
            if (intent === 'cancel' || currentState === 'cancelled') {
                job.state = 'cancelled'
                job.message = '已取消'
                job.finishedAt = job.finishedAt ?? Date.now()
                this.emit(job)
                return
            }
            job.state = 'failed'
            job.message = error instanceof Error ? error.message : String(error)
            job.finishedAt = Date.now()
            this.emit(job)
        }
    }

    removeJob(jobId: string): boolean {
        const existed = this.jobs.has(jobId)
        if (!existed) {
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

    patchJob(jobId: string, patch: Partial<DownloadJob>): boolean {
        const job = this.jobs.get(jobId)
        if (!job) {
            return false
        }
        Object.assign(job, patch)
        this.emit(job)
        return true
    }
}

export const ytDlpEngine = new YtDlpEngine()
