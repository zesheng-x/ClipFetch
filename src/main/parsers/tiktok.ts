/**
 * TikTok 免登录无水印解析。
 * 页面抓取 UNIVERSAL_DATA → 取 aweme/v1/play → 无 Cookie 跟随 302 得到可直接下载的 CDN。
 */
import { proxiedFetch } from '../utils/proxy'
import { extractFirstUrl } from './urlExtract'

const DESKTOP_UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export interface TikTokResolveResult {
    platform: 'tiktok'
    id: string
    title: string
    author?: string
    cover?: string
    duration?: number
    height?: number
    videoUrl: string
    backupUrls?: string[]
}

export async function resolveTikTok(
    input: string,
    signal?: AbortSignal,
): Promise<TikTokResolveResult> {
    const url = extractFirstUrl(input)
    if (!url) {
        throw new Error('未识别到 TikTok 链接')
    }

    const response = await proxiedFetch(url, {
        redirect: 'follow',
        signal,
        headers: {
            'User-Agent': DESKTOP_UA,
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8',
        },
    })
    if (!response.ok) {
        throw new Error(`打开 TikTok 页面失败：HTTP ${response.status}`)
    }

    const finalUrl = response.url
    const html = await response.text()
    const dataMatch = html.match(
        /<script[^>]*id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]+?)<\/script>/i,
    )
    if (!dataMatch?.[1]) {
        throw new Error('TikTok 页面结构变化，未找到视频数据（可能需代理或视频不可公开访问）')
    }

    let parsed: Record<string, unknown>
    try {
        parsed = JSON.parse(dataMatch[1]) as Record<string, unknown>
    } catch {
        throw new Error('TikTok 页面数据解析失败')
    }

    const defaultScope = parsed.__DEFAULT_SCOPE__ as Record<string, unknown> | undefined
    const videoDetail = defaultScope?.['webapp.video-detail'] as
        | {
              statusCode?: number
              statusMsg?: string
              itemInfo?: {
                  itemStruct?: {
                      id?: string
                      desc?: string
                      author?: { uniqueId?: string; nickname?: string }
                      video?: {
                          cover?: string
                          originCover?: string
                          duration?: number
                          height?: number
                          width?: number
                          bitrateInfo?: Array<{
                              PlayAddr?: { UrlList?: string[]; Height?: number; Width?: number }
                          }>
                      }
                  }
              }
          }
        | undefined

    const item = videoDetail?.itemInfo?.itemStruct
    if (!item) {
        const statusCode = videoDetail?.statusCode
        if (statusCode === 10204) {
            throw new Error('该 TikTok 视频仅好友可见')
        }
        if (statusCode === 10216) {
            throw new Error('该 TikTok 视频有年龄限制')
        }
        if (statusCode === 10222) {
            throw new Error('该 TikTok 视频存在区域限制，请开启代理后重试')
        }
        throw new Error('TikTok 未返回视频信息（可能私密 / 删除 / 区域锁）')
    }

    const video = item.video || {}
    let playApiUrl: string | null = null
    for (const br of video.bitrateInfo || []) {
        for (const candidate of br?.PlayAddr?.UrlList || []) {
            if (typeof candidate === 'string' && candidate.includes('/aweme/v1/play')) {
                playApiUrl = candidate
                break
            }
        }
        if (playApiUrl) {
            break
        }
    }
    if (!playApiUrl) {
        throw new Error('未找到 TikTok 播放接口地址')
    }

    // 关键 Cookie 跟随 302，拿到可直接下载的 CDN（带 cookie 反而会落到受限域名）
    let resolvedCdnUrl: string | null = null
    const head = await proxiedFetch(playApiUrl, {
        redirect: 'manual',
        signal,
        headers: { 'User-Agent': DESKTOP_UA },
    })
    if (head.status >= 300 && head.status < 400) {
        const location = head.headers.get('location')
        if (location && !location.includes('tt_chain_token')) {
            resolvedCdnUrl = location.replace(/^http:/, 'https:')
        }
    }

    if (!resolvedCdnUrl) {
        // 再尝试自动跟随一次
        const followed = await proxiedFetch(playApiUrl, {
            redirect: 'follow',
            signal,
            headers: { 'User-Agent': DESKTOP_UA },
        })
        if (followed.ok && followed.url && !followed.url.includes('tt_chain_token')) {
            resolvedCdnUrl = followed.url.replace(/^http:/, 'https:')
        }
    }

    if (!resolvedCdnUrl) {
        throw new Error('未能解析 TikTok 无水印直链，请确认网络可访问 TikTok')
    }

    const id =
        item.id ||
        finalUrl.match(/\/video\/(\d+)/)?.[1] ||
        'tiktok_video'

    let height = Number(video.height || 0)
    const width = Number(video.width || 0)
    if (height > 0 && width > 0) {
        height = Math.min(height, width)
    }
    if (!height) {
        for (const br of video.bitrateInfo || []) {
            const h = Number(br?.PlayAddr?.Height || 0)
            const w = Number(br?.PlayAddr?.Width || 0)
            const shortSide = h > 0 && w > 0 ? Math.min(h, w) : h || w
            if (shortSide > height) {
                height = shortSide
            }
        }
    }

    return {
        platform: 'tiktok',
        id,
        title: String(item.desc || `TikTok_${id}`).slice(0, 200),
        author: item.author?.nickname || item.author?.uniqueId,
        cover: (video.cover || video.originCover || '').replace(/^http:/, 'https:') || undefined,
        duration: typeof video.duration === 'number' ? video.duration : undefined,
        height: height > 0 ? height : undefined,
        videoUrl: resolvedCdnUrl,
    }
}
