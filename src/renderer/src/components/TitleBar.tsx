import type { AppInfo } from '../../../shared/types'
import { DownloadIcon } from './Icons'

interface TitleBarProps {
    appInfo: AppInfo | null
    activeJobCount: number
    isOutputDirInvalid: boolean
    invalidReason?: string
    onOpenSettings: () => void
    onOpenAbout: () => void
}

export function TitleBar({
    appInfo,
    activeJobCount,
    isOutputDirInvalid,
    invalidReason,
    onOpenSettings,
    onOpenAbout,
}: TitleBarProps) {
    return (
        <header className="app-drag titlebar-bar flex w-full shrink-0 items-center pl-3.5">
            <div className="flex h-full min-w-0 items-center gap-2">
                {/* 应用图标与标题 */}
                <div className="flex h-full items-center gap-2">
                    {appInfo?.iconDataUrl ? (
                        <img
                            src={appInfo.iconDataUrl}
                            alt=""
                            className="h-4.5 w-4.5 shrink-0"
                            draggable={false}
                        />
                    ) : (
                        <div className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-[4px] bg-[var(--accent)] text-white">
                            <DownloadIcon className="h-3 w-3" />
                        </div>
                    )}
                    <span className="truncate text-[13px] font-semibold leading-none text-[var(--ink)]">
                        {appInfo?.name || '泽晟视频下载器'}
                    </span>
                </div>

                {/* 分隔竖线 */}
                <span className="mx-1 h-3.5 w-[1px] shrink-0 bg-[#cbd5e1]" />

                {/* Windows 桌面原生风格：左对齐纯文字菜单项（无图标） */}
                <nav className="app-no-drag flex h-full items-center gap-0.5">
                    <button
                        type="button"
                        title={
                            isOutputDirInvalid
                                ? invalidReason || '保存目录不合规，点击前往设置'
                                : '设置 (Ctrl+,)'
                        }
                        onClick={onOpenSettings}
                        className={`titlebar-menu-item relative ${
                            isOutputDirInvalid ? '!text-[var(--danger)] !font-medium' : ''
                        }`}
                    >
                        <span>设置</span>
                        {isOutputDirInvalid ? (
                            <span className="ml-1 h-1.5 w-1.5 rounded-full bg-[var(--danger)]" />
                        ) : null}
                    </button>
                    <button
                        type="button"
                        title="关于软件 (F1)"
                        onClick={onOpenAbout}
                        className="titlebar-menu-item"
                    >
                        <span>关于</span>
                    </button>
                </nav>

                {/* 进行中状态胶囊 */}
                {activeJobCount > 0 ? (
                    <span className="ml-1 inline-flex h-5 items-center gap-1.5 rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2 text-[11px] font-medium leading-none text-[var(--accent-text)]">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
                        <span>正在下载 {activeJobCount}</span>
                    </span>
                ) : null}
            </div>
        </header>
    )
}
