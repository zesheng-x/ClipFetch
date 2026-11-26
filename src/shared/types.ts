import type { PlatformId } from './platform'
import type { QualityValue } from './quality'

export interface VideoItem {
    index: number
    /** 平台侧唯一标识；央视网为 GUID，其它平台多为视频 ID 或 URL */
    guid: string
    title: string
    time?: string
    length?: number
    channel?: string
    image?: string
    highlight?: boolean
    listType?: string
    brief?: string
    platform?: PlatformId
    /** 列表项对应的可下载 URL（yt-dlp / 快手） */
    url?: string
}

export interface ListResult {
    videos: VideoItem[]
    rawCount: number
    platform: PlatformId
}

export interface AppSettings {
    outputDir: string
    quality: QualityValue
    threads: number
    remuxMp4: boolean
    /** 是否在保存目录下按平台分子文件夹（如 保存目录/抖音） */
    organizeByPlatform: boolean
    /** 是否启用 HTTP/HTTPS/SOCKS 代理（油管 / X 等海外站常用） */
    proxyEnabled: boolean
    /** 代理地址，如 http://127.0.0.1:7897 */
    proxyUrl: string
}

export interface OutputDirValidation {
    valid: boolean
    normalizedPath: string
    reason?: string
}

export interface AppInfo {
    name: string
    version: string
    defaultOutputDir: string
    iconDataUrl?: string
}

export type JobState =
    | 'queued'
    | 'resolving'
    | 'downloading'
    | 'concatenating'
    | 'decrypting'
    | 'paused'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'skipped'

export interface DownloadJob {
    id: string
    title: string
    platform?: PlatformId
    guid?: string
    url?: string
    select?: string
    quality: QualityValue
    /** 实际下载清晰度文案，如「约 1080p」；优先于 quality 选项名展示 */
    qualityLabel?: string
    /** 任务创建时锁定的保存目录，不受后续设置变更影响 */
    outputDir?: string
    /** 完成后的本地文件绝对路径（以实际落盘位置为准） */
    outputPath?: string
    progress: number
    state: JobState
    message?: string
    startedAt: number
    finishedAt?: number
}

export interface ParseRequest {
    url: string
    fromMonth?: string
    toMonth?: string
    includeHighlights?: boolean
}

export interface DownloadRequest {
    /** 单集直链下载时使用 */
    url?: string
    /** 已知 GUID / 视频 ID 时使用 */
    guid?: string
    title?: string
    /** 栏目/专辑下载时的选择：latest / all / 1,3,5 */
    select?: string
    quality?: QualityValue
    platform?: PlatformId
}

export interface EngineEvent {
    type: 'job' | 'list' | 'log' | 'error' | 'complete'
    payload: unknown
}
