import { useLayoutEffect, useRef, useState } from 'react'
import type { DownloadJob } from '../../../shared/types'
import { canPauseJob, canResumeJob, canRetryJob } from '../utils/format'
import {
    CloseIcon,
    CopyIcon,
    ExternalOpenIcon,
    FolderIcon,
    PauseIcon,
    PlayIcon,
    RefreshIcon,
    TrashIcon,
} from './Icons'

export type JobAction =
    | 'open'
    | 'openWith'
    | 'reveal'
    | 'delete'
    | 'remove'
    | 'pause'
    | 'resume'
    | 'retry'
    | 'copyUrl'

export interface MenuState {
    x: number
    y: number
    job: DownloadJob
}

interface JobContextMenuProps {
    menu: MenuState | null
    onAction: (action: JobAction, job: DownloadJob) => void
    onClose: () => void
}

export function JobContextMenu({ menu, onAction }: JobContextMenuProps) {
    const ref = useRef<HTMLDivElement | null>(null)
    const [pos, setPos] = useState<{ left: number; top: number }>({
        left: menu?.x ?? 0,
        top: menu?.y ?? 0,
    })

    useLayoutEffect(() => {
        if (!menu || !ref.current) {
            return
        }
        const rect = ref.current.getBoundingClientRect()
        const margin = 8
        let left = menu.x
        let top = menu.y
        if (left + rect.width > window.innerWidth - margin) {
            left = Math.max(margin, window.innerWidth - rect.width - margin)
        }
        if (top + rect.height > window.innerHeight - margin) {
            top = Math.max(margin, window.innerHeight - rect.height - margin)
        }
        setPos({ left, top })
    }, [menu])

    if (!menu) {
        return null
    }

    const { job } = menu
    const completed = job.state === 'completed'
    const hasTopGroup =
        completed || canPauseJob(job.state) || canResumeJob(job.state) || canRetryJob(job)

    const itemBase =
        'flex h-8 w-full items-center gap-2.5 rounded-[6px] px-2.5 text-left text-[13px] leading-none transition-colors'

    return (
        <div
            ref={ref}
            data-job-menu="true"
            role="menu"
            className="win-flyout fixed z-50 min-w-[208px] p-1.5"
            style={{ left: pos.left, top: pos.top }}
        >
            {completed ? (
                <>
                    <button
                        type="button"
                        role="menuitem"
                        className={`${itemBase} font-medium text-[var(--ink)] hover:bg-slate-100/90`}
                        onClick={() => onAction('open', job)}
                    >
                        <PlayIcon className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                        <span>播放视频</span>
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        className={`${itemBase} text-[var(--ink)] hover:bg-slate-100/90`}
                        onClick={() => onAction('reveal', job)}
                    >
                        <FolderIcon className="h-3.5 w-3.5 shrink-0 text-[var(--ink-secondary)]" />
                        <span>在文件夹中显示</span>
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        className={`${itemBase} text-[var(--ink)] hover:bg-slate-100/90`}
                        onClick={() => onAction('openWith', job)}
                    >
                        <ExternalOpenIcon className="h-3.5 w-3.5 shrink-0 text-[var(--ink-secondary)]" />
                        <span>选择打开方式…</span>
                    </button>
                </>
            ) : null}

            {canPauseJob(job.state) ? (
                <button
                    type="button"
                    role="menuitem"
                    className={`${itemBase} text-[var(--ink)] hover:bg-slate-100/90`}
                    onClick={() => onAction('pause', job)}
                >
                    <PauseIcon className="h-3.5 w-3.5 shrink-0 text-[var(--ink-secondary)]" />
                    <span>暂停下载</span>
                </button>
            ) : null}

            {canResumeJob(job.state) ? (
                <button
                    type="button"
                    role="menuitem"
                    className={`${itemBase} text-[var(--ink)] hover:bg-slate-100/90`}
                    onClick={() => onAction('resume', job)}
                >
                    <PlayIcon className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                    <span>继续下载</span>
                </button>
            ) : null}

            {canRetryJob(job) ? (
                <button
                    type="button"
                    role="menuitem"
                    className={`${itemBase} text-[var(--ink)] hover:bg-slate-100/90`}
                    onClick={() => onAction('retry', job)}
                >
                    <RefreshIcon className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                    <span>重新下载</span>
                </button>
            ) : null}

            {job.url ? (
                <button
                    type="button"
                    role="menuitem"
                    className={`${itemBase} text-[var(--ink)] hover:bg-slate-100/90`}
                    onClick={() => onAction('copyUrl', job)}
                >
                    <CopyIcon className="h-3.5 w-3.5 shrink-0 text-[var(--ink-secondary)]" />
                    <span>复制视频链接</span>
                </button>
            ) : null}

            {hasTopGroup || job.url ? (
                <div className="my-1 border-t border-[var(--line)]" />
            ) : null}

            <button
                type="button"
                role="menuitem"
                className={`${itemBase} text-[var(--ink)] hover:bg-slate-100/90`}
                onClick={() => onAction('remove', job)}
            >
                <CloseIcon className="h-3.5 w-3.5 shrink-0 text-[var(--ink-secondary)]" />
                <span>从列表移除</span>
            </button>

            {completed ? (
                <button
                    type="button"
                    role="menuitem"
                    className={`${itemBase} text-[var(--danger)] hover:bg-[var(--danger-bg)]`}
                    onClick={() => onAction('delete', job)}
                >
                    <TrashIcon className="h-3.5 w-3.5 shrink-0" />
                    <span>删除本地文件…</span>
                </button>
            ) : null}
        </div>
    )
}
