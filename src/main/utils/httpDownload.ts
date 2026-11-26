import { createWriteStream, existsSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { proxiedFetch } from './proxy'

export interface HttpDownloadOptions {
    url: string
    outputPath: string
    headers?: Record<string, string>
    signal?: AbortSignal
    /** 取消而非暂停时，自动清理 .part 临时文件 */
    cleanPartOnAbort?: () => boolean
    onProgress?: (percent: number, downloaded: number, total: number, speedText?: string) => void
}

function formatSpeed(bytesPerSec: number): string {
    if (bytesPerSec <= 0) {
        return ''
    }
    if (bytesPerSec >= 1024 * 1024) {
        return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
    }
    return `${Math.max(1, Math.round(bytesPerSec / 1024))} KB/s`
}

/**
 * 支持 .part 临时文件、HTTP Range 断点续传与 AbortSignal 即时中断的直链下载器
 */
export async function downloadHttpFile(options: HttpDownloadOptions): Promise<void> {
    const { url, outputPath, headers = {}, signal, cleanPartOnAbort, onProgress } = options
    await mkdir(dirname(outputPath), { recursive: true })

    const partPath = `${outputPath}.part`
    let existingBytes = 0
    if (existsSync(partPath)) {
        try {
            existingBytes = statSync(partPath).size
        } catch {
            existingBytes = 0
        }
    }

    const requestHeaders: Record<string, string> = { ...headers }
    if (existingBytes > 0) {
        requestHeaders.Range = `bytes=${existingBytes}-`
    }

    let response = await proxiedFetch(url, {
        headers: requestHeaders,
        redirect: 'follow',
        signal,
        timeoutMs: 25_000,
    })

    // 若服务端返回 416（本地 .part 已超过或等于完整大小），回退重新全量请求
    if (response.status === 416 && existingBytes > 0) {
        existingBytes = 0
        try {
            unlinkSync(partPath)
        } catch {
            // ignore
        }
        delete requestHeaders.Range
        response = await proxiedFetch(url, {
            headers: requestHeaders,
            redirect: 'follow',
            signal,
            timeoutMs: 25_000,
        })
    }

    if (!response.ok || !response.body) {
        throw new Error(`下载失败：HTTP ${response.status}`)
    }

    const isPartial = response.status === 206 && existingBytes > 0
    const startOffset = isPartial ? existingBytes : 0
    const contentLength = Number(response.headers.get('content-length') || 0)
    const total = contentLength > 0 ? startOffset + contentLength : 0

    let downloaded = startOffset
    let lastEmitAt = 0
    let lastDownloaded = startOffset
    let lastTickAt = Date.now()

    const nodeStream = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream)

    const onAbort = (): void => {
        nodeStream.destroy(new Error('aborted'))
    }
    if (signal) {
        if (signal.aborted) {
            onAbort()
        } else {
            signal.addEventListener('abort', onAbort, { once: true })
        }
    }

    nodeStream.on('data', (chunk: Buffer) => {
        downloaded += chunk.length
        const now = Date.now()
        const elapsed = Math.max(1, now - lastTickAt)
        if (now - lastEmitAt >= 220 || (total > 0 && downloaded >= total)) {
            const speed = ((downloaded - lastDownloaded) * 1000) / elapsed
            const percent =
                total > 0
                    ? Math.min(99, Math.floor((downloaded / total) * 100))
                    : Math.min(95, 5 + Math.floor(downloaded / (2 * 1024 * 1024)))
            lastEmitAt = now
            lastTickAt = now
            lastDownloaded = downloaded
            onProgress?.(percent, downloaded, total, formatSpeed(speed))
        }
    })

    try {
        await pipeline(
            nodeStream,
            createWriteStream(partPath, { flags: isPartial ? 'a' : 'w' }),
        )
    } catch (error) {
        if (signal?.aborted || (error instanceof Error && error.message === 'aborted')) {
            if (cleanPartOnAbort?.() && existsSync(partPath)) {
                try {
                    unlinkSync(partPath)
                } catch {
                    // ignore
                }
            }
            throw new Error('aborted')
        }
        throw error
    } finally {
        if (signal) {
            signal.removeEventListener('abort', onAbort)
        }
    }

    if (existsSync(outputPath)) {
        try {
            unlinkSync(outputPath)
        } catch {
            // ignore
        }
    }
    renameSync(partPath, outputPath)
    onProgress?.(100, downloaded, total || downloaded, '')
}
