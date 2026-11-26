import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DEFAULT_QUALITY, isQualityValue, type QualityValue } from '../shared/quality'
import type { AppSettings } from '../shared/types'
import { getRuntime } from './runtime'
import { resolveDefaultOutputDir } from './utils/paths'

function normalizeProxyUrl(raw: string): string {
    const trimmed = raw.trim()
    if (!trimmed) {
        return ''
    }
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
        return trimmed
    }
    return `http://${trimmed}`
}

interface StoreData {
    outputDir: string
    outputDirCustomized?: boolean
    quality: QualityValue
    threads: number
    remuxMp4: boolean
    organizeByPlatform: boolean
    proxyEnabled: boolean
    proxyUrl: string
}

const DEFAULT_PROXY_URL = 'http://127.0.0.1:7897'

function storePath(): string {
    return join(getRuntime().userDataPath, 'settings.json')
}

function readStore(): StoreData {
    const defaults: StoreData = {
        outputDir: '',
        outputDirCustomized: false,
        quality: DEFAULT_QUALITY,
        threads: 8,
        remuxMp4: true,
        organizeByPlatform: false,
        proxyEnabled: false,
        proxyUrl: DEFAULT_PROXY_URL,
    }
    const file = storePath()
    if (!existsSync(file)) {
        return defaults
    }
    try {
        const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<StoreData>
        return {
            outputDir: typeof parsed.outputDir === 'string' ? parsed.outputDir : defaults.outputDir,
            outputDirCustomized:
                typeof parsed.outputDirCustomized === 'boolean'
                    ? parsed.outputDirCustomized
                    : Boolean(parsed.outputDir),
            quality: isQualityValue(parsed.quality) ? parsed.quality : defaults.quality,
            threads: typeof parsed.threads === 'number' ? parsed.threads : defaults.threads,
            remuxMp4: typeof parsed.remuxMp4 === 'boolean' ? parsed.remuxMp4 : defaults.remuxMp4,
            organizeByPlatform:
                typeof parsed.organizeByPlatform === 'boolean'
                    ? parsed.organizeByPlatform
                    : defaults.organizeByPlatform,
            proxyEnabled:
                typeof parsed.proxyEnabled === 'boolean' ? parsed.proxyEnabled : defaults.proxyEnabled,
            proxyUrl:
                typeof parsed.proxyUrl === 'string' && parsed.proxyUrl.trim()
                    ? normalizeProxyUrl(parsed.proxyUrl)
                    : defaults.proxyUrl,
        }
    } catch {
        return defaults
    }
}

function writeStore(data: StoreData): void {
    const file = storePath()
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

function writeDownloadDirHint(outputDir: string): void {
    try {
        const userData = getRuntime().userDataPath
        mkdirSync(userData, { recursive: true })
        writeFileSync(join(userData, 'download-dir.txt'), `${outputDir}\n`, 'utf8')
    } catch {
        // 忽略卸载辅助文件写入失败
    }
}

export function getSettings(): AppSettings {
    const data = readStore()
    const outputDir = data.outputDirCustomized
        ? data.outputDir
        : data.outputDir || resolveDefaultOutputDir()
    writeDownloadDirHint(outputDir)
    return {
        outputDir,
        quality: data.quality,
        threads: data.threads,
        remuxMp4: data.remuxMp4,
        organizeByPlatform: data.organizeByPlatform,
        proxyEnabled: data.proxyEnabled,
        proxyUrl: data.proxyUrl || DEFAULT_PROXY_URL,
    }
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
    const current = readStore()
    const hasOutputDirPatch = patch.outputDir !== undefined
    const next: StoreData = {
        outputDir: hasOutputDirPatch ? patch.outputDir! : current.outputDir,
        outputDirCustomized: hasOutputDirPatch ? true : current.outputDirCustomized,
        quality: patch.quality ?? current.quality,
        threads:
            patch.threads !== undefined
                ? Math.min(32, Math.max(1, patch.threads))
                : current.threads,
        remuxMp4: patch.remuxMp4 ?? current.remuxMp4,
        organizeByPlatform: patch.organizeByPlatform ?? current.organizeByPlatform,
        proxyEnabled: patch.proxyEnabled ?? current.proxyEnabled,
        proxyUrl:
            patch.proxyUrl !== undefined
                ? normalizeProxyUrl(patch.proxyUrl) || DEFAULT_PROXY_URL
                : current.proxyUrl,
    }
    writeStore(next)
    return getSettings()
}
