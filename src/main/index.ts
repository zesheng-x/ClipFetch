import {
    app,
    BrowserWindow,
    clipboard,
    dialog,
    ipcMain,
    Menu,
    nativeImage,
    session,
    shell,
} from 'electron'
import { existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { detectPlatform, getPlatformInfo, PLATFORM_CATALOG } from '../shared/platform'
import type {
    AppInfo,
    AppSettings,
    DownloadJob,
    DownloadRequest,
    ParseRequest,
} from '../shared/types'
import { downloadManager } from './downloadManager'
import { configureRuntime } from './runtime'
import { getSettings, updateSettings } from './settingsStore'
import { validateOutputDir } from './utils/outputPath'
import { resolveAppIconPath, resolveAppIconPngPath, resolveDefaultOutputDir } from './utils/paths'
import { normalizeProxyUrl, resolveProxyUrl } from './utils/proxy'

const APP_ID = 'com.zesheng.videodownloader'
const TITLEBAR_HEIGHT = 38
const PROXY_PARTITION = 'persist:zesheng-proxy'

if (process.platform === 'win32') {
    app.setAppUserModelId(APP_ID)
}

function bootstrapDesktopRuntime(): void {
    configureRuntime({
        mode: 'desktop',
        userDataPath: app.getPath('userData'),
        appPath: app.getAppPath(),
        resourcesPath: process.resourcesPath || join(app.getAppPath(), 'resources'),
        defaultOutputDir: join(app.getPath('videos'), '泽晟视频下载器'),
        electronFetch: async (input, init) => {
            const ses = session.fromPartition(PROXY_PARTITION)
            const proxy = resolveProxyUrl()
            if (proxy) {
                await ses.setProxy({
                    proxyRules: normalizeProxyUrl(proxy),
                    proxyBypassRules: '<local>',
                })
            } else {
                await ses.setProxy({ mode: 'direct' })
            }
            return ses.fetch(input, init)
        },
    })
}

let mainWindow: BrowserWindow | null = null
let cachedIconDataUrl: string | undefined | null = null

function getAppIconDataUrl(): string | undefined {
    if (cachedIconDataUrl !== null) {
        return cachedIconDataUrl
    }
    const pngPath = resolveAppIconPngPath()
    if (!pngPath) {
        cachedIconDataUrl = undefined
        return undefined
    }
    try {
        const image = nativeImage.createFromPath(pngPath)
        if (image.isEmpty()) {
            cachedIconDataUrl = undefined
            return undefined
        }
        cachedIconDataUrl = image.resize({ width: 96, height: 96 }).toDataURL()
        return cachedIconDataUrl
    } catch {
        cachedIconDataUrl = undefined
        return undefined
    }
}

function isJobActive(state: DownloadJob['state']): boolean {
    return (
        state === 'queued' ||
        state === 'resolving' ||
        state === 'downloading' ||
        state === 'concatenating' ||
        state === 'decrypting'
    )
}

/** 同步 Windows 任务栏图标进度条状态 */
function syncTaskbarProgress(jobs: DownloadJob[]): void {
    if (!mainWindow || mainWindow.isDestroyed()) {
        return
    }
    const activeJobs = jobs.filter((job) => isJobActive(job.state))
    if (activeJobs.length > 0) {
        const sum = activeJobs.reduce((acc, job) => acc + Math.max(0, Math.min(100, job.progress)), 0)
        const ratio = sum / (activeJobs.length * 100)
        if (ratio <= 0.02) {
            mainWindow.setProgressBar(2, { mode: 'indeterminate' })
        } else {
            mainWindow.setProgressBar(Math.max(0.03, Math.min(0.99, ratio)), { mode: 'normal' })
        }
        return
    }

    const pausedJobs = jobs.filter((job) => job.state === 'paused')
    if (pausedJobs.length > 0) {
        const sum = pausedJobs.reduce((acc, job) => acc + Math.max(0, Math.min(100, job.progress)), 0)
        const ratio = Math.max(0.05, sum / (pausedJobs.length * 100))
        mainWindow.setProgressBar(ratio, { mode: 'paused' })
        return
    }

    mainWindow.setProgressBar(-1)
}

/** 优先移入 Windows 回收站，网络盘等不支持场景回退直接删除 */
async function removeLocalFileSafely(targetPath: string): Promise<void> {
    if (!targetPath || !existsSync(targetPath)) {
        return
    }
    try {
        await shell.trashItem(targetPath)
    } catch {
        unlinkSync(targetPath)
    }
}

function createWindow(): void {
    const icon = resolveAppIconPath()
    mainWindow = new BrowserWindow({
        width: 1120,
        height: 740,
        minWidth: 860,
        minHeight: 580,
        title: '泽晟视频下载器',
        backgroundColor: '#f1f5f9',
        show: false,
        autoHideMenuBar: true,
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: '#f4f6f9',
            symbolColor: '#1e293b',
            height: TITLEBAR_HEIGHT,
        },
        ...(icon ? { icon } : {}),
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    })

    // 彻底移除顶部原生菜单栏，避免按 Alt 键弹出默认英文菜单
    mainWindow.removeMenu()
    mainWindow.setMenuBarVisibility(false)

    // 开发模式下允许 F12 / Ctrl+Shift+I 打开开发者工具
    if (!app.isPackaged) {
        mainWindow.webContents.on('before-input-event', (event, input) => {
            if (
                input.type === 'keyDown' &&
                (input.key === 'F12' ||
                    (input.control && input.shift && input.key.toLowerCase() === 'i'))
            ) {
                mainWindow?.webContents.toggleDevTools()
                event.preventDefault()
            }
        })
    }

    mainWindow.on('ready-to-show', () => {
        mainWindow?.show()
        syncTaskbarProgress(downloadManager.getJobs())
    })

    mainWindow.webContents.setWindowOpenHandler((details) => {
        void shell.openExternal(details.url)
        return { action: 'deny' }
    })

    if (process.env.ELECTRON_RENDERER_URL) {
        void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
        void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }
}

function broadcastJobUpdate(): void {
    const jobs = downloadManager.getJobs()
    syncTaskbarProgress(jobs)
    if (!mainWindow || mainWindow.isDestroyed()) {
        return
    }
    mainWindow.webContents.send('download:updated', jobs)
}

function registerIpc(): void {
    ipcMain.handle('app:getInfo', (): AppInfo => ({
        name: '泽晟视频下载器',
        version: app.getVersion(),
        defaultOutputDir: resolveDefaultOutputDir(),
        iconDataUrl: getAppIconDataUrl(),
    }))

    ipcMain.handle('clipboard:readText', () => clipboard.readText())

    ipcMain.handle('clipboard:writeText', (_event, text: string) => {
        clipboard.writeText(String(text ?? ''))
        return true
    })

    ipcMain.handle('settings:get', () => getSettings())

    ipcMain.handle('settings:update', (_event, patch: Partial<AppSettings>) => {
        return updateSettings(patch)
    })

    ipcMain.handle('settings:validateOutputDir', (_event, dir: string) => {
        return validateOutputDir(dir)
    })

    // Windows 原生文件夹选择对话框
    ipcMain.handle('dialog:pickOutputDir', async (_event, currentDir?: string) => {
        const fallback = resolveDefaultOutputDir()
        const check = currentDir ? validateOutputDir(currentDir) : null
        const defaultPath =
            check?.valid && existsSync(check.normalizedPath)
                ? check.normalizedPath
                : existsSync(fallback)
                  ? fallback
                  : app.getPath('videos')

        const result = mainWindow
            ? await dialog.showOpenDialog(mainWindow, {
                  title: '选择视频保存目录',
                  defaultPath,
                  buttonLabel: '选择文件夹',
                  properties: ['openDirectory', 'createDirectory'],
              })
            : await dialog.showOpenDialog({
                  title: '选择视频保存目录',
                  defaultPath,
                  buttonLabel: '选择文件夹',
                  properties: ['openDirectory', 'createDirectory'],
              })

        if (result.canceled || result.filePaths.length === 0) {
            return null
        }
        return result.filePaths[0]
    })

    // 打开保存目录（若合规且尚未创建则先自动创建，避免首次点击报错）
    ipcMain.handle('shell:openOutputDir', async (_event, targetDir?: string) => {
        const rawDir = targetDir?.trim() || getSettings().outputDir
        const check = validateOutputDir(rawDir)
        if (!check.valid) {
            throw new Error(check.reason || '保存目录无效，请先在设置中修正')
        }
        mkdirSync(check.normalizedPath, { recursive: true })
        const errMsg = await shell.openPath(check.normalizedPath)
        if (errMsg) {
            throw new Error(errMsg)
        }
        return true
    })

    // 按任务 ID 定位真实落盘文件（使用任务锁定目录，不读当前设置）
    ipcMain.handle('job:resolveFile', (_event, jobId: string) => {
        return downloadManager.resolveJobFilePath(String(jobId ?? ''))
    })

    ipcMain.handle('job:open', async (_event, jobId: string) => {
        const targetPath = downloadManager.resolveJobFilePath(String(jobId ?? ''))
        const errMsg = await shell.openPath(targetPath)
        if (errMsg) {
            throw new Error(errMsg)
        }
        return targetPath
    })

    ipcMain.handle('job:reveal', (_event, jobId: string) => {
        const targetPath = downloadManager.resolveJobFilePath(String(jobId ?? ''))
        shell.showItemInFolder(targetPath)
        return true
    })

    ipcMain.handle('job:openWith', async (_event, jobId: string) => {
        const targetPath = downloadManager.resolveJobFilePath(String(jobId ?? ''))
        await new Promise<void>((resolve, reject) => {
            execFile(
                'rundll32.exe',
                ['shell32.dll,OpenAs_RunDLL', targetPath],
                { windowsHide: true },
                (error) => {
                    if (error) {
                        reject(error)
                        return
                    }
                    resolve()
                },
            )
        })
        return true
    })

    ipcMain.handle('job:deleteFile', async (_event, jobId: string) => {
        const targetPath = downloadManager.resolveJobFilePath(String(jobId ?? ''))
        await removeLocalFileSafely(targetPath)
        return true
    })

    ipcMain.handle('platform:detect', (_event, url: string) => {
        const id = detectPlatform(url)
        return getPlatformInfo(id)
    })

    ipcMain.handle('platform:list', () => PLATFORM_CATALOG)

    ipcMain.handle('videos:list', async (_event, request: ParseRequest) => {
        return downloadManager.listVideos(request)
    })

    ipcMain.handle('download:start', async (_event, request: DownloadRequest) => {
        const settings = getSettings()
        const check = validateOutputDir(settings.outputDir)
        if (!check.valid) {
            throw new Error(`保存目录不合规（${check.reason}），请前往设置修改保存目录`)
        }
        mkdirSync(check.normalizedPath, { recursive: true })
        return downloadManager.download(request)
    })

    ipcMain.handle('download:retry', async (_event, jobId: string) => {
        const id = String(jobId ?? '')
        const job = downloadManager.findJob(id)
        if (!job) {
            throw new Error('原任务已不存在，请重新粘贴链接下载')
        }
        if (!job.url && !job.guid) {
            throw new Error('该任务缺少原始链接，请重新粘贴下载')
        }
        const settings = getSettings()
        const check = validateOutputDir(settings.outputDir)
        if (!check.valid) {
            throw new Error(`保存目录不合规（${check.reason}），请前往设置修改保存目录`)
        }
        mkdirSync(check.normalizedPath, { recursive: true })
        downloadManager.removeJob(id)
        return downloadManager.download({
            url: job.url,
            guid: job.guid,
            title: job.title,
            select: job.select,
            quality: settings.quality,
            platform: job.platform,
        })
    })

    ipcMain.handle('download:list', () => downloadManager.getJobs())

    ipcMain.handle('download:cancel', () => {
        downloadManager.cancelActive()
        return true
    })

    ipcMain.handle('download:cancelParse', () => {
        downloadManager.cancelParse()
        return true
    })

    ipcMain.handle('download:pause', (_event, jobId: string) => {
        return downloadManager.pauseJob(String(jobId ?? ''))
    })

    ipcMain.handle('download:resume', (_event, jobId: string) => {
        return downloadManager.resumeJob(String(jobId ?? ''))
    })

    ipcMain.handle('download:cancelJob', (_event, jobId: string) => {
        return downloadManager.cancelJob(String(jobId ?? ''))
    })

    ipcMain.handle('download:removeJob', async (_event, jobId: string, deleteLocalFile?: boolean) => {
        const id = String(jobId ?? '')
        const job = downloadManager.findJob(id)
        const cleanupTargets = deleteLocalFile ? downloadManager.resolveJobCleanupFiles(id) : []
        // 下载中移除时先终止子进程树，确保释放文件句柄后再移入回收站
        if (job && (isJobActive(job.state) || job.state === 'paused')) {
            downloadManager.cancelJob(id)
            if (deleteLocalFile) {
                await new Promise((resolve) => setTimeout(resolve, 120))
            }
        }
        if (deleteLocalFile && cleanupTargets.length > 0) {
            for (const filePath of cleanupTargets) {
                try {
                    await removeLocalFileSafely(filePath)
                } catch {
                    // 列表移除优先，单个临时文件删除失败不阻断
                }
            }
        }
        return downloadManager.removeJob(id)
    })
}

// 单实例锁：重复双击桌面快捷方式时唤醒已有窗口，防止多开冲突
const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
    app.quit()
} else {
    app.on('second-instance', () => {
        if (!mainWindow || mainWindow.isDestroyed()) {
            return
        }
        if (mainWindow.isMinimized()) {
            mainWindow.restore()
        }
        mainWindow.show()
        mainWindow.focus()
    })

    app.whenReady().then(() => {
        bootstrapDesktopRuntime()
        Menu.setApplicationMenu(null)
        registerIpc()
        // 启动时回写下载目录，供卸载程序识别
        getSettings()
        downloadManager.onJobs(() => broadcastJobUpdate())
        createWindow()

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow()
            }
        })
    })

    app.on('window-all-closed', () => {
        downloadManager.cancelActive()
        if (process.platform !== 'darwin') {
            app.quit()
        }
    })
}
