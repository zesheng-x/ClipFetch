import { existsSync } from 'node:fs'
import { detectPlatform, getPlatformInfo, supportedPlatformsText, type PlatformId } from '../shared/platform'
import type { DownloadJob, DownloadRequest, ListResult, ParseRequest } from '../shared/types'
import { cctvEngine } from './engines/cctvEngine'
import { kuaishouEngine } from './engines/kuaishouEngine'
import { collectJobRelatedFiles, findDownloadedFile } from './utils/outputPath'
import { extractFirstUrl } from './parsers/urlExtract'
import { shortVideoEngine } from './engines/shortVideoEngine'
import { ytDlpEngine } from './engines/ytDlpEngine'

type JobListener = (jobs: DownloadJob[]) => void

function normalizeRequestUrl(url?: string): string | undefined {
    if (!url) {
        return undefined
    }
    return extractFirstUrl(url) || url.trim()
}

function resolvePlatform(request: { url?: string; platform?: PlatformId; guid?: string }): PlatformId {
    if (request.platform && request.platform !== 'unknown') {
        return request.platform
    }
    if (request.url) {
        return detectPlatform(normalizeRequestUrl(request.url) || request.url)
    }
    if (request.guid) {
        return 'cctv'
    }
    return 'unknown'
}

function unsupportedError(): Error {
    return new Error(`暂不支持该链接。当前支持：${supportedPlatformsText()}。`)
}

class DownloadManager {
    private readonly listeners = new Set<JobListener>()
    private parseSeq = 0

    constructor() {
        const notify = (): void => this.emit()
        cctvEngine.onJob(notify)
        ytDlpEngine.onJob(notify)
        kuaishouEngine.onJob(notify)
        shortVideoEngine.onJob(notify)
    }

    onJobs(listener: JobListener): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    private emit(): void {
        const jobs = this.getJobs()
        for (const listener of this.listeners) {
            listener(jobs)
        }
    }

    getJobs(): DownloadJob[] {
        return [
            ...cctvEngine.getJobs(),
            ...ytDlpEngine.getJobs(),
            ...kuaishouEngine.getJobs(),
            ...shortVideoEngine.getJobs(),
        ].sort((a, b) => b.startedAt - a.startedAt)
    }

    cancelActive(): void {
        cctvEngine.cancelActive()
        ytDlpEngine.cancelActive()
        kuaishouEngine.cancelActive()
        shortVideoEngine.cancelActive()
    }

    cancelParse(): void {
        this.parseSeq += 1
        ytDlpEngine.cancelParse()
        cctvEngine.cancelParse()
        kuaishouEngine.cancelParse()
        shortVideoEngine.cancelParse()
    }

    pauseJob(jobId: string): boolean {
        return (
            ytDlpEngine.pauseJob(jobId) ||
            cctvEngine.pauseJob(jobId) ||
            kuaishouEngine.pauseJob(jobId) ||
            shortVideoEngine.pauseJob(jobId)
        )
    }

    resumeJob(jobId: string): boolean {
        return (
            ytDlpEngine.resumeJob(jobId) ||
            cctvEngine.resumeJob(jobId) ||
            kuaishouEngine.resumeJob(jobId) ||
            shortVideoEngine.resumeJob(jobId)
        )
    }

    cancelJob(jobId: string): boolean {
        return (
            ytDlpEngine.cancelJob(jobId) ||
            cctvEngine.cancelJob(jobId) ||
            kuaishouEngine.cancelJob(jobId) ||
            shortVideoEngine.cancelJob(jobId)
        )
    }

    removeJob(jobId: string): boolean {
        const removed =
            cctvEngine.removeJob(jobId) ||
            ytDlpEngine.removeJob(jobId) ||
            kuaishouEngine.removeJob(jobId) ||
            shortVideoEngine.removeJob(jobId)
        if (removed) {
            this.emit()
        }
        return removed
    }

    findJob(jobId: string): DownloadJob | undefined {
        return this.getJobs().find((job) => job.id === jobId)
    }

    /** 收集任务对应的成品文件及临时分片文件（.part / .ytdl） */
    resolveJobCleanupFiles(jobId: string): string[] {
        const job = this.findJob(jobId)
        if (!job) {
            return []
        }
        return collectJobRelatedFiles({
            outputDir: job.outputDir,
            outputPath: job.outputPath,
            guid: job.guid,
            title: job.title,
        })
    }

    /**
     * 解析任务对应的本地成品文件：优先用任务记录的绝对路径，
     * 找不到时按任务锁定目录 + GUID / 真实标题精确回找（不盲目取目录内其他文件）。
     */
    resolveJobFilePath(jobId: string): string {
        const job = this.findJob(jobId)
        if (!job) {
            throw new Error('任务不存在')
        }

        const found = findDownloadedFile(job.outputDir, {
            title: job.title,
            guid: job.guid,
            preferredPath: job.outputPath,
            allowRecentFallback: false,
        })

        if (found) {
            if (job.outputPath !== found) {
                this.patchJobOutputPath(job.id, found)
            }
            return found
        }

        const cleanRecorded = job.outputPath?.replace(/\.(?:part|ytdl)$/i, '')
        if (cleanRecorded) {
            throw new Error(`文件不存在或已被移动/删除：\n${cleanRecorded}`)
        }
        if (job.outputDir && existsSync(job.outputDir)) {
            throw new Error(`在下载目录中未找到该视频：\n${job.outputDir}`)
        }
        throw new Error('尚未拿到本地文件路径，请确认下载已完成')
    }

    private patchJobOutputPath(jobId: string, outputPath: string): void {
        const patched =
            ytDlpEngine.patchJob(jobId, { outputPath }) ||
            cctvEngine.patchJob(jobId, { outputPath }) ||
            kuaishouEngine.patchJob(jobId, { outputPath }) ||
            shortVideoEngine.patchJob(jobId, { outputPath })
        if (patched) {
            this.emit()
        }
    }

    async listVideos(request: ParseRequest): Promise<ListResult> {
        const normalizedUrl = normalizeRequestUrl(request.url) || request.url
        const platform = detectPlatform(normalizedUrl)
        const info = getPlatformInfo(platform)
        if (platform === 'unknown' || info.engine === 'none') {
            throw unsupportedError()
        }

        // 开始新解析前先清理上一次可能残留的解析任务，防止跨引擎竞态乱序
        this.cancelParse()
        const seq = ++this.parseSeq
        const nextRequest: ParseRequest = { ...request, url: normalizedUrl }

        let result: ListResult
        if (info.engine === 'cctv-dl') {
            result = await cctvEngine.listVideos(nextRequest)
        } else if (info.engine === 'kuaishou') {
            result = await kuaishouEngine.listVideos(nextRequest)
        } else if (info.engine === 'short-video') {
            result = await shortVideoEngine.listVideos(nextRequest)
        } else {
            result = await ytDlpEngine.listVideos(nextRequest)
        }

        if (seq !== this.parseSeq) {
            throw new Error('解析已取消')
        }
        return result
    }

    async download(request: DownloadRequest): Promise<DownloadJob> {
        const normalizedUrl = normalizeRequestUrl(request.url)
        const platform = resolvePlatform({ ...request, url: normalizedUrl || request.url })
        const info = getPlatformInfo(platform)
        if (platform === 'unknown' || info.engine === 'none') {
            throw unsupportedError()
        }

        const nextRequest: DownloadRequest = {
            ...request,
            url: normalizedUrl || request.url,
            platform,
        }

        if (info.engine === 'cctv-dl') {
            return cctvEngine.download(nextRequest)
        }
        if (info.engine === 'kuaishou') {
            return kuaishouEngine.download(nextRequest)
        }
        if (info.engine === 'short-video') {
            return shortVideoEngine.download(nextRequest)
        }
        return ytDlpEngine.download(nextRequest)
    }
}

export const downloadManager = new DownloadManager()
