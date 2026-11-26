import type { RefObject } from 'react'
import type { PlatformInfo } from '../../../shared/platform'
import { QUALITY_OPTIONS, type QualityValue } from '../../../shared/quality'
import type { AppSettings } from '../../../shared/types'
import { currentMonth, monthsAgo, placeholderFor } from '../utils/format'
import {
    AlertTriangleIcon,
    ClipboardIcon,
    CloseIcon,
    DownloadIcon,
    FolderIcon,
    GlobeIcon,
    LinkIcon,
    ListSearchIcon,
    SpinnerIcon,
} from './Icons'

interface CommandPanelProps {
    urlInputRef: RefObject<HTMLInputElement | null>
    url: string
    onUrlChange: (value: string) => void
    detected: PlatformInfo
    settings: AppSettings
    isOutputDirInvalid: boolean
    fromMonth: string
    toMonth: string
    includeHighlights: boolean
    onFromMonthChange: (value: string) => void
    onToMonthChange: (value: string) => void
    onIncludeHighlightsChange: (checked: boolean) => void
    threadsDraft: string
    onThreadsDraftChange: (value: string) => void
    onCommitThreads: (value: string) => void
    onQualityChange: (quality: QualityValue) => void
    parsing: boolean
    submittingDownload: boolean
    onPaste: () => void
    onParse: () => void
    onDownloadDirect: () => void
    onOpenOutputDir: () => void
    onOpenSettings: (focusPath?: boolean) => void
}

export function CommandPanel({
    urlInputRef,
    url,
    onUrlChange,
    detected,
    settings,
    isOutputDirInvalid,
    fromMonth,
    toMonth,
    includeHighlights,
    onFromMonthChange,
    onToMonthChange,
    onIncludeHighlightsChange,
    threadsDraft,
    onThreadsDraftChange,
    onCommitThreads,
    onQualityChange,
    parsing,
    submittingDownload,
    onPaste,
    onParse,
    onDownloadDirect,
    onOpenOutputDir,
    onOpenSettings,
}: CommandPanelProps) {
    const isCctv = detected.id === 'cctv'
    const showProxyHint =
        detected.id !== 'unknown' && Boolean(detected.needsProxy) && !settings.proxyEnabled

    function stepThreads(delta: number): void {
        const current = Number.parseInt(threadsDraft, 10)
        const base = Number.isFinite(current) ? current : settings.threads
        const next = Math.min(32, Math.max(1, base + delta))
        onCommitThreads(String(next))
    }

    const threadTip = isCctv
        ? '同时拉取分片的线程数，建议保持在 8～16 之间'
        : '分段视频同时下载的分片数；建议 8～16，过高可能触发平台限流'

    return (
        <section className="win-card shrink-0 px-4 py-3.5">
            <div className="grid gap-3">
                {/* 标题与平台识别栏：两侧统一高度 24px 垂直居中 */}
                <div className="flex min-h-[24px] flex-wrap items-center justify-between gap-2">
                    <div className="flex min-h-[24px] items-center gap-2.5">
                        <label
                            htmlFor="video-url-input"
                            className="inline-flex h-6 items-center text-[14px] font-semibold leading-none text-[var(--ink)]"
                        >
                            新建下载
                        </label>
                        {detected.id !== 'unknown' ? (
                            <span
                                title={detected.hint}
                                className="inline-flex h-5.5 items-center gap-1 rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2.5 text-xs font-medium leading-none text-[var(--accent-text)]"
                            >
                                已识别：{detected.label}
                                {detected.id === 'douyin' || detected.id === 'tiktok'
                                    ? ' · 免登录无水印'
                                    : ''}
                            </span>
                        ) : null}
                    </div>

                    <div className="flex min-h-[24px] items-center">
                        {showProxyHint ? (
                            <div className="inline-flex h-6 items-center gap-1.5 rounded-full border border-[var(--caution-border)] bg-[var(--caution-bg)] px-2.5 text-xs leading-none text-[var(--caution)]">
                                <GlobeIcon className="h-3.5 w-3.5 shrink-0" />
                                <span>海外站点建议开启代理</span>
                                <button
                                    type="button"
                                    onClick={() => onOpenSettings(false)}
                                    className="ml-0.5 font-medium underline underline-offset-2 hover:opacity-80"
                                >
                                    去开启
                                </button>
                            </div>
                        ) : detected.id === 'unknown' ? (
                            <span className="inline-flex h-6 items-center text-xs leading-none text-[var(--muted)]">
                                支持 B站、抖音、央视网、快手、YouTube、X、TikTok、小红书等 16 个平台
                            </span>
                        ) : (
                            <span className="inline-flex h-6 items-center text-xs leading-none text-[var(--muted)]">
                                {detected.hint}
                            </span>
                        )}
                    </div>
                </div>

                {/* 主链接输入与操作按钮：统一 40px 高度对齐 */}
                <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                    <div className="relative min-w-[240px] flex-1">
                        <LinkIcon className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[var(--subtle)]" />
                        <input
                            ref={urlInputRef}
                            id="video-url-input"
                            value={url}
                            onChange={(event) => onUrlChange(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' && !parsing && !submittingDownload) {
                                    if (event.shiftKey || isCctv) {
                                        onParse()
                                    } else {
                                        onDownloadDirect()
                                    }
                                }
                            }}
                            placeholder={placeholderFor(detected.id)}
                            className="win-input h-10 w-full pr-9 pl-10 text-[13.5px]"
                        />
                        {url ? (
                            <button
                                type="button"
                                title="清空输入"
                                aria-label="清空输入"
                                onClick={() => {
                                    onUrlChange('')
                                    urlInputRef.current?.focus()
                                }}
                                className="win-btn-subtle absolute top-1/2 right-1.5 flex h-7 w-7 -translate-y-1/2 items-center justify-center"
                            >
                                <CloseIcon className="h-3.5 w-3.5" />
                            </button>
                        ) : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                        <button
                            type="button"
                            title="从剪贴板粘贴链接 (Ctrl+V)"
                            onClick={onPaste}
                            className="win-btn h-10 px-3.5"
                        >
                            <ClipboardIcon className="h-4 w-4 text-[var(--ink-secondary)]" />
                            <span>粘贴</span>
                        </button>
                        <button
                            type="button"
                            title="解析多集或合集列表后多选下载 (Shift+Enter)"
                            onClick={onParse}
                            disabled={parsing}
                            className="win-btn-soft h-10 px-3.5"
                        >
                            {parsing ? (
                                <SpinnerIcon className="h-4 w-4 animate-spin" />
                            ) : (
                                <ListSearchIcon className="h-4 w-4" />
                            )}
                            <span>{parsing ? '解析中…' : '解析列表'}</span>
                        </button>
                        <button
                            type="button"
                            title="直接加入下载队列 (Enter)"
                            onClick={onDownloadDirect}
                            disabled={submittingDownload}
                            className="win-btn-primary h-10 px-4.5"
                        >
                            {submittingDownload ? (
                                <SpinnerIcon className="h-4 w-4 animate-spin" />
                            ) : (
                                <DownloadIcon className="h-4 w-4" />
                            )}
                            <span>立即下载</span>
                        </button>
                    </div>
                </div>

                {/* 央视网多集筛选条 */}
                {isCctv ? (
                    <div className="win-subcard flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5">
                        <div className="flex flex-wrap items-center gap-3">
                            <label className="inline-flex h-7 items-center gap-1.5 text-xs leading-none text-[var(--ink-secondary)]">
                                <span>起始月份</span>
                                <input
                                    value={fromMonth}
                                    onChange={(event) => onFromMonthChange(event.target.value)}
                                    placeholder="yyyyMM"
                                    className="win-input h-7 w-22 px-2.5 text-xs tabular-nums"
                                />
                            </label>
                            <label className="inline-flex h-7 items-center gap-1.5 text-xs leading-none text-[var(--ink-secondary)]">
                                <span>结束月份</span>
                                <input
                                    value={toMonth}
                                    onChange={(event) => onToMonthChange(event.target.value)}
                                    placeholder="yyyyMM"
                                    className="win-input h-7 w-22 px-2.5 text-xs tabular-nums"
                                />
                            </label>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => {
                                        const cur = currentMonth()
                                        onFromMonthChange(cur)
                                        onToMonthChange(cur)
                                    }}
                                    className="win-btn-subtle h-7 px-2 text-xs"
                                >
                                    本月
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        onFromMonthChange(monthsAgo(1))
                                        onToMonthChange(currentMonth())
                                    }}
                                    className="win-btn-subtle h-7 px-2 text-xs"
                                >
                                    近两月
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        onFromMonthChange(monthsAgo(5))
                                        onToMonthChange(currentMonth())
                                    }}
                                    className="win-btn-subtle h-7 px-2 text-xs"
                                >
                                    近半年
                                </button>
                            </div>
                        </div>

                        <label className="inline-flex h-7 cursor-pointer items-center gap-2 text-xs leading-none text-[var(--ink)]">
                            <input
                                type="checkbox"
                                checked={includeHighlights}
                                onChange={(event) =>
                                    onIncludeHighlightsChange(event.target.checked)
                                }
                                className="h-4 w-4 rounded-[4px] accent-[var(--accent)]"
                            />
                            <span>包含看点 / 短片段</span>
                        </label>
                    </div>
                ) : null}

                {/* 底部参数与保存目录栏：统一 32px 行高垂直居中 */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-[var(--line)] pt-2.5">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="inline-flex h-8 items-center gap-2">
                            <span
                                tabIndex={0}
                                data-tip="默认 MAX 自动选原视频最高画质；指定档位不足时将自动向下回落，支持 4K / 2K。"
                                className="label-tip text-xs text-[var(--ink-secondary)]"
                            >
                                清晰度
                            </span>
                            <select
                                value={settings.quality}
                                onChange={(event) => {
                                    onQualityChange(Number(event.target.value) as QualityValue)
                                }}
                                title={QUALITY_OPTIONS.find((o) => o.value === settings.quality)?.hint}
                                className="win-select h-8 min-w-[96px] pl-3 text-xs font-medium"
                            >
                                {QUALITY_OPTIONS.map((option) => (
                                    <option
                                        key={option.value}
                                        value={option.value}
                                        title={option.hint}
                                    >
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="inline-flex h-8 items-center gap-2">
                            <span
                                tabIndex={0}
                                data-tip={threadTip}
                                className="label-tip text-xs text-[var(--ink-secondary)]"
                            >
                                {isCctv ? '下载线程' : '分片并发'}
                            </span>
                            <div className="inline-flex h-8 items-stretch overflow-hidden rounded-[8px] border border-[var(--line-strong)] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.02)]">
                                <button
                                    type="button"
                                    title="减少并发"
                                    onClick={() => stepThreads(-1)}
                                    className="flex w-7 items-center justify-center text-sm text-[var(--ink-secondary)] transition-colors hover:bg-slate-50 active:bg-slate-100"
                                >
                                    −
                                </button>
                                <input
                                    type="number"
                                    min={1}
                                    max={32}
                                    value={threadsDraft}
                                    onChange={(event) => onThreadsDraftChange(event.target.value)}
                                    onBlur={() => onCommitThreads(threadsDraft)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            onCommitThreads(threadsDraft)
                                        }
                                    }}
                                    className="w-9 border-x border-[var(--line)] bg-transparent text-center text-xs font-medium tabular-nums text-[var(--ink)] outline-none"
                                />
                                <button
                                    type="button"
                                    title="增加并发"
                                    onClick={() => stepThreads(1)}
                                    className="flex w-7 items-center justify-center text-sm text-[var(--ink-secondary)] transition-colors hover:bg-slate-50 active:bg-slate-100"
                                >
                                    +
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* 保存目录入口 */}
                    <div className="flex h-8 min-w-0 items-center">
                        {isOutputDirInvalid ? (
                            <button
                                type="button"
                                onClick={() => onOpenSettings(true)}
                                className="inline-flex h-7.5 max-w-[360px] items-center gap-1.5 rounded-[7px] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-2.5 text-xs leading-none text-[var(--danger)] hover:opacity-90"
                            >
                                <AlertTriangleIcon className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">保存目录无效，点击修改</span>
                            </button>
                        ) : (
                            <div className="inline-flex h-8 min-w-0 items-center gap-1">
                                <button
                                    type="button"
                                    title={`点击在资源管理器中打开：${settings.outputDir}`}
                                    onClick={onOpenOutputDir}
                                    className="win-btn-subtle h-7.5 max-w-[310px] px-2.5 text-xs"
                                >
                                    <FolderIcon className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                                    <span className="truncate text-[var(--ink-secondary)]">
                                        保存至：{settings.outputDir}
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onOpenSettings(true)}
                                    className="win-btn-subtle h-7.5 px-2 text-xs font-medium !text-[var(--accent-text)]"
                                >
                                    更改
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </section>
    )
}
