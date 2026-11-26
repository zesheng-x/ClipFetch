/** 应用识别的视频平台 */
export type PlatformId =
    | 'cctv'
    | 'bilibili'
    | 'douyin'
    | 'tiktok'
    | 'kuaishou'
    | 'youtube'
    | 'twitter'
    | 'instagram'
    | 'facebook'
    | 'xiaohongshu'
    | 'weibo'
    | 'ixigua'
    | 'reddit'
    | 'vimeo'
    | 'twitch'
    | 'acfun'
    | 'unknown'

export interface PlatformInfo {
    id: PlatformId
    label: string
    engine: 'cctv-dl' | 'yt-dlp' | 'short-video' | 'kuaishou' | 'none'
    /** 是否支持栏目/合集列表解析 */
    supportsList: boolean
    /** 海外站点，建议开启代理 */
    needsProxy?: boolean
    hint: string
}

export const PLATFORM_CATALOG: PlatformInfo[] = [
    {
        id: 'cctv',
        label: '央视网',
        engine: 'cctv-dl',
        supportsList: true,
        hint: '支持栏目 / 专辑 / 单集；可按月份筛选',
    },
    {
        id: 'bilibili',
        label: '哔哩哔哩',
        engine: 'yt-dlp',
        supportsList: true,
        hint: '支持单集、多 P、番剧等常见链接',
    },
    {
        id: 'douyin',
        label: '抖音',
        engine: 'short-video',
        supportsList: false,
        hint: '免登录 · 无水印：粘贴分享短链或整段分享文案即可',
    },
    {
        id: 'tiktok',
        label: 'TikTok',
        engine: 'short-video',
        supportsList: false,
        needsProxy: true,
        hint: '免登录 · 无水印；国内通常需在设置中开启代理',
    },
    {
        id: 'kuaishou',
        label: '快手',
        engine: 'kuaishou',
        supportsList: false,
        hint: '免登录：支持分享短链与 short-video 详情页',
    },
    {
        id: 'youtube',
        label: 'YouTube',
        engine: 'yt-dlp',
        supportsList: true,
        needsProxy: true,
        hint: '支持视频 / Shorts / 播放列表；国内需代理',
    },
    {
        id: 'twitter',
        label: 'X',
        engine: 'yt-dlp',
        supportsList: false,
        needsProxy: true,
        hint: '支持 x.com / twitter.com 帖子视频；国内需代理',
    },
    {
        id: 'instagram',
        label: 'Instagram',
        engine: 'yt-dlp',
        supportsList: false,
        needsProxy: true,
        hint: '支持 Reels / 帖子视频；国内需代理，部分内容可能需登录',
    },
    {
        id: 'facebook',
        label: 'Facebook',
        engine: 'yt-dlp',
        supportsList: false,
        needsProxy: true,
        hint: '支持公开视频 / Reel；国内需代理',
    },
    {
        id: 'xiaohongshu',
        label: '小红书',
        engine: 'yt-dlp',
        supportsList: false,
        hint: '支持小红书笔记视频链接',
    },
    {
        id: 'weibo',
        label: '微博',
        engine: 'yt-dlp',
        supportsList: false,
        hint: '支持微博视频页链接',
    },
    {
        id: 'ixigua',
        label: '西瓜视频',
        engine: 'yt-dlp',
        supportsList: false,
        hint: '支持西瓜视频详情页链接',
    },
    {
        id: 'reddit',
        label: 'Reddit',
        engine: 'yt-dlp',
        supportsList: false,
        needsProxy: true,
        hint: '支持 Reddit 视频帖；国内需代理',
    },
    {
        id: 'vimeo',
        label: 'Vimeo',
        engine: 'yt-dlp',
        supportsList: false,
        needsProxy: true,
        hint: '支持 Vimeo 公开视频；国内通常需代理',
    },
    {
        id: 'twitch',
        label: 'Twitch',
        engine: 'yt-dlp',
        supportsList: false,
        needsProxy: true,
        hint: '支持 Twitch 回放 / 剪辑；国内需代理',
    },
    {
        id: 'acfun',
        label: 'AcFun',
        engine: 'yt-dlp',
        supportsList: true,
        hint: '支持 AcFun 视频页链接',
    },
]

const UNKNOWN_PLATFORM: PlatformInfo = {
    id: 'unknown',
    label: '未知平台',
    engine: 'none',
    supportsList: false,
    hint: '暂未识别该链接，请确认是否为已支持平台',
}

export function getPlatformInfo(id: PlatformId): PlatformInfo {
    return PLATFORM_CATALOG.find((item) => item.id === id) ?? UNKNOWN_PLATFORM
}

/** 用于错误提示的平台列表文案 */
export function supportedPlatformsText(): string {
    return PLATFORM_CATALOG.map((item) => item.label).join('、')
}

/** 海外站无代理时的引导文案（卡住 / 失败时再提示） */
export const OVERSEAS_PROXY_TIP =
    '海外网站视频在国内网络环境下可能无法下载。如需使用，请开启代理（默认 http://127.0.0.1:7897）。'

/** 从 URL 或分享文案中识别平台 */
export function detectPlatform(rawUrl: string): PlatformId {
    const text = rawUrl.trim()
    if (!text) {
        return 'unknown'
    }

    // 分享文案里常夹杂中文，先尽量抽出真实链接
    const extracted =
        text.match(/https?:\/\/[^\s，。、）)】\]"'<>]+/i)?.[0]?.replace(/[.,;:!?]+$/g, '') || text

    let host = ''
    let path = ''
    try {
        const normalized = /^https?:\/\//i.test(extracted) ? extracted : `https://${extracted}`
        const parsed = new URL(normalized)
        host = parsed.hostname.toLowerCase()
        path = parsed.pathname.toLowerCase()
    } catch {
        return detectPlatformFromText(text.toLowerCase())
    }

    if (host.includes('cctv.com') || host.includes('cntv.cn') || host.includes('cctv.cn')) {
        return 'cctv'
    }
    if (
        host.includes('bilibili.com') ||
        host === 'b23.tv' ||
        host.endsWith('.b23.tv') ||
        host.includes('biliapi')
    ) {
        return 'bilibili'
    }
    if (host.includes('douyin.com') || host.includes('iesdouyin.com') || host.includes('douyinpic.com')) {
        return 'douyin'
    }
    if (host.includes('tiktok.com') || host.includes('tiktokv.com') || host.includes('tiktokcdn.com')) {
        return 'tiktok'
    }
    if (
        host.includes('kuaishou.com') ||
        host.includes('kuaishou.cn') ||
        host.includes('gifshow.com') ||
        host.includes('chenzhongtech.com')
    ) {
        return 'kuaishou'
    }
    if (
        host.includes('youtube.com') ||
        host === 'youtu.be' ||
        host.endsWith('.youtu.be') ||
        host.includes('youtube-nocookie.com') ||
        host.includes('youtubekids.com')
    ) {
        return 'youtube'
    }
    if (host === 'x.com' || host.endsWith('.x.com') || host.includes('twitter.com') || host.includes('t.co')) {
        return 'twitter'
    }
    if (host.includes('instagram.com') || host.includes('instagr.am')) {
        return 'instagram'
    }
    if (host.includes('facebook.com') || host.includes('fb.watch') || host.includes('fb.com')) {
        return 'facebook'
    }
    if (
        host.includes('xiaohongshu.com') ||
        host.includes('xhslink.com') ||
        host === 'xhs.cn' ||
        host.endsWith('.xhs.cn')
    ) {
        return 'xiaohongshu'
    }
    if (host.includes('weibo.com') || host.includes('weibo.cn') || host.includes('video.weibo.com')) {
        return 'weibo'
    }
    if (host.includes('ixigua.com') || host.includes('toutiao.com') || host.includes('snssdk.com')) {
        // 头条系视频页常落到西瓜
        if (host.includes('ixigua.com') || path.includes('/video/') || path.includes('/w/')) {
            return 'ixigua'
        }
    }
    if (host.includes('reddit.com') || host.includes('redd.it') || host.includes('v.redd.it')) {
        return 'reddit'
    }
    if (host.includes('vimeo.com') || host.includes('player.vimeo.com')) {
        return 'vimeo'
    }
    if (host.includes('twitch.tv') || host.includes('clips.twitch.tv')) {
        return 'twitch'
    }
    if (host.includes('acfun.cn') || host.includes('aixifan.com')) {
        return 'acfun'
    }

    if (path.includes('/video/') && host.includes('douyin')) {
        return 'douyin'
    }

    return 'unknown'
}

function detectPlatformFromText(lower: string): PlatformId {
    if (lower.includes('cctv.com') || lower.includes('cntv.cn')) {
        return 'cctv'
    }
    if (lower.includes('bilibili.com') || lower.includes('b23.tv')) {
        return 'bilibili'
    }
    if (lower.includes('douyin.com') || lower.includes('iesdouyin.com')) {
        return 'douyin'
    }
    if (lower.includes('tiktok.com') || lower.includes('tiktokv.com')) {
        return 'tiktok'
    }
    if (lower.includes('kuaishou.com') || lower.includes('kuaishou.cn') || lower.includes('gifshow.com')) {
        return 'kuaishou'
    }
    if (lower.includes('youtube.com') || lower.includes('youtu.be')) {
        return 'youtube'
    }
    if (lower.includes('twitter.com') || lower.includes('://x.com') || lower.includes(' t.co/')) {
        return 'twitter'
    }
    if (lower.includes('instagram.com')) {
        return 'instagram'
    }
    if (lower.includes('facebook.com') || lower.includes('fb.watch')) {
        return 'facebook'
    }
    if (lower.includes('xiaohongshu.com') || lower.includes('xhslink.com')) {
        return 'xiaohongshu'
    }
    if (lower.includes('weibo.com') || lower.includes('weibo.cn')) {
        return 'weibo'
    }
    if (lower.includes('ixigua.com')) {
        return 'ixigua'
    }
    if (lower.includes('reddit.com') || lower.includes('redd.it')) {
        return 'reddit'
    }
    if (lower.includes('vimeo.com')) {
        return 'vimeo'
    }
    if (lower.includes('twitch.tv')) {
        return 'twitch'
    }
    if (lower.includes('acfun.cn')) {
        return 'acfun'
    }
    return 'unknown'
}
