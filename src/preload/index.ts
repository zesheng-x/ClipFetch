import { contextBridge, ipcRenderer } from 'electron'
import type { PlatformInfo } from '../shared/platform'
import type {
    AppInfo,
    AppSettings,
    DownloadJob,
    DownloadRequest,
    ListResult,
    OutputDirValidation,
    ParseRequest,
} from '../shared/types'

const api = {
    getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:getInfo'),
    readClipboardText: (): Promise<string> => ipcRenderer.invoke('clipboard:readText'),
    writeClipboardText: (text: string): Promise<boolean> =>
        ipcRenderer.invoke('clipboard:writeText', text),
    getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    updateSettings: (patch: Partial<AppSettings>): Promise<AppSettings> =>
        ipcRenderer.invoke('settings:update', patch),
    validateOutputDir: (dir: string): Promise<OutputDirValidation> =>
        ipcRenderer.invoke('settings:validateOutputDir', dir),
    pickOutputDir: (currentDir?: string): Promise<string | null> =>
        ipcRenderer.invoke('dialog:pickOutputDir', currentDir),
    openOutputDir: (targetDir?: string): Promise<boolean> =>
        ipcRenderer.invoke('shell:openOutputDir', targetDir),
    resolveJobFile: (jobId: string): Promise<string> =>
        ipcRenderer.invoke('job:resolveFile', jobId),
    openJob: (jobId: string): Promise<string> => ipcRenderer.invoke('job:open', jobId),
    revealJob: (jobId: string): Promise<boolean> => ipcRenderer.invoke('job:reveal', jobId),
    openJobWith: (jobId: string): Promise<boolean> => ipcRenderer.invoke('job:openWith', jobId),
    deleteJobFile: (jobId: string): Promise<boolean> =>
        ipcRenderer.invoke('job:deleteFile', jobId),
    detectPlatform: (url: string): Promise<PlatformInfo> =>
        ipcRenderer.invoke('platform:detect', url),
    listPlatforms: (): Promise<PlatformInfo[]> => ipcRenderer.invoke('platform:list'),
    listVideos: (request: ParseRequest): Promise<ListResult> =>
        ipcRenderer.invoke('videos:list', request),
    startDownload: (request: DownloadRequest): Promise<DownloadJob> =>
        ipcRenderer.invoke('download:start', request),
    retryDownload: (jobId: string): Promise<DownloadJob> =>
        ipcRenderer.invoke('download:retry', jobId),
    listDownloads: (): Promise<DownloadJob[]> => ipcRenderer.invoke('download:list'),
    cancelDownload: (): Promise<boolean> => ipcRenderer.invoke('download:cancel'),
    cancelParse: (): Promise<boolean> => ipcRenderer.invoke('download:cancelParse'),
    pauseDownload: (jobId: string): Promise<boolean> =>
        ipcRenderer.invoke('download:pause', jobId),
    resumeDownload: (jobId: string): Promise<boolean> =>
        ipcRenderer.invoke('download:resume', jobId),
    cancelJob: (jobId: string): Promise<boolean> =>
        ipcRenderer.invoke('download:cancelJob', jobId),
    removeJob: (jobId: string, deleteLocalFile?: boolean): Promise<boolean> =>
        ipcRenderer.invoke('download:removeJob', jobId, Boolean(deleteLocalFile)),
    onDownloadsUpdated: (listener: (jobs: DownloadJob[]) => void): (() => void) => {
        const handler = (_event: Electron.IpcRendererEvent, jobs: DownloadJob[]): void => {
            listener(jobs)
        }
        ipcRenderer.on('download:updated', handler)
        return () => {
            ipcRenderer.removeListener('download:updated', handler)
        }
    },
}

contextBridge.exposeInMainWorld('videoApi', api)

export type VideoApi = typeof api
