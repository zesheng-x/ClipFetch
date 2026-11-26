import { ProxyAgent, fetch as undiciFetch } from 'undici'
import { getPlatformInfo, OVERSEAS_PROXY_TIP, type PlatformId } from '../../shared/platform'
import { getRuntime } from '../runtime'
import { getSettings } from '../settingsStore'

/** 规范化代理地址，允许用户只填 host:port */
export function normalizeProxyUrl(raw: string): string {
    const trimmed = raw.trim()
    if (!trimmed) {
        return ''
    }
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
        return trimmed
    }
    return `http://${trimmed}`
}

/** 当前启用的代理 URL；未启用则返回 undefined */
export function resolveProxyUrl(): string | undefined {
    const settings = getSettings()
    if (!settings.proxyEnabled) {
        return undefined
    }
    const url = normalizeProxyUrl(settings.proxyUrl || '')
    return url || undefined
}

/** 为 yt-dlp 追加 --proxy */
export function withYtDlpProxyArgs(args: string[]): string[] {
    const proxy = resolveProxyUrl()
    if (!proxy) {
        return args
    }
    return [...args, '--proxy', proxy]
}

export interface ProxiedFetchInit extends RequestInit {
    /** 请求响应头超时（毫秒）；默认 20000，传 0 表示不额外限时 */
    timeoutMs?: number
}

async function nodeProxiedFetch(input: string, init?: ProxiedFetchInit): Promise<Response> {
    const { timeoutMs = 20_000, signal: externalSignal, ...rest } = init ?? {}
    const controller = new AbortController()
    let timedOut = false
    let timer: NodeJS.Timeout | null = null

    const onExternalAbort = (): void => {
        controller.abort()
    }

    if (externalSignal) {
        if (externalSignal.aborted) {
            controller.abort()
        } else {
            externalSignal.addEventListener('abort', onExternalAbort, { once: true })
        }
    }

    if (timeoutMs > 0) {
        timer = setTimeout(() => {
            timedOut = true
            controller.abort()
        }, timeoutMs)
    }

    try {
        const proxy = resolveProxyUrl()
        const fetchInit: RequestInit = {
            ...rest,
            signal: controller.signal,
        }
        if (!proxy) {
            return (await undiciFetch(input, fetchInit as never)) as unknown as Response
        }
        const agent = new ProxyAgent(proxy)
        return (await undiciFetch(input, {
            ...fetchInit,
            dispatcher: agent,
        } as never)) as unknown as Response
    } catch (error) {
        if (timedOut) {
            throw new Error('网络请求超时，请检查网络连接或代理设置')
        }
        if (externalSignal?.aborted) {
            throw new Error('aborted')
        }
        throw error
    } finally {
        if (timer) {
            clearTimeout(timer)
        }
        if (externalSignal) {
            externalSignal.removeEventListener('abort', onExternalAbort)
        }
    }
}

/**
 * 走代理会话的 fetch（短视频解析 / 直链下载用），支持 AbortSignal 与连接超时。
 * 桌面端优先用 Electron session；CLI / 无 Electron 时回退 undici。
 */
export async function proxiedFetch(input: string, init?: ProxiedFetchInit): Promise<Response> {
    const electronFetch = getRuntime().electronFetch
    if (electronFetch) {
        const { timeoutMs = 20_000, signal: externalSignal, ...rest } = init ?? {}
        const controller = new AbortController()
        let timedOut = false
        let timer: NodeJS.Timeout | null = null

        const onExternalAbort = (): void => {
            controller.abort()
        }

        if (externalSignal) {
            if (externalSignal.aborted) {
                controller.abort()
            } else {
                externalSignal.addEventListener('abort', onExternalAbort, { once: true })
            }
        }

        if (timeoutMs > 0) {
            timer = setTimeout(() => {
                timedOut = true
                controller.abort()
            }, timeoutMs)
        }

        try {
            return await electronFetch(input, {
                ...rest,
                signal: controller.signal,
                timeoutMs: 0,
            })
        } catch (error) {
            if (timedOut) {
                throw new Error('网络请求超时，请检查网络连接或代理设置')
            }
            if (externalSignal?.aborted) {
                throw new Error('aborted')
            }
            throw error
        } finally {
            if (timer) {
                clearTimeout(timer)
            }
            if (externalSignal) {
                externalSignal.removeEventListener('abort', onExternalAbort)
            }
        }
    }

    return nodeProxiedFetch(input, init)
}

/** 海外站失败且未开代理时，追加设置引导 */
export function withOverseasProxyTip(platform: PlatformId | undefined, message: string): string {
    const info = getPlatformInfo(platform ?? 'unknown')
    if (!info.needsProxy || resolveProxyUrl()) {
        return message
    }
    if (message.includes('开启代理')) {
        return message
    }
    return `${message}\n${OVERSEAS_PROXY_TIP}`
}
