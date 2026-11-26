import { accessSync, constants, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { getPlatformInfo, type PlatformId } from '../../shared/platform'
import type { AppSettings, OutputDirValidation } from '../../shared/types'

const MEDIA_EXTENSIONS = new Set([
    '.mp4',
    '.ts',
    '.mkv',
    '.webm',
    '.flv',
    '.mov',
    '.m4a',
    '.mp3',
    '.aac',
])

const ILLEGAL_SEGMENT_CHARS = /[<>:"|?*]/
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/
const RESERVED_DEVICE_NAME = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i
const MAX_OUTPUT_DIR_LENGTH = 180

function getProtectedWindowsDirs(): { systemDriveRoot: string; prefixes: string[] } {
    const systemDrive = (process.env.SystemDrive || 'C:').replace(/[\\/]+$/, '').toUpperCase()
    const systemDriveRoot = `${systemDrive}\\`
    const systemRoot = (process.env.SystemRoot || `${systemDrive}\\Windows`)
        .replace(/[\\/]+$/, '')
        .toUpperCase()
    const programFiles = (process.env.ProgramFiles || `${systemDrive}\\Program Files`)
        .replace(/[\\/]+$/, '')
        .toUpperCase()
    const programFilesX86 = (
        process.env['ProgramFiles(x86)'] || `${systemDrive}\\Program Files (x86)`
    )
        .replace(/[\\/]+$/, '')
        .toUpperCase()

    return {
        systemDriveRoot,
        prefixes: [systemRoot, programFiles, programFilesX86],
    }
}

function isProtectedWindowsPath(normalizedPath: string): boolean {
    if (process.platform !== 'win32') {
        return false
    }
    const upper = normalizedPath.replace(/[\\/]+$/, '').toUpperCase()
    const { systemDriveRoot, prefixes } = getProtectedWindowsDirs()
    if (`${upper}\\` === systemDriveRoot) {
        return true
    }
    return prefixes.some((prefix) => upper === prefix || upper.startsWith(`${prefix}\\`))
}

/** 校验用户输入的保存目录路径是否合规（纯只读检查，不会自动建目录） */
export function validateOutputDir(rawPath: string): OutputDirValidation {
    const trimmed = typeof rawPath === 'string' ? rawPath.trim() : ''
    if (!trimmed) {
        return {
            valid: false,
            normalizedPath: '',
            reason: '保存目录不能为空',
        }
    }

    if (CONTROL_CHARS.test(trimmed)) {
        return {
            valid: false,
            normalizedPath: trimmed,
            reason: '路径包含非法控制字符',
        }
    }

    if (trimmed.includes('"')) {
        return {
            valid: false,
            normalizedPath: trimmed,
            reason: '路径不能包含双引号（"）',
        }
    }

    const driveMatch = /^([A-Za-z]):([\\/])(.*)$/.exec(trimmed)
    const uncMatch = /^\\\\([^\\/:*?"<>|]+)\\([^\\/:*?"<>|]+)(?:([\\/])(.*))?$/.exec(trimmed)

    let root = ''
    let remainder = ''

    if (driveMatch) {
        root = `${driveMatch[1].toUpperCase()}:\\`
        remainder = driveMatch[3]
    } else if (uncMatch) {
        root = `\\\\${uncMatch[1]}\\${uncMatch[2]}`
        remainder = uncMatch[4] ?? ''
    } else {
        return {
            valid: false,
            normalizedPath: trimmed,
            reason: '请填写完整的绝对路径，例如 D:\\Videos',
        }
    }

    // 去除末尾多余斜杠后检查是否存在连续空分隔符（如 D:\a\\b 或 D:\\a）
    const remainderNoTrailing = remainder.replace(/[\\/]+$/, '')
    if (remainderNoTrailing.startsWith('\\') || remainderNoTrailing.startsWith('/')) {
        return {
            valid: false,
            normalizedPath: trimmed,
            reason: '路径格式不规范，存在多余的斜杠',
        }
    }

    const segments = remainderNoTrailing ? remainderNoTrailing.split(/[\\/]/) : []
    for (const seg of segments) {
        if (!seg) {
            return {
                valid: false,
                normalizedPath: trimmed,
                reason: '路径格式不规范，存在连续斜杠',
            }
        }
        if (seg === '.' || seg === '..') {
            return {
                valid: false,
                normalizedPath: trimmed,
                reason: '路径不能包含相对目录（. 或 ..）',
            }
        }
        if (ILLEGAL_SEGMENT_CHARS.test(seg)) {
            return {
                valid: false,
                normalizedPath: trimmed,
                reason: '路径包含非法字符（< > : " | ? *）',
            }
        }
        if (/[ .]$/.test(seg)) {
            return {
                valid: false,
                normalizedPath: trimmed,
                reason: '目录名不能以空格或点号结尾',
            }
        }
        if (RESERVED_DEVICE_NAME.test(seg)) {
            return {
                valid: false,
                normalizedPath: trimmed,
                reason: `路径包含系统保留名称「${seg}」`,
            }
        }
    }

    const normalizedPath = segments.length > 0 ? `${root}${segments.join('\\')}` : root

    if (normalizedPath.length > MAX_OUTPUT_DIR_LENGTH) {
        return {
            valid: false,
            normalizedPath,
            reason: `路径过长，请控制在 ${MAX_OUTPUT_DIR_LENGTH} 个字符以内`,
        }
    }

    if (isProtectedWindowsPath(normalizedPath)) {
        return {
            valid: false,
            normalizedPath,
            reason: '系统受保护目录不可作为保存路径，请更换其他目录',
        }
    }

    if (!existsSync(root)) {
        return {
            valid: false,
            normalizedPath,
            reason: `磁盘或根目录 ${root} 不存在`,
        }
    }

    // 沿路径向下检查已存在的层级，防止路径本身或父级是普通文件
    let current = root
    let nearestExisting = root
    for (const seg of segments) {
        current = join(current, seg)
        if (!existsSync(current)) {
            break
        }
        try {
            const stat = statSync(current)
            if (!stat.isDirectory()) {
                return {
                    valid: false,
                    normalizedPath,
                    reason: '路径指向的是文件，或上级目录存在同名文件',
                }
            }
            nearestExisting = current
        } catch {
            return {
                valid: false,
                normalizedPath,
                reason: '无法访问该目录，请检查路径权限',
            }
        }
    }

    try {
        accessSync(nearestExisting, constants.W_OK)
    } catch {
        return {
            valid: false,
            normalizedPath,
            reason: '没有该目录的写入权限',
        }
    }

    return {
        valid: true,
        normalizedPath,
    }
}

/** 解析最终保存目录：先校验路径合规性，再可选在用户目录下按平台分子文件夹 */
export function resolveJobOutputDir(settings: AppSettings, platform?: PlatformId): string {
    const check = validateOutputDir(settings.outputDir)
    if (!check.valid) {
        throw new Error(`保存目录不合规（${check.reason}），请前往设置修改保存目录`)
    }
    const root = check.normalizedPath
    if (!settings.organizeByPlatform || !platform || platform === 'unknown') {
        mkdirSync(root, { recursive: true })
        return root
    }
    const folder = getPlatformInfo(platform).label
    const dir = join(root, folder)
    mkdirSync(dir, { recursive: true })
    return dir
}

function isAbsoluteMediaPath(raw: string): boolean {
    const trimmed = raw.trim().replace(/^"|"$/g, '')
    if (!trimmed || trimmed.startsWith('[')) {
        return false
    }
    const isWinAbs = /^[A-Za-z]:[\\/]/.test(trimmed)
    const isUnc = trimmed.startsWith('\\\\')
    const isPosixAbs = trimmed.startsWith('/')
    if (!isWinAbs && !isUnc && !isPosixAbs) {
        return false
    }
    const ext = extname(trimmed).toLowerCase()
    // 成品或常见临时后缀均可先记，完成后再校验是否仍存在
    return MEDIA_EXTENSIONS.has(ext) || ext === '.part' || ext === '.ytdl'
}

/** 从引擎日志中提取绝对文件路径；相对路径 / 纯文件名一律忽略 */
export function extractAbsoluteFilePath(line: string): string | null {
    const trimmed = line.trim().replace(/^"|"$/g, '')
    if (!isAbsoluteMediaPath(trimmed)) {
        return null
    }
    return trimmed
}

const PLACEHOLDER_TITLES = new Set([
    '视频下载',
    '抖音视频',
    'TikTok 视频',
    '快手视频',
    '央视视频',
    '未命名视频',
])

/** 在任务锁定的目录中按标题 / GUID 安全找回实际文件（绝不盲目匹配目录内旧视频，防止误打开或误删） */
export function findDownloadedFile(
    outputDir: string | undefined,
    hints: {
        title?: string
        guid?: string
        preferredPath?: string
        startedAt?: number
        allowRecentFallback?: boolean
    },
): string | undefined {
    if (hints.preferredPath) {
        const cleanPreferred = hints.preferredPath.replace(/\.(?:part|ytdl)$/i, '')
        for (const candidate of [hints.preferredPath, cleanPreferred]) {
            const ext = extname(candidate).toLowerCase()
            if (MEDIA_EXTENSIONS.has(ext) && existsSync(candidate)) {
                try {
                    if (statSync(candidate).isFile()) {
                        return candidate
                    }
                } catch {
                    // 继续尝试目录扫描
                }
            }
        }
    }

    if (!outputDir || !existsSync(outputDir)) {
        return undefined
    }

    let entries: string[]
    try {
        entries = readdirSync(outputDir)
    } catch {
        return undefined
    }

    const mediaFiles = entries
        .map((name) => join(outputDir, name))
        .filter((filePath) => {
            try {
                const ext = extname(filePath).toLowerCase()
                return MEDIA_EXTENSIONS.has(ext) && statSync(filePath).isFile()
            } catch {
                return false
            }
        })

    if (mediaFiles.length === 0) {
        return undefined
    }

    const guid = hints.guid?.trim().toLowerCase()
    if (guid && guid.length >= 3) {
        const byBracketGuid = mediaFiles.find((filePath) =>
            basename(filePath).toLowerCase().includes(`[${guid}]`),
        )
        if (byBracketGuid) {
            return byBracketGuid
        }
        const byGuid = mediaFiles.find((filePath) => basename(filePath).toLowerCase().includes(guid))
        if (byGuid) {
            return byGuid
        }
    }

    const rawTitle = hints.title?.trim()
    const title = rawTitle && !PLACEHOLDER_TITLES.has(rawTitle) ? rawTitle : ''
    if (title) {
        const sanitized = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim()
        for (const candidateTitle of [title, sanitized]) {
            if (!candidateTitle) {
                continue
            }
            const needle = candidateTitle.slice(0, 48)
            const byTitle = mediaFiles.find((filePath) => basename(filePath).includes(needle))
            if (byTitle) {
                return byTitle
            }
            const shortNeedle = candidateTitle.slice(0, 16)
            if (shortNeedle.length >= 4) {
                const byShort = mediaFiles.find((filePath) =>
                    basename(filePath).includes(shortNeedle),
                )
                if (byShort) {
                    return byShort
                }
            }
        }
    }

    // 仅在任务刚完成回填路径时，允许匹配本次任务启动后新落盘的媒体文件
    if (hints.allowRecentFallback && hints.startedAt) {
        const recent = mediaFiles
            .map((filePath) => {
                try {
                    return { filePath, mtimeMs: statSync(filePath).mtimeMs }
                } catch {
                    return { filePath, mtimeMs: 0 }
                }
            })
            .filter((item) => item.mtimeMs >= hints.startedAt! - 2000)
            .sort((a, b) => b.mtimeMs - a.mtimeMs)

        if (recent.length > 0) {
            return recent[0].filePath
        }
    }

    return undefined
}

/** 收集任务关联的成品文件及临时分片（.part / .ytdl / .temp.*），供取消或删除时彻底清理 */
export function collectJobRelatedFiles(hints: {
    outputDir?: string
    outputPath?: string
    guid?: string
    title?: string
}): string[] {
    const result = new Set<string>()
    const resolved = findDownloadedFile(hints.outputDir, {
        title: hints.title,
        guid: hints.guid,
        preferredPath: hints.outputPath,
        allowRecentFallback: false,
    })
    if (resolved) {
        result.add(resolved)
        if (existsSync(`${resolved}.part`)) {
            result.add(`${resolved}.part`)
        }
        if (existsSync(`${resolved}.ytdl`)) {
            result.add(`${resolved}.ytdl`)
        }
    }

    if (hints.outputPath) {
        const clean = hints.outputPath.replace(/\.(?:part|ytdl)$/i, '')
        for (const p of [hints.outputPath, clean, `${clean}.part`, `${clean}.ytdl`]) {
            if (existsSync(p)) {
                result.add(p)
            }
        }
    }

    if (hints.outputDir && existsSync(hints.outputDir)) {
        try {
            const entries = readdirSync(hints.outputDir)
            const guid = hints.guid?.trim().toLowerCase()
            const basePrefix = hints.outputPath
                ? basename(hints.outputPath).replace(/\.(?:part|ytdl)$/i, '').replace(/\.[^.]+$/, '')
                : ''

            for (const entry of entries) {
                const lower = entry.toLowerCase()
                const isTemp =
                    lower.endsWith('.part') ||
                    lower.endsWith('.ytdl') ||
                    lower.includes('.temp.') ||
                    /\.part-frag\d+/i.test(lower)
                if (!isTemp) {
                    continue
                }
                const matchedByGuid = Boolean(guid && guid.length >= 3 && lower.includes(`[${guid}]`))
                const matchedByBase = Boolean(basePrefix && entry.startsWith(basePrefix))
                if (matchedByGuid || matchedByBase) {
                    result.add(join(hints.outputDir, entry))
                }
            }
        } catch {
            // ignore
        }
    }

    return [...result]
}
