import type { PlatformId } from '../../../shared/platform'
import type { DownloadJob } from '../../../shared/types'

export function formatDuration(seconds?: number): string {
    if (!seconds || seconds <= 0) {
        return '-'
    }
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    if (h > 0) {
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }
    return `${m}:${String(s).padStart(2, '0')}`
}

export function stateLabel(state: DownloadJob['state']): string {
    const map: Record<DownloadJob['state'], string> = {
        queued: '排队中',
        resolving: '解析中',
        downloading: '下载中',
        concatenating: '合并封装',
        decrypting: '解密中',
        paused: '已暂停',
        completed: '已完成',
        failed: '下载失败',
        cancelled: '已取消',
        skipped: '已跳过',
    }
    return map[state]
}

export function stateBadgeClass(state: DownloadJob['state']): string {
    switch (state) {
        case 'completed':
            return 'bg-[var(--success-bg)] text-[var(--success)] border-[var(--success-border)]'
        case 'failed':
            return 'bg-[var(--danger-bg)] text-[var(--danger)] border-[var(--danger-border)]'
        case 'paused':
            return 'bg-[var(--caution-bg)] text-[var(--caution)] border-[var(--caution-border)]'
        case 'cancelled':
        case 'skipped':
            return 'bg-slate-100 text-[var(--ink-secondary)] border-slate-200'
        default:
            return 'bg-[var(--accent-soft)] text-[var(--accent-text)] border-[var(--accent-border)]'
    }
}

export function isJobActive(state: DownloadJob['state']): boolean {
    return (
        state === 'queued' ||
        state === 'resolving' ||
        state === 'downloading' ||
        state === 'concatenating' ||
        state === 'decrypting'
    )
}

export function isJobIndeterminate(job: DownloadJob): boolean {
    if (job.state === 'resolving' || job.state === 'concatenating' || job.state === 'decrypting') {
        return true
    }
    return job.state === 'queued' && job.progress <= 0
}

export function canPauseJob(state: DownloadJob['state']): boolean {
    return isJobActive(state)
}

export function canResumeJob(state: DownloadJob['state']): boolean {
    return state === 'paused'
}

export function canRetryJob(job: DownloadJob): boolean {
    return (
        (job.state === 'failed' || job.state === 'cancelled') &&
        Boolean(job.url || job.guid)
    )
}

export function currentMonth(): string {
    const now = new Date()
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function monthsAgo(offset: number): string {
    const now = new Date()
    now.setMonth(now.getMonth() - offset)
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function placeholderFor(platformId: PlatformId): string {
    switch (platformId) {
        case 'cctv':
            return '粘贴 tv.cctv.com 栏目 / 专辑 / 单集链接'
        case 'bilibili':
            return '粘贴 bilibili.com 或 b23.tv 视频链接'
        case 'douyin':
            return '粘贴抖音分享短链，或直接粘贴整段分享文案'
        case 'tiktok':
            return '粘贴 TikTok 视频链接（国内网络请先开启代理）'
        case 'kuaishou':
            return '粘贴快手分享短链或 short-video 详情页链接'
        case 'youtube':
            return '粘贴 YouTube / youtu.be 视频或列表链接（国内请开启代理）'
        case 'twitter':
            return '粘贴 X / Twitter 帖子链接（国内请开启代理）'
        case 'instagram':
            return '粘贴 Instagram Reels / 帖子链接'
        case 'facebook':
            return '粘贴 Facebook 视频 / Reel 链接'
        case 'xiaohongshu':
            return '粘贴小红书笔记链接或分享短链'
        case 'weibo':
            return '粘贴微博视频页链接'
        case 'ixigua':
            return '粘贴西瓜视频详情页链接'
        case 'reddit':
            return '粘贴 Reddit 视频帖链接'
        case 'vimeo':
            return '粘贴 Vimeo 视频链接'
        case 'twitch':
            return '粘贴 Twitch 回放 / 剪辑链接'
        case 'acfun':
            return '粘贴 AcFun 视频链接'
        default:
            return '粘贴视频链接或分享文案（B站 / 抖音 / 央视网 / 快手 / YouTube / X / 小红书等）'
    }
}
