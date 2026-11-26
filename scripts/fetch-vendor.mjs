/**
 * 拉取运行时依赖到 resources/vendor：
 * - cctv-dl（央视网）
 * - yt-dlp.exe（B站 / 抖音 / TikTok 等）
 * - ffmpeg / ffprobe（音视频合并）
 */
import { createWriteStream, existsSync, mkdirSync, rmSync, copyFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const CCTV_VERSION = 'v4.5.6'
const CCTV_URL =
    `https://github.com/letr007/CCTVVideoDownloader/releases/download/${CCTV_VERSION}/cctv-dl.${CCTV_VERSION}.win.x64.zip`

const YTDLP_VERSION = '2026.11.23'
const YTDLP_URL = `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp.exe`

const FFMPEG_VERSION = '9.1'
const FFMPEG_URL =
    `https://github.com/GyanD/codexffmpeg/releases/download/${FFMPEG_VERSION}/ffmpeg-${FFMPEG_VERSION}-essentials_build.zip`

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const vendorRoot = join(rootDir, 'resources', 'vendor')

function applyProxyEnv() {
    // 本机代理优先，便于拉取 GitHub 等海外资源
    const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || 'http://127.0.0.1:7897'
    if (!process.env.HTTPS_PROXY) {
        process.env.HTTPS_PROXY = proxy
    }
    if (!process.env.HTTP_PROXY) {
        process.env.HTTP_PROXY = proxy
    }
    if (!process.env.ALL_PROXY) {
        process.env.ALL_PROXY = proxy
    }
    console.log(`使用代理：${proxy}`)
}

async function download(url, dest) {
    const response = await fetch(url, { redirect: 'follow' })
    if (!response.ok || !response.body) {
        throw new Error(`下载失败：${response.status} ${response.statusText} -> ${url}`)
    }
    await pipeline(response.body, createWriteStream(dest))
}

function extractZip(zipFile, outDir) {
    mkdirSync(outDir, { recursive: true })
    execFileSync('tar', ['-xf', zipFile, '-C', outDir], { stdio: 'inherit' })
}

function findFileRecursive(dir, fileName) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        const stat = statSync(full)
        if (stat.isDirectory()) {
            const found = findFileRecursive(full, fileName)
            if (found) {
                return found
            }
        } else if (entry.toLowerCase() === fileName.toLowerCase()) {
            return full
        }
    }
    return null
}

async function ensureCctv() {
    const targetDir = join(vendorRoot, 'cctv-dl')
    const zipPath = join(vendorRoot, 'cctv-dl.zip')
    const exePath = join(targetDir, 'bin', 'cctv-dl.exe')

    if (existsSync(exePath)) {
        console.log(`已存在 cctv-dl：${exePath}`)
        return
    }

    console.log(`下载 ${CCTV_URL}`)
    await download(CCTV_URL, zipPath)

    if (existsSync(targetDir)) {
        rmSync(targetDir, { recursive: true, force: true })
    }

    const extractTemp = join(vendorRoot, '_extract_cctv')
    if (existsSync(extractTemp)) {
        rmSync(extractTemp, { recursive: true, force: true })
    }
    mkdirSync(extractTemp, { recursive: true })
    extractZip(zipPath, extractTemp)

    const nested = join(extractTemp, 'cctv-dl')
    if (existsSync(nested)) {
        execFileSync('powershell', [
            '-NoProfile',
            '-Command',
            `Move-Item -LiteralPath '${nested}' -Destination '${targetDir}'`,
        ])
    } else {
        execFileSync('powershell', [
            '-NoProfile',
            '-Command',
            `Move-Item -LiteralPath '${extractTemp}' -Destination '${targetDir}'`,
        ])
    }

    if (existsSync(extractTemp)) {
        rmSync(extractTemp, { recursive: true, force: true })
    }
    rmSync(zipPath, { force: true })

    // 移除随上游压缩包附带的冗余 VC++ 安装器（同目录已内置运行库 DLL）
    const vcRedist = join(targetDir, 'bin', 'vc_redist.x64.exe')
    if (existsSync(vcRedist)) {
        rmSync(vcRedist, { force: true })
    }

    if (!existsSync(exePath)) {
        throw new Error(`解压后未找到 ${exePath}`)
    }
    console.log(`cctv-dl 就绪：${exePath}`)
}

async function ensureYtDlp() {
    const targetDir = join(vendorRoot, 'yt-dlp')
    const exePath = join(targetDir, 'yt-dlp.exe')
    mkdirSync(targetDir, { recursive: true })

    if (existsSync(exePath)) {
        console.log(`已存在 yt-dlp：${exePath}`)
        return
    }

    console.log(`下载 ${YTDLP_URL}`)
    await download(YTDLP_URL, exePath)
    console.log(`yt-dlp 就绪：${exePath}`)
}

async function ensureFfmpeg() {
    const targetDir = join(vendorRoot, 'ffmpeg')
    const ffmpegPath = join(targetDir, 'ffmpeg.exe')
    const ffprobePath = join(targetDir, 'ffprobe.exe')
    const zipPath = join(vendorRoot, 'ffmpeg.zip')

    if (existsSync(ffmpegPath) && existsSync(ffprobePath)) {
        console.log(`已存在 ffmpeg：${ffmpegPath}`)
        return
    }

    console.log(`下载 ${FFMPEG_URL}`)
    await download(FFMPEG_URL, zipPath)

    const extractTemp = join(vendorRoot, '_extract_ffmpeg')
    if (existsSync(extractTemp)) {
        rmSync(extractTemp, { recursive: true, force: true })
    }
    mkdirSync(extractTemp, { recursive: true })
    extractZip(zipPath, extractTemp)

    mkdirSync(targetDir, { recursive: true })
    const foundFfmpeg = findFileRecursive(extractTemp, 'ffmpeg.exe')
    const foundFfprobe = findFileRecursive(extractTemp, 'ffprobe.exe')
    if (!foundFfmpeg || !foundFfprobe) {
        throw new Error('ffmpeg 压缩包中未找到 ffmpeg.exe / ffprobe.exe')
    }
    copyFileSync(foundFfmpeg, ffmpegPath)
    copyFileSync(foundFfprobe, ffprobePath)

    rmSync(extractTemp, { recursive: true, force: true })
    rmSync(zipPath, { force: true })
    console.log(`ffmpeg 就绪：${ffmpegPath}`)
}

async function main() {
    applyProxyEnv()
    mkdirSync(vendorRoot, { recursive: true })
    await ensureCctv()
    await ensureYtDlp()
    await ensureFfmpeg()
    console.log('全部 vendor 依赖就绪')
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
