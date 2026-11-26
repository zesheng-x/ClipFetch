import { spawn, type ChildProcess } from 'node:child_process'

/**
 * 终止子进程及其整棵进程树。
 *
 * Windows 下 yt-dlp.exe（PyInstaller 单文件封装）与 cctv-dl（可能拉起 ffmpeg）会派生子进程，
 * 直接调用 child.kill() 仅终止外层父进程，内层子进程仍持有 stdout/stderr 管道继续下载，
 * 导致第一次点暂停一直卡在「正在暂停…」。使用 taskkill /T /F 可瞬间结束整棵进程树。
 */
export function killProcessTree(child: ChildProcess | null | undefined): void {
    if (!child) {
        return
    }
    const pid = child.pid
    try {
        child.stdout?.destroy()
        child.stderr?.destroy()
    } catch {
        // ignore stream destroy errors
    }

    if (process.platform === 'win32' && pid && pid > 0) {
        try {
            const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
                windowsHide: true,
                stdio: 'ignore',
            })
            killer.unref()
            return
        } catch {
            // 回退到默认 kill
        }
    }

    try {
        if (!child.killed) {
            child.kill('SIGKILL')
        }
    } catch {
        // ignore
    }
}
