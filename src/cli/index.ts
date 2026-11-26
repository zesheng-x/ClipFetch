import { createInterface } from 'node:readline'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { downloadManager } from '../main/downloadManager'
import { configureRuntime, resolveUserDownloadsDir } from '../main/runtime'
import { getSettings, updateSettings } from '../main/settingsStore'
import { detectPlatform, getPlatformInfo, supportedPlatformsText } from '../shared/platform'
import type { DownloadJob } from '../shared/types'
import { extractFirstUrl } from '../main/parsers/urlExtract'
import { validateOutputDir } from '../main/utils/outputPath'

const VERSION = readPackageVersion()

function readPackageVersion(): string {
    try {
        const root = findProjectRoot()
        const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
            version?: string
        }
        return pkg.version || '0.0.0'
    } catch {
        return '0.0.0'
    }
}

function findProjectRoot(): string {
    let dir = process.cwd()
    for (;;) {
        const pkgPath = join(dir, 'package.json')
        if (existsSync(pkgPath)) {
            try {
                const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string }
                if (pkg.name === 'clipfetch' || pkg.name === 'video-downloader') {
                    return dir
                }
            } catch {
                // 继续向上查找
            }
        }
        const parent = dirname(dir)
        if (parent === dir) {
            return process.cwd()
        }
        dir = parent
    }
}

function parseArgs(argv: string[]): { proxy?: string; enableProxy: boolean; help: boolean } {
    let proxy: string | undefined
    let enableProxy = false
    let help = false
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i]
        if (arg === '-h' || arg === '--help') {
            help = true
        } else if (arg === '--proxy') {
            enableProxy = true
            const next = argv[i + 1]
            if (next && !next.startsWith('-')) {
                proxy = next
                i += 1
            }
        } else if (arg.startsWith('--proxy=')) {
            enableProxy = true
            proxy = arg.slice('--proxy='.length)
        }
    }

    const envProxy =
        process.env.ALL_PROXY ||
        process.env.HTTPS_PROXY ||
        process.env.HTTP_PROXY ||
        process.env.https_proxy ||
        process.env.http_proxy
    if (!enableProxy && envProxy) {
        enableProxy = true
        proxy = proxy || envProxy
    }

    return { proxy, enableProxy, help }
}

function printHelp(): void {
    console.log(`ClipFetch CLI v${VERSION}
多平台视频命令行下载器（一次下载一条）

用法:
  pnpm cli
  pnpm cli --proxy
  pnpm cli --proxy http://127.0.0.1:7897

交互:
  粘贴分享链接或整段分享文案，回车即开始下载
  下载完成后可继续粘贴下一条
  输入 q / quit / exit 退出
  Ctrl+C 取消当前下载（若有）或退出

默认保存到系统「下载」文件夹:
  ${resolveUserDownloadsDir()}

支持平台:
  ${supportedPlatformsText()}
`)
}

function formatProgress(job: DownloadJob): string {
    const pct = Math.max(0, Math.min(100, Math.round(job.progress || 0)))
    const title = (job.title || '下载中').slice(0, 36)
    const msg = (job.message || job.state).replace(/\s+/g, ' ').slice(0, 40)
    return `  [${String(pct).padStart(3, ' ')}%] ${title} — ${msg}`
}

function isTerminalState(state: DownloadJob['state']): boolean {
    return (
        state === 'completed' ||
        state === 'failed' ||
        state === 'cancelled' ||
        state === 'skipped'
    )
}

async function waitForJob(jobId: string): Promise<DownloadJob> {
    const existing = downloadManager.findJob(jobId)
    if (existing && isTerminalState(existing.state)) {
        return existing
    }

    return new Promise((resolve) => {
        let lastLine = ''
        const unsubscribe = downloadManager.onJobs((jobs) => {
            const job = jobs.find((item) => item.id === jobId)
            if (!job) {
                return
            }
            const line = formatProgress(job)
            if (line !== lastLine) {
                process.stdout.write(`\r${line.padEnd(Math.max(lastLine.length, line.length))}`)
                lastLine = line
            }
            if (isTerminalState(job.state)) {
                process.stdout.write('\n')
                unsubscribe()
                resolve(job)
            }
        })
    })
}

function bootstrapCli(enableProxy: boolean, proxyUrl?: string): string {
    const root = findProjectRoot()
    const downloads = resolveUserDownloadsDir()

    configureRuntime({
        mode: 'cli',
        userDataPath: join(homedir(), '.clipfetch-cli'),
        appPath: root,
        resourcesPath: join(root, 'resources'),
        defaultOutputDir: downloads,
    })

    mkdirSync(downloads, { recursive: true })
    const check = validateOutputDir(downloads)
    if (!check.valid) {
        throw new Error(check.reason || '下载目录无效')
    }

    updateSettings({
        outputDir: check.normalizedPath,
        organizeByPlatform: false,
        remuxMp4: true,
        proxyEnabled: enableProxy,
        ...(proxyUrl ? { proxyUrl } : {}),
    })

    return check.normalizedPath
}

function ensureVendorReady(root: string): void {
    const ytDlp = join(root, 'resources', 'vendor', 'yt-dlp', 'yt-dlp.exe')
    const ffmpeg = join(root, 'resources', 'vendor', 'ffmpeg', 'ffmpeg.exe')
    if (!existsSync(ytDlp) || !existsSync(ffmpeg)) {
        throw new Error(
            '缺少运行时引擎。请先在项目根目录执行：\n  pnpm install\n  pnpm vendor:fetch',
        )
    }
}

async function downloadOne(rawInput: string): Promise<void> {
    const text = rawInput.trim()
    if (!text) {
        return
    }

    const url = extractFirstUrl(text) || text
    const platform = detectPlatform(url)
    const info = getPlatformInfo(platform)
    if (platform === 'unknown' || info.engine === 'none') {
        console.log(`  暂不支持该链接。当前支持：${supportedPlatformsText()}。`)
        return
    }

    console.log(`  平台：${info.label}`)
    const job = await downloadManager.download({
        url: text,
        platform,
        quality: getSettings().quality,
    })

    const finished = await waitForJob(job.id)
    if (finished.state === 'completed') {
        const saved =
            finished.outputPath ||
            (() => {
                try {
                    return downloadManager.resolveJobFilePath(finished.id)
                } catch {
                    return finished.outputDir || getSettings().outputDir
                }
            })()
        console.log(`  完成：${saved}`)
        return
    }

    console.log(`  失败：${finished.message || finished.state}`)
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2))
    if (args.help) {
        printHelp()
        return
    }

    const root = findProjectRoot()
    ensureVendorReady(root)
    const outputDir = bootstrapCli(args.enableProxy, args.proxy)

    console.log(`ClipFetch CLI v${VERSION}`)
    console.log(`保存目录：${outputDir}`)
    if (args.enableProxy) {
        console.log(`代理：已启用（${getSettings().proxyUrl}）`)
    } else {
        console.log('代理：未启用（海外站点可加 --proxy）')
    }
    console.log(`支持：${supportedPlatformsText()}`)
    console.log('粘贴分享链接后回车下载；输入 q 退出。\n')

    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
    })

    let busy = false
    let shuttingDown = false

    const ask = (): void => {
        if (shuttingDown) {
            return
        }
        rl.question('> ', (answer) => {
            void (async () => {
                const input = answer.trim()
                if (!input) {
                    ask()
                    return
                }
                if (/^(q|quit|exit)$/i.test(input)) {
                    shuttingDown = true
                    rl.close()
                    return
                }

                busy = true
                try {
                    await downloadOne(input)
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error)
                    console.log(`  错误：${message}`)
                } finally {
                    busy = false
                    console.log('')
                    ask()
                }
            })()
        })
    }

    const onSigInt = (): void => {
        if (busy) {
            downloadManager.cancelActive()
            console.log('\n  已取消当前下载')
            return
        }
        shuttingDown = true
        console.log('\n再见')
        rl.close()
        process.exit(0)
    }

    process.on('SIGINT', onSigInt)
    rl.on('close', () => {
        downloadManager.cancelActive()
        if (!shuttingDown) {
            console.log('再见')
        }
        process.exit(0)
    })

    ask()
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exit(1)
})
