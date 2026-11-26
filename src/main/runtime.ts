import { homedir } from 'node:os'
import { join } from 'node:path'

export type AppMode = 'desktop' | 'cli'

export type ProxiedFetchFn = (
    input: string,
    init?: RequestInit & { timeoutMs?: number },
) => Promise<Response>

export interface RuntimeConfig {
    mode: AppMode
    userDataPath: string
    appPath: string
    resourcesPath: string
    defaultOutputDir: string
    /** 桌面端可注入 Electron session.fetch；CLI 走 Node 实现 */
    electronFetch?: ProxiedFetchFn
}

function defaultDownloadsDir(): string {
    return join(homedir(), 'Downloads')
}

let runtime: RuntimeConfig = {
    mode: 'cli',
    userDataPath: join(homedir(), '.clipfetch'),
    appPath: process.cwd(),
    resourcesPath: join(process.cwd(), 'resources'),
    defaultOutputDir: defaultDownloadsDir(),
}

export function configureRuntime(partial: Partial<RuntimeConfig>): void {
    runtime = {
        ...runtime,
        ...partial,
        userDataPath: partial.userDataPath ?? runtime.userDataPath,
        appPath: partial.appPath ?? runtime.appPath,
        resourcesPath: partial.resourcesPath ?? runtime.resourcesPath,
        defaultOutputDir: partial.defaultOutputDir ?? runtime.defaultOutputDir,
    }
}

export function getRuntime(): RuntimeConfig {
    return runtime
}

export function resolveUserDownloadsDir(): string {
    return defaultDownloadsDir()
}
