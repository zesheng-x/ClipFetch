import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { getRuntime } from '../runtime'

function resolveCandidate(relativeParts: string[]): string {
    const { appPath, resourcesPath } = getRuntime()
    const candidates = [
        // 打包后：extraResources
        join(resourcesPath, ...relativeParts),
        // 开发态：仓库内 resources
        join(appPath, 'resources', ...relativeParts),
        join(__dirname, '../../resources', ...relativeParts),
        join(process.cwd(), 'resources', ...relativeParts),
    ]

    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            return candidate
        }
    }

    throw new Error(`未找到资源：${relativeParts.join('/')}`)
}

/** 窗口 / 任务栏图标 */
export function resolveAppIconPath(): string | undefined {
    const { appPath, resourcesPath } = getRuntime()
    const candidates = [
        join(resourcesPath, 'icon.ico'),
        join(appPath, 'build', 'icon.ico'),
        join(__dirname, '../../build/icon.ico'),
        join(resourcesPath, 'icon-ui.png'),
        join(appPath, 'build', 'icon.png'),
        join(__dirname, '../../build/icon.png'),
    ]
    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            return candidate
        }
    }
    return undefined
}

/** 渲染层展示用的轻量 PNG 图标路径 */
export function resolveAppIconPngPath(): string | undefined {
    const { appPath, resourcesPath } = getRuntime()
    const candidates = [
        join(resourcesPath, 'icon-ui.png'),
        join(appPath, 'build', 'icon-ui.png'),
        join(__dirname, '../../build/icon-ui.png'),
        join(appPath, 'build', 'icon.png'),
        join(__dirname, '../../build/icon.png'),
    ]
    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            return candidate
        }
    }
    return undefined
}

/** 定位随安装包分发的 cctv-dl 可执行文件 */
export function resolveCctvDlPath(): string {
    try {
        return resolveCandidate(['vendor', 'cctv-dl', 'bin', 'cctv-dl.exe'])
    } catch {
        throw new Error(
            '未找到 cctv-dl 引擎。请先执行 pnpm vendor:fetch，或确认安装包资源完整。',
        )
    }
}

/** 定位 yt-dlp 可执行文件 */
export function resolveYtDlpPath(): string {
    try {
        return resolveCandidate(['vendor', 'yt-dlp', 'yt-dlp.exe'])
    } catch {
        throw new Error(
            '未找到 yt-dlp 引擎。请先执行 pnpm vendor:fetch，或确认安装包资源完整。',
        )
    }
}

/** 定位 ffmpeg 所在目录（供 yt-dlp --ffmpeg-location） */
export function resolveFfmpegDir(): string {
    try {
        const ffmpegExe = resolveCandidate(['vendor', 'ffmpeg', 'ffmpeg.exe'])
        return join(ffmpegExe, '..')
    } catch {
        throw new Error(
            '未找到 ffmpeg。请先执行 pnpm vendor:fetch，或确认安装包资源完整。',
        )
    }
}

export function resolveDefaultOutputDir(): string {
    return getRuntime().defaultOutputDir
}
