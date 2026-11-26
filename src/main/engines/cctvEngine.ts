import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import { randomUUID } from 'node:crypto'
import { getQualityOption, toCctvQuality, type QualityValue } from '../../shared/quality'
import { findDownloadedFile, resolveJobOutputDir } from '../utils/outputPath'
import type {
    DownloadJob,
    DownloadRequest,
    ListResult,
    ParseRequest,
    VideoItem,
} from '../../shared/types'
import { resolveCctvDlPath } from '../utils/paths'
import { killProcessTree } from '../utils/processTree'
import { getSettings } from '../settingsStore'

type JobListener = (job: DownloadJob) => void
type StopIntent = 'cancel' | 'pause'

const PARSE_TIMEOUT_MS = 90_000

function currentYearMonth(): string {
    const now = new Date()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    return `${now.getFullYear()}${month}`
}

function previousYearMonth(): string {
    const now = new Date()
    now.setMonth(now.getMonth() - 1)
    const month = String(now.getMonth() + 1).padStart(2, '0')
    return `${now.getFullYear()}${month}`
}

function parseJsonLine(line: string): Record<string, unknown> | null {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) {
        return null
    }
    try {
        return JSON.parse(trimmed) as Record<string, unknown>
    } catch {
        return null
    }
}

function mapState(raw: unknown): DownloadJob['state'] {
    const value = String(raw ?? '')
    switch (value) {
        case 'queued':
        case 'resolving':
        case 'downloading':
        case 'concatenating':
        case 'decrypting':
        case 'paused':
        case 'completed':
        case 'failed':
        case 'cancelled':
        case 'skipped':
            return value
        default:
            return 'downloading'
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

export class CctvEngine {
    private parseProcess: ChildProcess | null = null
    private parseCancelled = false
    private readonly jobs = new Map<string, DownloadJob>()
    private readonly processes = new Map<string, ChildProcess>()
    private readonly runSeq = new Map<string, number>()
    private readonly stopIntents = new Map<string, StopIntent>()
    private readonly queue: string[] = []
    private readonly listeners = new Set<JobListener>()
    private runningJobId: string | null = null

    onJob(listener: JobListener): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    getJobs(): DownloadJob[] {
        return Array.from(this.jobs.values()).sort((a, b) => b.startedAt - a.startedAt)
    }

    cancelParse(): void {
        this.parseCancelled = true
        if (this.parseProcess) {
            const proc = this.parseProcess
            this.parseProcess = null
            killProcessTree(proc)
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
        if (!job || job.state !== 'paused') {
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

    private run(
        args: string[],
        onLine?: (line: string, obj: Record<string, unknown> | null) => void,
        bind?: { kind: 'parse'; timeoutMs?: number } | { kind: 'job'; jobId: string },
    ): Promise<{ code: number; stderr: string; timedOut: boolean }> {
        const exe = resolveCctvDlPath()
        return new Promise((resolve, reject) => {
            const child = spawn(exe, args, {
                windowsHide: true,
                stdio: ['ignore', 'pipe', 'pipe'],
            })

            let timedOut = false
            let timer: NodeJS.Timeout | null = null

            if (bind?.kind === 'parse') {
                this.parseProcess = child
                if (bind.timeoutMs && bind.timeoutMs > 0) {
                    timer = setTimeout(() => {
                        timedOut = true
                        this.parseCancelled = true
                        if (this.parseProcess === child) {
                            this.parseProcess = null
                        }
                        killProcessTree(child)
                    }, bind.timeoutMs)
                }
            } else if (bind?.kind === 'job') {
                this.processes.set(bind.jobId, child)
            }

            let stderr = ''
            const stdout = createInterface({ input: child.stdout })
            stdout.on('line', (line) => {
                const obj = parseJsonLine(line)
                onLine?.(line, obj)
            })
            stdout.on('error', () => {
                // ignore
            })

            child.stderr.on('data', (chunk: Buffer) => {
                stderr += chunk.toString('utf8')
            })
            child.stderr.on('error', () => {
                // ignore
            })

            child.on('error', (error) => {
                if (timer) {
                    clearTimeout(timer)
                }
                if (bind?.kind === 'parse' && this.parseProcess === child) {
                    this.parseProcess = null
                }
                if (bind?.kind === 'job' && this.processes.get(bind.jobId) === child) {
                    this.processes.delete(bind.jobId)
                }
                reject(error)
            })

            child.on('close', (code) => {
                if (timer) {
                    clearTimeout(timer)
                }
                if (bind?.kind === 'parse' && this.parseProcess === child) {
                    this.parseProcess = null
                }
                if (bind?.kind === 'job' && this.processes.get(bind.jobId) === child) {
                    this.processes.delete(bind.jobId)
                }
                resolve({ code: code ?? 1, stderr, timedOut })
            })
        })
    }

    async listVideos(request: ParseRequest): Promise<ListResult> {
        if (this.parseProcess) {
            this.cancelParse()
        }
        this.parseCancelled = false
        const fromMonth = request.fromMonth || previousYearMonth()
        const toMonth = request.toMonth || currentYearMonth()
        const args = [
            'list',
            request.url,
            '--json',
            '--from',
            fromMonth,
            '--to',
            toMonth,
        ]
        if (request.includeHighlights) {
            args.push('--include-highlights')
        }

        const videos: VideoItem[] = []
        const { code, stderr, timedOut } = await this.run(
            args,
            (_line, obj) => {
                if (!obj || obj.event !== 'video') {
                    return
                }
                videos.push({
                    index: Number(obj.index ?? videos.length + 1),
                    guid: String(obj.guid ?? ''),
                    title: String(obj.title ?? '未命名视频'),
                    time: obj.time ? String(obj.time) : undefined,
                    length: typeof obj.length === 'number' ? obj.length : undefined,
                    channel: obj.channel ? String(obj.channel) : undefined,
                    image: obj.image ? String(obj.image) : undefined,
                    highlight: Boolean(obj.highlight),
                    listType: obj.listType ? String(obj.listType) : undefined,
                    brief: obj.brief ? String(obj.brief) : undefined,
                    platform: 'cctv',
                })
            },
            { kind: 'parse', timeoutMs: PARSE_TIMEOUT_MS },
        )

        if (this.parseCancelled) {
            throw new Error(timedOut ? '央视网列表解析超时，请检查网络连接后重试' : '解析已取消')
        }

        if (code !== 0 && videos.length === 0) {
            throw new Error(stderr.trim() || `解析失败（退出码 ${code}）`)
        }

        return { videos, rawCount: videos.length, platform: 'cctv' }
    }

    async download(request: DownloadRequest): Promise<DownloadJob> {
        const settings = getSettings()
        const quality = (request.quality ?? settings.quality) as QualityValue
        const title = request.title?.trim() || '央视视频'
        if (!request.guid && !request.url) {
            throw new Error('请提供视频链接或 GUID')
        }

        const jobId = randomUUID()
        const outputDir = resolveJobOutputDir(settings, 'cctv')
        const job: DownloadJob = {
            id: jobId,
            title,
            platform: 'cctv',
            guid: request.guid,
            url: request.url,
            select: request.select,
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
        if (!job) {
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
        const outputDir = job.outputDir || resolveJobOutputDir(settings, 'cctv')
        job.outputDir = outputDir
        const args = [
            'download',
            '--json',
            '--output',
            outputDir,
            '--quality',
            String(toCctvQuality(quality)),
            '--threads',
            String(settings.threads),
            '--on-existing',
            'rename',
        ]
        if (settings.remuxMp4) {
            args.push('--mp4')
        } else {
            args.push('--no-mp4')
        }

        if (job.guid) {
            args.push('--guid', job.guid, '--title', job.title)
        } else if (job.url) {
            args.push(job.url)
            if (job.select) {
                args.push('--select', job.select)
            }
        } else {
            job.state = 'failed'
            job.message = '请提供视频链接或 GUID'
            job.finishedAt = Date.now()
            this.emit(job)
            return
        }

        try {
            job.state = 'resolving'
            job.message = '正在准备下载…'
            this.emit(job)

            const { code, stderr } = await this.run(
                args,
                (_line, obj) => {
                    if (!obj || isStale()) {
                        return
                    }
                    if (obj.event === 'job' || obj.event === 'job_finished') {
                        const pathFromEvent = [
                            obj.path,
                            obj.outputPath,
                            obj.file,
                            obj.filepath,
                            obj.output,
                        ].find((value) => typeof value === 'string' && String(value).trim())
                        const next: DownloadJob = {
                            ...job,
                            title: String(obj.title ?? job.title),
                            progress: typeof obj.progress === 'number' ? obj.progress : job.progress,
                            state: mapState(obj.state),
                            message: obj.message ? String(obj.message) : job.message,
                            outputPath: pathFromEvent
                                ? String(pathFromEvent)
                                : job.outputPath,
                        }
                        if (
                            next.state === 'completed' ||
                            next.state === 'failed' ||
                            next.state === 'cancelled'
                        ) {
                            next.finishedAt = Date.now()
                        }
                        Object.assign(job, next)
                        this.emit(job)
                    }
                    if (obj.event === 'download_complete') {
                        const failed = Number(obj.failed ?? 0)
                        if (failed > 0 && job.state !== 'failed') {
                            job.state = 'failed'
                            job.message = `下载失败 ${failed} 个`
                            job.finishedAt = Date.now()
                            this.emit(job)
                        }
                    }
                },
                { kind: 'job', jobId },
            )

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

            const settledState = job.state as DownloadJob['state']
            if (code !== 0 && settledState !== 'completed' && settledState !== 'cancelled') {
                job.state = 'failed'
                job.message = stderr.trim() || `下载失败（退出码 ${code}）`
                job.finishedAt = Date.now()
                this.emit(job)
            } else if (
                settledState === 'queued' ||
                settledState === 'downloading' ||
                settledState === 'resolving' ||
                settledState === 'concatenating' ||
                settledState === 'decrypting' ||
                settledState === 'completed'
            ) {
                if (settledState !== 'completed') {
                    job.state = code === 0 ? 'completed' : 'failed'
                    job.progress = code === 0 ? 100 : job.progress
                    job.finishedAt = Date.now()
                    if (code !== 0) {
                        job.message = stderr.trim() || `下载失败（退出码 ${code}）`
                    }
                }
                if (job.state === 'completed') {
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
                }
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
        this.runSeq.delete(jobId)
        this.stopIntents.delete(jobId)
        const queuedIndex = this.queue.indexOf(jobId)
        if (queuedIndex >= 0) {
            this.queue.splice(queuedIndex, 1)
        }
        return true
    }
}

export const cctvEngine = new CctvEngine()
