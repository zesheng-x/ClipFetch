import { useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { getPlatformInfo } from '../../../shared/platform'
import { displayQualityLabel } from '../../../shared/quality'
import type { DownloadJob } from '../../../shared/types'
import {
    canPauseJob,
    canResumeJob,
    canRetryJob,
    isJobActive,
    isJobIndeterminate,
    stateBadgeClass,
    stateLabel,
} from '../utils/format'
import {
    DownloadIcon,
    FolderIcon,
    MoreHorizontalIcon,
    PauseIcon,
    PlayIcon,
    RefreshIcon,
    TrashIcon,
} from './Icons'
import type { JobAction } from './JobContextMenu'

type QueueFilter = 'all' | 'active' | 'completed' | 'failed'

interface DownloadQueuePanelProps {
    jobs: DownloadJob[]
    parsing: boolean
    hasActiveJobs: boolean
    hasFinishedJobs: boolean
    onClearFinished: () => void
    onCancelCurrent: () => void
    onJobAction: (action: JobAction, job: DownloadJob) => void
    onOpenJobMenu: (event: ReactMouseEvent, job: DownloadJob) => void
}

export function DownloadQueuePanel({
    jobs,
    parsing,
    hasActiveJobs,
    hasFinishedJobs,
    onClearFinished,
    onCancelCurrent,
    onJobAction,
    onOpenJobMenu,
}: DownloadQueuePanelProps) {
    const [filter, setFilter] = useState<QueueFilter>('all')

    const counts = useMemo(() => {
        let active = 0
        let completed = 0
        let failed = 0
        for (const job of jobs) {
            if (isJobActive(job.state) || job.state === 'paused') {
                active += 1
            } else if (job.state === 'completed') {
                completed += 1
            } else if (job.state === 'failed') {
                failed += 1
            }
        }
        return { all: jobs.length, active, completed, failed }
    }, [jobs])

    const visibleJobs = useMemo(() => {
        if (filter === 'active') {
            return jobs.filter((job) => isJobActive(job.state) || job.state === 'paused')
        }
        if (filter === 'completed') {
            return jobs.filter((job) => job.state === 'completed')
        }
        if (filter === 'failed') {
            return jobs.filter((job) => job.state === 'failed')
        }
        return jobs
    }, [jobs, filter])

    const hasCancellableWork = parsing || hasActiveJobs

    return (
        <section className="win-card flex min-h-0 min-w-0 flex-col overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
                <div className="flex min-h-[28px] flex-wrap items-center gap-2.5">
                    <h2 className="inline-flex items-center text-[14px] font-semibold leading-none text-[var(--ink)]">
                        下载任务
                    </h2>
                    {jobs.length > 0 ? (
                        <div className="inline-flex h-7 items-center rounded-[8px] bg-slate-100 p-0.5 text-xs">
                            {(
                                [
                                    { key: 'all', label: `全部 ${counts.all}` },
                                    { key: 'active', label: `进行中 ${counts.active}` },
                                    { key: 'completed', label: `已完成 ${counts.completed}` },
                                    ...(counts.failed > 0
                                        ? [{ key: 'failed', label: `失败 ${counts.failed}` }]
                                        : []),
                                ] as Array<{ key: QueueFilter; label: string }>
                            ).map((tab) => {
                                const selected = filter === tab.key
                                return (
                                    <button
                                        key={tab.key}
                                        type="button"
                                        onClick={() => setFilter(tab.key)}
                                        className={`inline-flex h-6 items-center rounded-[6px] px-2.5 leading-none tabular-nums transition-all ${
                                            selected
                                                ? 'bg-white font-medium text-[var(--ink)] shadow-[0_1px_2px_rgba(15,23,42,0.08)]'
                                                : 'text-[var(--muted)] hover:text-[var(--ink)]'
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                )
                            })}
                        </div>
                    ) : (
                        <span className="inline-flex h-5 items-center rounded-full bg-slate-100 px-2 text-xs font-medium leading-none tabular-nums text-[var(--ink-secondary)]">
                            0
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-1.5">
                    {hasFinishedJobs ? (
                        <button
                            type="button"
                            onClick={onClearFinished}
                            className="win-btn h-7.5 px-2.5 text-xs"
                        >
                            <TrashIcon className="h-3.5 w-3.5 text-[var(--ink-secondary)]" />
                            <span>清空记录</span>
                        </button>
                    ) : null}
                    <button
                        type="button"
                        onClick={onCancelCurrent}
                        disabled={!hasCancellableWork}
                        className="win-btn h-7.5 px-2.5 text-xs"
                    >
                        {parsing ? '取消解析' : '全部取消'}
                    </button>
                </div>
            </div>

            <div className="min-h-0 flex-1 space-y-2.5 overflow-auto p-3.5">
                {jobs.length === 0 ? (
                    <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2.5 text-center lg:min-h-0">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-[var(--subtle)]">
                            <DownloadIcon className="h-5 w-5" />
                        </div>
                        <div className="text-[13.5px] font-medium text-[var(--ink)]">
                            暂无下载任务
                        </div>
                        <div className="max-w-[330px] text-xs leading-relaxed text-[var(--muted)]">
                            复制视频链接后按{' '}
                            <kbd className="rounded-[5px] border border-[var(--line-strong)] bg-slate-50 px-1.5 py-0.5 font-sans text-[11px] font-medium text-[var(--ink-secondary)]">
                                Ctrl + V
                            </kbd>{' '}
                            快速填入，按{' '}
                            <kbd className="rounded-[5px] border border-[var(--line-strong)] bg-slate-50 px-1.5 py-0.5 font-sans text-[11px] font-medium text-[var(--ink-secondary)]">
                                Enter
                            </kbd>{' '}
                            直接下载
                        </div>
                    </div>
                ) : visibleJobs.length === 0 ? (
                    <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 text-xs text-[var(--muted)]">
                        <span>当前筛选下暂无任务</span>
                        <button
                            type="button"
                            onClick={() => setFilter('all')}
                            className="win-btn-subtle h-7 px-2.5 text-xs !text-[var(--accent-text)]"
                        >
                            查看全部任务
                        </button>
                    </div>
                ) : (
                    visibleJobs.map((job) => {
                        const completed = job.state === 'completed'
                        const active = isJobActive(job.state)
                        const indeterminate = isJobIndeterminate(job)

                        return (
                            <div
                                key={job.id}
                                title={completed ? '双击播放视频，右键查看更多操作' : '右键查看更多操作'}
                                onDoubleClick={() => {
                                    if (completed) {
                                        onJobAction('open', job)
                                    }
                                }}
                                onContextMenu={(event) => onOpenJobMenu(event, job)}
                                className={`rounded-[10px] border border-[var(--line)] bg-slate-50/55 p-3.5 transition-all ${
                                    completed
                                        ? 'hover:border-[var(--accent-border)] hover:bg-white hover:shadow-[0_3px_12px_rgba(15,23,42,0.04)]'
                                        : 'hover:border-[var(--line-strong)] hover:bg-white'
                                }`}
                            >
                                <div className="mb-2.5 flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div
                                            className="truncate text-[13.5px] font-medium text-[var(--ink)]"
                                            title={job.title}
                                        >
                                            {job.title}
                                        </div>
                                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                            <span
                                                className={`inline-flex h-5 items-center gap-1 rounded-[5px] border px-2 text-[11px] font-medium leading-none ${stateBadgeClass(job.state)}`}
                                            >
                                                {active ? (
                                                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
                                                ) : null}
                                                <span>{stateLabel(job.state)}</span>
                                            </span>
                                            {job.platform && job.platform !== 'unknown' ? (
                                                <span className="inline-flex h-5 items-center rounded-[5px] border border-[var(--line)] bg-white px-2 text-[11px] leading-none text-[var(--ink-secondary)]">
                                                    {getPlatformInfo(job.platform).label}
                                                </span>
                                            ) : null}
                                            <span className="inline-flex h-5 items-center rounded-[5px] border border-[var(--line)] bg-white px-2 text-[11px] leading-none tabular-nums text-[var(--ink-secondary)]">
                                                {displayQualityLabel(job.quality, job.qualityLabel)}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex shrink-0 items-center gap-1">
                                        {!completed && !indeterminate ? (
                                            <span className="mr-1 inline-flex h-7 items-center text-xs font-semibold leading-none tabular-nums text-[var(--ink-secondary)]">
                                                {Math.round(job.progress)}%
                                            </span>
                                        ) : null}

                                        {canPauseJob(job.state) ? (
                                            <button
                                                type="button"
                                                title="暂停下载"
                                                onClick={() => onJobAction('pause', job)}
                                                className="win-btn flex h-7.5 w-7.5 items-center justify-center p-0"
                                            >
                                                <PauseIcon className="h-3.5 w-3.5 text-[var(--ink-secondary)]" />
                                            </button>
                                        ) : null}

                                        {canResumeJob(job.state) ? (
                                            <button
                                                type="button"
                                                title="继续下载"
                                                onClick={() => onJobAction('resume', job)}
                                                className="win-btn flex h-7.5 w-7.5 items-center justify-center p-0 !text-[var(--accent-text)]"
                                            >
                                                <PlayIcon className="h-3.5 w-3.5" />
                                            </button>
                                        ) : null}

                                        {canRetryJob(job) ? (
                                            <button
                                                type="button"
                                                title="重新下载"
                                                onClick={() => onJobAction('retry', job)}
                                                className="win-btn h-7.5 px-2.5 text-xs !text-[var(--accent-text)]"
                                            >
                                                <RefreshIcon className="h-3.5 w-3.5" />
                                                <span>重试</span>
                                            </button>
                                        ) : null}

                                        {completed ? (
                                            <>
                                                <button
                                                    type="button"
                                                    title="播放视频（或双击卡片）"
                                                    onClick={() => onJobAction('open', job)}
                                                    className="win-btn flex h-7.5 w-7.5 items-center justify-center p-0 !text-[var(--accent-text)]"
                                                >
                                                    <PlayIcon className="h-3.5 w-3.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    title="在文件夹中显示"
                                                    onClick={() => onJobAction('reveal', job)}
                                                    className="win-btn flex h-7.5 w-7.5 items-center justify-center p-0"
                                                >
                                                    <FolderIcon className="h-3.5 w-3.5 text-[var(--ink-secondary)]" />
                                                </button>
                                            </>
                                        ) : null}

                                        <button
                                            type="button"
                                            title="更多操作"
                                            onClick={(event) => onOpenJobMenu(event, job)}
                                            className="win-btn-subtle flex h-7.5 w-7.5 items-center justify-center p-0"
                                        >
                                            <MoreHorizontalIcon className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>

                                <div className="h-1.5 overflow-hidden rounded-full bg-slate-200/80">
                                    {indeterminate ? (
                                        <div className="win-progress-indeterminate h-full rounded-full bg-[var(--accent)]" />
                                    ) : (
                                        <div
                                            className={`h-full rounded-full transition-[width] duration-300 ${
                                                job.state === 'failed'
                                                    ? 'bg-[var(--danger)]'
                                                    : job.state === 'completed'
                                                      ? 'bg-[var(--success)]'
                                                      : job.state === 'cancelled' ||
                                                          job.state === 'skipped'
                                                        ? 'bg-slate-400'
                                                        : job.state === 'paused'
                                                          ? 'bg-amber-400'
                                                          : 'bg-gradient-to-r from-[#0b79d6] to-[#0063b8]'
                                            }`}
                                            style={{
                                                width: `${Math.max(0, Math.min(100, job.progress))}%`,
                                            }}
                                        />
                                    )}
                                </div>

                                {job.message ? (
                                    <div
                                        className={`mt-2 break-all text-xs leading-relaxed ${
                                            job.state === 'failed'
                                                ? 'text-[var(--danger)]'
                                                : 'text-[var(--muted)]'
                                        }`}
                                    >
                                        {job.message}
                                    </div>
                                ) : null}
                            </div>
                        )
                    })
                )}
            </div>
        </section>
    )
}
