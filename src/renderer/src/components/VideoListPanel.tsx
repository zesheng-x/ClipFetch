import { useMemo, useRef, useState } from 'react'
import type { VideoItem } from '../../../shared/types'
import { formatDuration } from '../utils/format'
import { CloseIcon, DownloadIcon, FilmIcon, SearchIcon, TrashIcon } from './Icons'

interface VideoListPanelProps {
    videos: VideoItem[]
    selectedGuids: Set<string>
    submittingDownload: boolean
    onSelectGuids: (next: Set<string>) => void
    onRemoveItem: (item: VideoItem) => void
    onRemoveSelected: () => void
    onClearList: () => void
    onDownloadSelected: () => void
    onDownloadSingle: (item: VideoItem) => void
}

export function VideoListPanel({
    videos,
    selectedGuids,
    submittingDownload,
    onSelectGuids,
    onRemoveItem,
    onRemoveSelected,
    onClearList,
    onDownloadSelected,
    onDownloadSingle,
}: VideoListPanelProps) {
    const [keyword, setKeyword] = useState('')
    const lastClickedIndexRef = useRef<number | null>(null)

    const filteredVideos = useMemo(() => {
        const q = keyword.trim().toLowerCase()
        if (!q) {
            return videos
        }
        return videos.filter((item) => item.title.toLowerCase().includes(q))
    }, [videos, keyword])

    const allFilteredSelected =
        filteredVideos.length > 0 && filteredVideos.every((item) => selectedGuids.has(item.guid))

    function handleToggleAllFiltered(): void {
        if (filteredVideos.length === 0) {
            return
        }
        const next = new Set(selectedGuids)
        if (allFilteredSelected) {
            for (const item of filteredVideos) {
                next.delete(item.guid)
            }
        } else {
            for (const item of filteredVideos) {
                next.add(item.guid)
            }
        }
        onSelectGuids(next)
    }

    function handleRowSelect(indexInFiltered: number, guid: string, shiftKey: boolean): void {
        const next = new Set(selectedGuids)
        const shouldSelect = !next.has(guid)

        if (shiftKey && lastClickedIndexRef.current !== null && filteredVideos.length > 0) {
            const start = Math.max(0, Math.min(lastClickedIndexRef.current, indexInFiltered))
            const end = Math.min(
                filteredVideos.length - 1,
                Math.max(lastClickedIndexRef.current, indexInFiltered),
            )
            for (let i = start; i <= end; i += 1) {
                const targetGuid = filteredVideos[i].guid
                if (shouldSelect) {
                    next.add(targetGuid)
                } else {
                    next.delete(targetGuid)
                }
            }
        } else if (shouldSelect) {
            next.add(guid)
        } else {
            next.delete(guid)
        }

        lastClickedIndexRef.current = indexInFiltered
        onSelectGuids(next)
    }

    return (
        <section className="win-card flex min-h-0 min-w-0 flex-col overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
                <div className="flex min-h-[28px] items-center gap-2">
                    <h2 className="inline-flex items-center text-[14px] font-semibold leading-none text-[var(--ink)]">
                        解析列表
                    </h2>
                    <span className="inline-flex h-5 items-center rounded-full bg-slate-100 px-2 text-xs font-medium leading-none tabular-nums text-[var(--ink-secondary)]">
                        {videos.length}
                    </span>
                    {videos.length > 4 ? (
                        <div className="relative ml-1">
                            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[var(--subtle)]" />
                            <input
                                value={keyword}
                                onChange={(event) => setKeyword(event.target.value)}
                                placeholder="筛选标题…"
                                className="win-input h-7.5 w-38 pr-6 pl-7.5 text-xs"
                            />
                            {keyword ? (
                                <button
                                    type="button"
                                    onClick={() => setKeyword('')}
                                    className="win-btn-subtle absolute top-1/2 right-1 flex h-5.5 w-5.5 -translate-y-1/2 items-center justify-center"
                                >
                                    <CloseIcon className="h-3 w-3" />
                                </button>
                            ) : null}
                        </div>
                    ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                    <button
                        type="button"
                        onClick={handleToggleAllFiltered}
                        disabled={filteredVideos.length === 0}
                        className="win-btn h-7.5 px-2.5 text-xs"
                    >
                        {allFilteredSelected ? '取消全选' : '全选'}
                    </button>
                    {selectedGuids.size > 0 ? (
                        <button
                            type="button"
                            onClick={onRemoveSelected}
                            className="win-btn h-7.5 px-2.5 text-xs !text-[var(--danger)] hover:!bg-[var(--danger-bg)]"
                        >
                            <TrashIcon className="h-3.5 w-3.5" />
                            <span>移除选中</span>
                        </button>
                    ) : null}
                    {videos.length > 0 ? (
                        <button
                            type="button"
                            onClick={onClearList}
                            className="win-btn h-7.5 px-2.5 text-xs"
                        >
                            清空
                        </button>
                    ) : null}
                    <button
                        type="button"
                        onClick={onDownloadSelected}
                        disabled={submittingDownload || selectedGuids.size === 0}
                        className="win-btn-primary h-7.5 px-3 text-xs"
                    >
                        <DownloadIcon className="h-3.5 w-3.5" />
                        <span>
                            {submittingDownload
                                ? '加入中…'
                                : `下载选中 (${selectedGuids.size})`}
                        </span>
                    </button>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
                {videos.length === 0 ? (
                    <div className="flex h-full min-h-[190px] flex-col items-center justify-center gap-2.5 px-4 text-center lg:min-h-0">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-[var(--subtle)]">
                            <FilmIcon className="h-5 w-5" />
                        </div>
                        <div className="text-[13.5px] font-medium text-[var(--ink)]">
                            尚未解析节目列表
                        </div>
                        <div className="max-w-[260px] text-xs leading-relaxed text-[var(--muted)]">
                            点击上方「解析列表」可获取剧集或合集分 P，支持按住 Shift 连续多选
                        </div>
                    </div>
                ) : filteredVideos.length === 0 ? (
                    <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 text-xs text-[var(--muted)]">
                        <span>未找到匹配「{keyword}」的剧集</span>
                        <button
                            type="button"
                            onClick={() => setKeyword('')}
                            className="win-btn-subtle h-7 px-2.5 text-xs !text-[var(--accent-text)]"
                        >
                            清除筛选
                        </button>
                    </div>
                ) : (
                    <table className="w-full table-fixed border-collapse text-left text-[13px]">
                        <thead className="sticky top-0 z-10 border-b border-[var(--line)] bg-slate-50/95 text-xs text-[var(--muted)] backdrop-blur-xs">
                            <tr>
                                <th className="w-10 px-4 py-2.5 font-medium">
                                    <div className="flex items-center">
                                        <input
                                            type="checkbox"
                                            checked={allFilteredSelected}
                                            onChange={handleToggleAllFiltered}
                                            aria-label="全选当前列表"
                                            className="h-4 w-4 cursor-pointer rounded-[4px] accent-[var(--accent)]"
                                        />
                                    </div>
                                </th>
                                <th className="px-2 py-2.5 font-medium">标题</th>
                                <th className="w-16 px-2 py-2.5 font-medium">时长</th>
                                <th className="w-24 px-2 py-2.5 font-medium">日期</th>
                                <th className="w-18 px-3 py-2.5 text-right font-medium">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--line)]/75">
                            {filteredVideos.map((item, idx) => {
                                const selected = selectedGuids.has(item.guid)
                                return (
                                    <tr
                                        key={`${item.guid}-${item.index}`}
                                        onClick={(event) =>
                                            handleRowSelect(idx, item.guid, event.shiftKey)
                                        }
                                        className={`cursor-pointer transition-colors ${
                                            selected
                                                ? 'bg-[var(--accent-soft)]/80 hover:bg-[var(--accent-soft)]'
                                                : 'hover:bg-slate-50/90'
                                        }`}
                                    >
                                        <td
                                            className="px-4 py-2.5"
                                            onClick={(event) => event.stopPropagation()}
                                        >
                                            <div className="flex items-center">
                                                <input
                                                    type="checkbox"
                                                    checked={selected}
                                                    onChange={(event) => {
                                                        const shift =
                                                            event.nativeEvent instanceof
                                                                MouseEvent &&
                                                            event.nativeEvent.shiftKey
                                                        handleRowSelect(idx, item.guid, shift)
                                                    }}
                                                    className="h-4 w-4 cursor-pointer rounded-[4px] accent-[var(--accent)]"
                                                />
                                            </div>
                                        </td>
                                        <td
                                            className="truncate px-2 py-2.5 text-[var(--ink)]"
                                            title={item.title}
                                        >
                                            <span className="mr-1.5 text-xs tabular-nums text-[var(--subtle)]">
                                                {item.index}.
                                            </span>
                                            {item.title}
                                        </td>
                                        <td className="px-2 py-2.5 text-xs tabular-nums text-[var(--ink-secondary)]">
                                            {formatDuration(item.length)}
                                        </td>
                                        <td className="truncate px-2 py-2.5 text-xs tabular-nums text-[var(--muted)]">
                                            {item.time || '-'}
                                        </td>
                                        <td
                                            className="px-3 py-1.5 text-right"
                                            onClick={(event) => event.stopPropagation()}
                                        >
                                            <div className="inline-flex items-center justify-end gap-0.5">
                                                <button
                                                    type="button"
                                                    title="下载此项"
                                                    disabled={submittingDownload}
                                                    onClick={() => onDownloadSingle(item)}
                                                    className="win-btn-subtle flex h-7 w-7 items-center justify-center !text-[var(--accent-text)]"
                                                >
                                                    <DownloadIcon className="h-3.5 w-3.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    title="从列表移除"
                                                    onClick={() => onRemoveItem(item)}
                                                    className="win-btn-subtle flex h-7 w-7 items-center justify-center hover:!bg-[var(--danger-bg)] hover:!text-[var(--danger)]"
                                                >
                                                    <TrashIcon className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </section>
    )
}
