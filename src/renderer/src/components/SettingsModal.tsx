import { useEffect, useRef, useState } from 'react'
import type { AppSettings, OutputDirValidation } from '../../../shared/types'
import {
    AlertTriangleIcon,
    CheckCircleIcon,
    CloseIcon,
    FilmIcon,
    FolderIcon,
    GlobeIcon,
} from './Icons'

interface SettingsModalProps {
    open: boolean
    settings: AppSettings
    outputDirDraft: string
    defaultOutputDir: string
    validation: OutputDirValidation | null
    autoFocusPath: boolean
    onOutputDirChange: (value: string) => void
    onOutputDirBlur: () => void
    onBrowseOutputDir: () => void
    onOpenOutputDir: () => void
    onToggleOrganize: (checked: boolean) => void
    onToggleRemuxMp4: (checked: boolean) => void
    onProxyChange: (patch: { proxyEnabled?: boolean; proxyUrl?: string }) => void
    onClose: () => void
}

export function SettingsModal({
    open,
    settings,
    outputDirDraft,
    defaultOutputDir,
    validation,
    autoFocusPath,
    onOutputDirChange,
    onOutputDirBlur,
    onBrowseOutputDir,
    onOpenOutputDir,
    onToggleOrganize,
    onToggleRemuxMp4,
    onProxyChange,
    onClose,
}: SettingsModalProps) {
    const inputRef = useRef<HTMLInputElement | null>(null)
    const [proxyDraft, setProxyDraft] = useState(settings.proxyUrl)

    useEffect(() => {
        if (!open) {
            return
        }
        setProxyDraft(settings.proxyUrl)
        if (autoFocusPath) {
            window.setTimeout(() => {
                inputRef.current?.focus()
                inputRef.current?.select()
            }, 30)
        }
    }, [open, autoFocusPath, settings.proxyUrl])

    if (!open) {
        return null
    }

    const isInvalid = validation !== null && !validation.valid
    const isValid = validation !== null && validation.valid
    const isCustomDir =
        Boolean(defaultOutputDir) &&
        outputDirDraft.trim().toLowerCase() !== defaultOutputDir.trim().toLowerCase()

    function flushProxyUrl(): void {
        const next = proxyDraft.trim()
        if (next !== settings.proxyUrl) {
            onProxyChange({ proxyUrl: next })
        }
    }

    function handleDone(): void {
        onOutputDirBlur()
        flushProxyUrl()
        onClose()
    }

    return (
        <div
            className="win-backdrop fixed inset-0 z-40 flex items-center justify-center p-4"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    handleDone()
                }
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                className="win-dialog flex max-h-[86vh] w-full max-w-[540px] flex-col overflow-hidden"
            >
                <div className="flex shrink-0 items-center justify-between border-b border-[var(--line)] px-5 py-3.5">
                    <h3 className="text-[16px] font-semibold leading-none text-[var(--ink)]">
                        设置
                    </h3>
                    <button
                        type="button"
                        onClick={handleDone}
                        aria-label="关闭设置"
                        className="win-btn-subtle flex h-7.5 w-7.5 items-center justify-center"
                    >
                        <CloseIcon className="h-4 w-4" />
                    </button>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
                    {/* 存储目录设置卡片 */}
                    <div className="win-subcard grid gap-2.5 p-4">
                        <div className="flex h-6 items-center justify-between gap-2">
                            <div className="inline-flex items-center gap-2 leading-none">
                                <FolderIcon className="h-4 w-4 text-[var(--accent)]" />
                                <label
                                    htmlFor="settings-output-dir"
                                    className="text-[13.5px] font-medium text-[var(--ink)]"
                                >
                                    下载保存目录
                                </label>
                            </div>
                            {isCustomDir ? (
                                <button
                                    type="button"
                                    onClick={() => onOutputDirChange(defaultOutputDir)}
                                    className="win-btn-subtle h-6 px-2 text-xs !text-[var(--accent-text)]"
                                >
                                    恢复默认目录
                                </button>
                            ) : null}
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="relative min-w-0 flex-1">
                                <input
                                    ref={inputRef}
                                    id="settings-output-dir"
                                    type="text"
                                    spellCheck={false}
                                    value={outputDirDraft}
                                    onChange={(event) => onOutputDirChange(event.target.value)}
                                    onBlur={onOutputDirBlur}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            onOutputDirBlur()
                                        }
                                    }}
                                    placeholder={defaultOutputDir || '例如：D:\\Videos'}
                                    className={`win-input h-9 w-full pr-8.5 pl-3 text-[13px] ${
                                        isInvalid ? 'win-input-invalid' : ''
                                    }`}
                                />
                                <div className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2">
                                    {isInvalid ? (
                                        <AlertTriangleIcon className="h-4 w-4 text-[var(--danger)]" />
                                    ) : isValid ? (
                                        <CheckCircleIcon className="h-4 w-4 text-[var(--success)]" />
                                    ) : null}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={onBrowseOutputDir}
                                className="win-btn h-9 px-3.5"
                            >
                                浏览…
                            </button>
                            <button
                                type="button"
                                disabled={isInvalid}
                                onClick={onOpenOutputDir}
                                className="win-btn h-9 px-3.5"
                            >
                                打开
                            </button>
                        </div>

                        {isInvalid ? (
                            <div className="flex items-start gap-2 rounded-[8px] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-xs text-[var(--danger)]">
                                <AlertTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                <span>{validation.reason || '当前保存目录不合规，请重新选择'}</span>
                            </div>
                        ) : null}
                    </div>

                    {/* 按平台分子文件夹 */}
                    <div className="win-subcard flex items-center justify-between gap-3 px-4 py-3.5">
                        <div className="min-w-0">
                            <div className="text-[13.5px] font-medium text-[var(--ink)]">
                                按平台自动归类子文件夹
                            </div>
                            <div className="mt-1 text-xs text-[var(--muted)]">
                                在保存目录下自动创建「哔哩哔哩」「抖音」等子文件夹
                            </div>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-label="按平台自动归类子文件夹"
                            aria-checked={settings.organizeByPlatform}
                            onClick={() => onToggleOrganize(!settings.organizeByPlatform)}
                            className="win-switch"
                        >
                            <span className="win-switch-thumb" />
                        </button>
                    </div>

                    {/* 自动合并封装 MP4 */}
                    <div className="win-subcard flex items-center justify-between gap-3 px-4 py-3.5">
                        <div className="min-w-0">
                            <div className="inline-flex items-center gap-1.5 text-[13.5px] font-medium leading-none text-[var(--ink)]">
                                <FilmIcon className="h-4 w-4 text-[var(--accent)]" />
                                <span>自动封装为通用 MP4 格式</span>
                            </div>
                            <div className="mt-1 text-xs text-[var(--muted)]">
                                下载完成后自动合并音视频流为 MP4，兼容各类播放器与剪辑软件
                            </div>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-label="自动封装为通用 MP4 格式"
                            aria-checked={settings.remuxMp4}
                            onClick={() => onToggleRemuxMp4(!settings.remuxMp4)}
                            className="win-switch"
                        >
                            <span className="win-switch-thumb" />
                        </button>
                    </div>

                    {/* 网络代理 */}
                    <div className="win-subcard grid gap-3 p-4">
                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="inline-flex items-center gap-1.5 text-[13.5px] font-medium leading-none text-[var(--ink)]">
                                    <GlobeIcon className="h-4 w-4 text-[var(--accent)]" />
                                    <span>网络代理</span>
                                </div>
                                <p className="mt-1 text-xs text-[var(--muted)]">
                                    下载 YouTube、X、TikTok、Instagram 等海外平台视频时建议开启
                                </p>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-label="网络代理"
                                aria-checked={settings.proxyEnabled}
                                onClick={() =>
                                    onProxyChange({ proxyEnabled: !settings.proxyEnabled })
                                }
                                className="win-switch"
                            >
                                <span className="win-switch-thumb" />
                            </button>
                        </div>

                        <div className="grid gap-1.5">
                            <label
                                htmlFor="settings-proxy-url"
                                className="text-xs text-[var(--ink-secondary)]"
                            >
                                代理服务器地址（支持 HTTP / HTTPS / SOCKS5）
                            </label>
                            <input
                                id="settings-proxy-url"
                                type="text"
                                spellCheck={false}
                                disabled={!settings.proxyEnabled}
                                value={proxyDraft}
                                onChange={(event) => setProxyDraft(event.target.value)}
                                onBlur={flushProxyUrl}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        flushProxyUrl()
                                    }
                                }}
                                placeholder="http://127.0.0.1:7897"
                                className="win-input h-9 w-full px-3 text-[13px]"
                            />
                        </div>
                    </div>
                </div>

                <div className="win-dialog-footer flex shrink-0 items-center justify-end px-5 py-3.5">
                    <button
                        type="button"
                        onClick={handleDone}
                        className="win-btn-primary h-8.5 min-w-[96px] px-5"
                    >
                        确定
                    </button>
                </div>
            </div>
        </div>
    )
}
