/**
 * 抖音免登录无水印解析。
 * 思路参考公开实践：
 * 1) open.douyin.com 嵌入播放器 Origin 调用 web detail（无需 Cookie）
 * 2) 客户端 Feed 接口兜底（App UA，无需 Cookie / 签名）
 * 3) play 接口 watermark=0 再兜底高清直链
 */
import { proxiedFetch } from '../utils/proxy'
import { extractFirstUrl } from './urlExtract'

const MOBILE_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'

const DESKTOP_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const APP_UA =
    'com.ss.android.ugc.aweme/290101 (Linux; U; Android 12; zh_CN; SM-G988N; Build/SP1A.210812.016; Cronet/TTNetVersion:d1da0ea9 2023-01-13 QuicVersion:51879282 2022-12-07)'

const EMBED_ORIGIN = 'https://open.douyin.com'

const FEED_HOSTS = [
    'https://aweme.snssdk.com/aweme/v1/feed/',
    'https://aweme-hl.snssdk.com/aweme/v1/feed/',
    'https://api3-normal-c-hl.amemv.com/aweme/v1/feed/',
    'https://api5-normal-c-lq.amemv.com/aweme/v1/feed/',
    'https://api.amemv.com/aweme/v1/feed/',
]

export interface ShortVideoResolveResult {
    platform: 'douyin'
    id: string
    title: string
    author?: string
    cover?: string
    duration?: number
    height?: number
    videoUrl: string
    /** 可选备用直链 */
    backupUrls?: string[]
}

function findAwemeId(text: string): string | null {
    const patterns = [
        /\/(?:video|note|share\/video|share\/note|slides)\/(\d{6,})/i,
        /[?&](?:modal_id|aweme_id|item_ids?)=(\d{6,})/i,
        /(?:^|[^\d])(\d{15,22})(?:[^\d]|$)/,
    ]
    for (const pattern of patterns) {
        const match = text.match(pattern)
        if (match?.[1]) {
            return match[1]
        }
    }
    return null
}

export async function resolveDouyinAwemeId(input: string, signal?: AbortSignal): Promise<string> {
    const raw = input.trim()
    if (/^\d{6,}$/.test(raw)) {
        return raw
    }

    const fromRaw = findAwemeId(raw)
    if (fromRaw) {
        return fromRaw
    }

    const url = extractFirstUrl(raw)
    if (!url) {
        throw new Error('未识别到抖音链接，请粘贴分享链接或完整视频地址')
    }

    const fromUrl = findAwemeId(url)
    if (fromUrl) {
        return fromUrl
    }

    const response = await proxiedFetch(url, {
        redirect: 'follow',
        signal,
        headers: {
            'User-Agent': MOBILE_UA,
            'Accept-Language': 'zh-CN,zh;q=0.9',
        },
    })
    const fromFinal = findAwemeId(response.url)
    if (fromFinal) {
        return fromFinal
    }

    const body = await response.text()
    const fromBody = findAwemeId(body)
    if (fromBody) {
        return fromBody
    }

    throw new Error('无法解析抖音作品 ID，链接可能已失效或作品设为私密')
}

function pickBestUrl(urlList: unknown[]): string | null {
    const urls = urlList.filter((item): item is string => typeof item === 'string' && item.startsWith('http'))
    if (urls.length === 0) {
        return null
    }
    // 去水印：playwm → play
    const cleaned = urls.map((item) => item.replace('playwm', 'play').replace(/^http:/, 'https:'))
    // 优先非 douyinvod（部分节点防盗链更严），但仍保留全部
    const preferred = cleaned.filter((item) => !/\.douyinvod\.com/i.test(item))
    return preferred[0] || cleaned[0]
}

function collectBitRateUrls(video: Record<string, unknown>): string[] {
    const urls: string[] = []
    const pushAddr = (addr: unknown): void => {
        if (!addr || typeof addr !== 'object') {
            return
        }
        const list = (addr as { url_list?: unknown }).url_list
        if (!Array.isArray(list)) {
            return
        }
        for (const item of list) {
            if (typeof item === 'string' && item.startsWith('http')) {
                urls.push(item.replace('playwm', 'play').replace(/^http:/, 'https:'))
            }
        }
    }

    pushAddr(video.play_addr)
    pushAddr(video.play_addr_h264)
    pushAddr(video.play_addr_265)
    pushAddr(video.play_addr_lowbr)

    const bitRate = video.bit_rate
    if (Array.isArray(bitRate)) {
        // 高码率优先
        const sorted = [...bitRate].sort((a, b) => {
            const ah = Number((a as { play_addr?: { height?: number } })?.play_addr?.height || 0)
            const bh = Number((b as { play_addr?: { height?: number } })?.play_addr?.height || 0)
            return bh - ah
        })
        for (const item of sorted) {
            if (item && typeof item === 'object') {
                pushAddr((item as { play_addr?: unknown }).play_addr)
            }
        }
    }

    return [...new Set(urls)]
}

async function fetchWebDetail(
    awemeId: string,
    signal?: AbortSignal,
): Promise<Record<string, unknown> | null> {
    const qs = new URLSearchParams({ aweme_id: awemeId, aid: '6383' }).toString()
    const response = await proxiedFetch(`https://www.douyin.com/aweme/v1/web/aweme/detail/?${qs}`, {
        signal,
        headers: {
            'User-Agent': DESKTOP_UA,
            Accept: 'application/json, text/plain, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            Origin: EMBED_ORIGIN,
            Referer: `${EMBED_ORIGIN}/`,
        },
    })
    if (!response.ok) {
        return null
    }
    const text = await response.text()
    if (!text.trim()) {
        return null
    }
    try {
        const json = JSON.parse(text) as {
            aweme_detail?: Record<string, unknown>
            filter_detail?: { detail_msg?: string; notice?: string }
        }
        if (json.aweme_detail) {
            return json.aweme_detail
        }
        return null
    } catch {
        return null
    }
}

async function fetchAppFeed(
    awemeId: string,
    signal?: AbortSignal,
): Promise<Record<string, unknown> | null> {
    for (const host of FEED_HOSTS) {
        if (signal?.aborted) {
            throw new Error('aborted')
        }
        try {
            const response = await proxiedFetch(`${host}?aweme_id=${awemeId}`, {
                signal,
                timeoutMs: 10_000,
                headers: {
                    'User-Agent': APP_UA,
                    Accept: 'application/json',
                },
            })
            const text = await response.text()
            if (!response.ok || text.length < 500) {
                continue
            }
            const json = JSON.parse(text) as { aweme_list?: Array<Record<string, unknown>> }
            const list = Array.isArray(json.aweme_list) ? json.aweme_list : []
            const hit = list.find((item) => String(item.aweme_id) === String(awemeId)) || list[0]
            if (hit) {
                return hit
            }
        } catch (err) {
            if (signal?.aborted || (err instanceof Error && err.message === 'aborted')) {
                throw new Error('aborted')
            }
            // 换下一个接入点
        }
    }
    return null
}

async function resolvePlayRedirect(
    videoUri: string,
    signal?: AbortSignal,
): Promise<string | null> {
    if (!videoUri) {
        return null
    }
    const params = new URLSearchParams({
        video_id: videoUri,
        line: '0',
        ratio: 'default',
        watermark: '0',
        media_type: '4',
        vr_type: '0',
        improve_bitrate: '1',
        is_play_url: '1',
        source: 'PackSourceEnum_AWEME_DETAIL',
    })

    const endpoints = [
        `https://www.douyin.com/aweme/v1/play/?${params}`,
        `https://aweme.snssdk.com/aweme/v1/play/?${params}`,
    ]

    for (const endpoint of endpoints) {
        if (signal?.aborted) {
            throw new Error('aborted')
        }
        try {
            const response = await proxiedFetch(endpoint, {
                redirect: 'manual',
                signal,
                timeoutMs: 10_000,
                headers: {
                    'User-Agent': DESKTOP_UA,
                    Referer: 'https://www.douyin.com/',
                },
            })
            const location = response.headers.get('location')
            if (location) {
                return location.replace(/^http:/, 'https:')
            }
            if (response.ok && response.url && /\.mp4|douyin|byte/i.test(response.url)) {
                return response.url.replace(/^http:/, 'https:')
            }
        } catch (err) {
            if (signal?.aborted || (err instanceof Error && err.message === 'aborted')) {
                throw new Error('aborted')
            }
            // 尝试下一个
        }
    }
    return null
}

function pickVideoHeight(video: Record<string, unknown>): number | undefined {
    const playAddr = video.play_addr as { height?: number; width?: number } | undefined
    const h264 = video.play_addr_h264 as { height?: number; width?: number } | undefined
    const h265 = video.play_addr_265 as { height?: number; width?: number } | undefined
    const candidates = [playAddr, h264, h265]
    let best = 0
    for (const item of candidates) {
        const w = Number(item?.width || 0)
        const h = Number(item?.height || 0)
        const shortSide = w > 0 && h > 0 ? Math.min(w, h) : h || w
        if (shortSide > best) {
            best = shortSide
        }
    }
    const bitRate = video.bit_rate
    if (Array.isArray(bitRate)) {
        for (const item of bitRate) {
            if (!item || typeof item !== 'object') {
                continue
            }
            const addr = (item as { play_addr?: { height?: number; width?: number } }).play_addr
            const w = Number(addr?.width || 0)
            const h = Number(addr?.height || 0)
            const shortSide = w > 0 && h > 0 ? Math.min(w, h) : h || w
            if (shortSide > best) {
                best = shortSide
            }
        }
    }
    return best > 0 ? best : undefined
}

function toResult(awemeId: string, detail: Record<string, unknown>, videoUrl: string, backupUrls: string[]): ShortVideoResolveResult {
    const video = (detail.video || {}) as Record<string, unknown>
    const author = detail.author as { nickname?: string } | undefined
    const coverObj = (video.cover || video.origin_cover) as { url_list?: string[] } | undefined
    const durationRaw = typeof video.duration === 'number' ? video.duration : undefined

    return {
        platform: 'douyin',
        id: awemeId,
        title: String(detail.desc || `抖音_${awemeId}`).slice(0, 200),
        author: author?.nickname,
        cover: coverObj?.url_list?.[0]?.replace(/^http:/, 'https:'),
        duration: durationRaw ? Math.round(durationRaw / 1000) : undefined,
        height: pickVideoHeight(video),
        videoUrl,
        backupUrls: backupUrls.filter((item) => item !== videoUrl),
    }
}

/** 解析抖音分享链接 / 文案，返回无水印直链 */
export async function resolveDouyin(
    input: string,
    signal?: AbortSignal,
): Promise<ShortVideoResolveResult> {
    const awemeId = await resolveDouyinAwemeId(input, signal)

    // 优先：嵌入播放器通道
    let detail = await fetchWebDetail(awemeId, signal)
    if (!detail && !signal?.aborted) {
        await new Promise((resolve) => setTimeout(resolve, 250))
        detail = await fetchWebDetail(awemeId, signal)
    }

    // 兜底：客户端 Feed
    if (!detail && !signal?.aborted) {
        detail = await fetchAppFeed(awemeId, signal)
    }

    if (signal?.aborted) {
        throw new Error('aborted')
    }

    if (!detail) {
        throw new Error('抖音接口未返回作品信息，请稍后重试或换一条公开视频链接')
    }

    if (Array.isArray(detail.images) && detail.images.length > 0) {
        throw new Error('该链接是图集/图文，当前版本仅支持视频下载')
    }

    const video = (detail.video || {}) as Record<string, unknown>
    const candidates = collectBitRateUrls(video)
    const playAddr = video.play_addr as { uri?: string; url_list?: unknown[] } | undefined
    const redirected = playAddr?.uri ? await resolvePlayRedirect(playAddr.uri, signal) : null

    const all = [...(redirected ? [redirected] : []), ...candidates]
    const unique = [...new Set(all)]
    const primary = pickBestUrl(unique) || unique[0]
    if (!primary) {
        throw new Error('未找到无水印播放地址，作品可能已删除或不可公开访问')
    }

    return toResult(awemeId, detail, primary, unique)
}
