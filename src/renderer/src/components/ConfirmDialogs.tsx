import type { DownloadJob } from '../../../shared/types'
import { isJobActive } from '../utils/format'
import { AlertTriangleIcon } from './Icons'

export interface InvalidPathPromptState {
    path: string
    reason: string
}

export interface RemovePromptState {
    job: DownloadJob
    deleteLocalFile: boolean
    mode: 'remove' | 'deleteFile'
}

interface InvalidPathDialogProps {
    prompt: InvalidPathPromptState | null
    onCancel: () => void
    onConfirmGoSettings: () => void
}

export function InvalidPathDialog({
    prompt,
    onCancel,
    onConfirmGoSettings,
}: InvalidPathDialogProps) {
    if (!prompt) {
        return null
    }

    return (
        <div
            className="win-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    onCancel()
                }
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                className="win-dialog w-full max-w-[436px] overflow-hidden"
            >
                <div className="p-5">
                    <div className="flex items-start gap-3.5">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[var(--danger-bg)] text-[var(--danger)]">
                            <AlertTriangleIcon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h3 className="text-[16px] font-semibold text-[var(--ink)]">
                                保存目录不可用
                            </h3>
                            <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--ink-secondary)]">
                                {prompt.reason}。请先选择或修改有效的保存文件夹后再开始下载。
                            </p>
                            {prompt.path ? (
                                <div className="selectable mt-2.5 rounded-[8px] border border-[var(--danger-border)] bg-[var(--danger-bg)]/80 px-3 py-2 text-xs break-all text-[var(--danger)]">
                                    {prompt.path}
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>

                <div className="win-dialog-footer flex items-center justify-end gap-2 px-5 py-3.5">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="win-btn h-8.5 min-w-[88px] px-4"
                    >
                        取消
                    </button>
                    <button
                        type="button"
                        onClick={onConfirmGoSettings}
                        className="win-btn-primary h-8.5 min-w-[96px] px-4"
                    >
                        修改目录
                    </button>
                </div>
            </div>
        </div>
    )
}

interface RemoveJobDialogProps {
    prompt: RemovePromptState | null
    onToggleDeleteFile: (checked: boolean) => void
    onCancel: () => void
    onConfirm: (job: DownloadJob, deleteLocalFile: boolean) => void
}

export function RemoveJobDialog({
    prompt,
    onToggleDeleteFile,
    onCancel,
    onConfirm,
}: RemoveJobDialogProps) {
    if (!prompt) {
        return null
    }

    const { job, deleteLocalFile, mode } = prompt
    const isDirectDelete = mode === 'deleteFile'
    const canChooseLocalDelete =
        !isDirectDelete &&
        (Boolean(job.outputPath) ||
            isJobActive(job.state) ||
            job.state === 'paused' ||
            job.state === 'completed')

    return (
        <div
            className="win-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    onCancel()
                }
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                className="win-dialog w-full max-w-[440px] overflow-hidden"
            >
                <div className="p-5">
                    <div className="flex items-start gap-3.5">
                        <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] ${
                                isDirectDelete || deleteLocalFile
                                    ? 'bg-[var(--danger-bg)] text-[var(--danger)]'
                                    : 'bg-[var(--caution-bg)] text-[var(--caution)]'
                            }`}
                        >
                            <AlertTriangleIcon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h3 className="text-[16px] font-semibold text-[var(--ink)]">
                                {isDirectDelete ? '删除本地视频文件？' : '移除下载任务？'}
                            </h3>
                            <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--ink-secondary)]">
                                {isDirectDelete
                                    ? '确定将该视频文件移入 Windows 回收站，并从任务列表中移除吗？'
                                    : isJobActive(job.state)
                                      ? '该任务仍在下载中，移除后将立即停止当前下载。'
                                      : job.state === 'paused'
                                        ? '该任务处于暂停状态，移除后将不再继续下载。'
                                        : '从列表移除记录不会影响文件夹中已保存的视频，除非勾选下方选项。'}
                            </p>

                            <div
                                className="mt-2.5 truncate rounded-[8px] border border-[var(--line)] bg-slate-50 px-3 py-2 text-xs text-[var(--ink-secondary)]"
                                title={job.title}
                            >
                                {job.title}
                            </div>

                            {canChooseLocalDelete ? (
                                <label className="mt-3 flex cursor-pointer items-center gap-2.5 rounded-[8px] border border-[var(--line)] bg-slate-50/80 px-3 py-2.5 text-[13px] leading-none text-[var(--ink)]">
                                    <input
                                        type="checkbox"
                                        checked={deleteLocalFile}
                                        onChange={(event) =>
                                            onToggleDeleteFile(event.target.checked)
                                        }
                                        className="h-4 w-4 rounded-[4px] accent-[var(--accent)]"
                                    />
                                    <span>同时将本地文件移入回收站</span>
                                </label>
                            ) : null}
                        </div>
                    </div>
                </div>

                <div className="win-dialog-footer flex items-center justify-end gap-2 px-5 py-3.5">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="win-btn h-8.5 min-w-[88px] px-4"
                    >
                        取消
                    </button>
                    <button
                        type="button"
                        onClick={() => onConfirm(job, isDirectDelete ? true : deleteLocalFile)}
                        className={`${
                            isDirectDelete || deleteLocalFile ? 'win-btn-danger' : 'win-btn-primary'
                        } h-8.5 min-w-[96px] px-4`}
                    >
                        {isDirectDelete || deleteLocalFile ? '移入回收站' : '确认移除'}
                    </button>
                </div>
            </div>
        </div>
    )
}
