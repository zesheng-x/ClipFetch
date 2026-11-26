import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import {
    OVERSEAS_PROXY_TIP,
    getPlatformInfo,
    supportedPlatformsText,
    type PlatformInfo,
} from '../../shared/platform'
import type { QualityValue } from '../../shared/quality'
import type {
    AppInfo,
    AppSettings,
    DownloadJob,
    OutputDirValidation,
    VideoItem,
} from '../../shared/types'
import { AboutModal } from './components/AboutModal'
import { CommandPanel } from './components/CommandPanel'
import {
    InvalidPathDialog,
    RemoveJobDialog,
    type InvalidPathPromptState,
    type RemovePromptState,
} from './components/ConfirmDialogs'
import { DownloadQueuePanel } from './components/DownloadQueuePanel'
import { SpinnerIcon } from './components/Icons'
import { JobContextMenu, type JobAction, type MenuState } from './components/JobContextMenu'
import { SettingsModal } from './components/SettingsModal'
import { TitleBar } from './components/TitleBar'
import { ToastBanner, type ToastState } from './components/ToastBanner'
import { VideoListPanel } from './components/VideoListPanel'
import { currentMonth, isJobActive, monthsAgo } from './utils/format'

export default function App() {
    const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
    const [url, setUrl] = useState('')
    const [fromMonth, setFromMonth] = useState(monthsAgo(1))
    const [toMonth, setToMonth] = useState(currentMonth())
    const [includeHighlights, setIncludeHighlights] = useState(false)
    const [videos, setVideos] = useState<VideoItem[]>([])
    const [selectedGuids, setSelectedGuids] = useState<Set<string>>(new Set())
    const [settings, setSettings] = useState<AppSettings | null>(null)
    const [outputDirDraft, setOutputDirDraft] = useState('')
    const [outputDirValidation, setOutputDirValidation] = useState<OutputDirValidation | null>(null)
    const [threadsDraft, setThreadsDraft] = useState('8')
    const [jobs, setJobs] = useState<DownloadJob[]>([])
    const [detected, setDetected] = useState<PlatformInfo>(getPlatformInfo('unknown'))
    const [parsing, setParsing] = useState(false)
    const [submittingDownload, setSubmittingDownload] = useState(false)
    const [toast, setToast] = useState<ToastState | null>(null)
    const [toastLeaving, setToastLeaving] = useState(false)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [focusPathOnSettingsOpen, setFocusPathOnSettingsOpen] = useState(false)
    const [aboutOpen, setAboutOpen] = useState(false)
    const [invalidPathPrompt, setInvalidPathPrompt] = useState<InvalidPathPromptState | null>(null)
    const [menu, setMenu] = useState<MenuState | null>(null)
    const [removePrompt, setRemovePrompt] = useState<RemovePromptState | null>(null)

    const toastTimerRef = useRef<number | null>(null)
    const toastLeaveTimerRef = useRef<number | null>(null)
    const urlInputRef = useRef<HTMLInputElement | null>(null)
    const outputDirInitializedRef = useRef(false)
    const saveTimerRef = useRef<number | null>(null)
    const validateSeqRef = useRef(0)
    const overseasProxyTipRef = useRef(new Set<string>())
    const overseasStallTrackRef = useRef(
        new Map<string, { signature: string; changedAt: number }>(),
    )

    const isCctv = detected.id === 'cctv'
    const showVideoList = isCctv || videos.length > 0
    const activeJobCount = useMemo(
        () => jobs.filter((job) => isJobActive(job.state)).length,
        [jobs],
    )
    const hasActiveJobs = activeJobCount > 0
    const hasFinishedJobs = useMemo(
        () => jobs.some((job) => !isJobActive(job.state) && job.state !== 'paused'),
        [jobs],
    )
    const isOutputDirInvalid = outputDirValidation !== null && !outputDirValidation.valid

    function clearToastTimers(): void {
        if (toastTimerRef.current !== null) {
            window.clearTimeout(toastTimerRef.current)
            toastTimerRef.current = null
        }
        if (toastLeaveTimerRef.current !== null) {
            window.clearTimeout(toastLeaveTimerRef.current)
            toastLeaveTimerRef.current = null
        }
    }

    function dismissToast(): void {
        clearToastTimers()
        setToastLeaving(true)
        toastLeaveTimerRef.current = window.setTimeout(() => {
            setToast(null)
            setToastLeaving(false)
            toastLeaveTimerRef.current = null
        }, 160)
    }

    function pushToast(
        text: string,
        kind: 'ok' | 'err' = 'ok',
        action?: { label: string; run: () => void },
    ): void {
        if (!text) {
            dismissToast()
            return
        }
        clearToastTimers()
        setToastLeaving(false)
        setToast({
            key: Date.now(),
            text,
            kind,
            actionLabel: action?.label,
            onAction: action?.run,
        })
        const delay = text === OVERSEAS_PROXY_TIP ? 9000 : kind === 'err' ? 5800 : 3600
        toastTimerRef.current = window.setTimeout(() => {
            setToastLeaving(true)
            toastLeaveTimerRef.current = window.setTimeout(() => {
                setToast(null)
                setToastLeaving(false)
                toastLeaveTimerRef.current = null
            }, 160)
        }, delay)
    }

    function setError(message: string): void {
        pushToast(message, 'err')
    }

    function setNotice(message: string, action?: { label: string; run: () => void }): void {
        pushToast(message, 'ok', action)
    }

    // 初始化配置、应用信息、任务列表
    useEffect(() => {
        void window.videoApi.getAppInfo().then(setAppInfo)
        void window.videoApi.getSettings().then((loaded) => {
            setSettings(loaded)
            setOutputDirDraft(loaded.outputDir)
            setThreadsDraft(String(loaded.threads))
            outputDirInitializedRef.current = true
            void window.videoApi.validateOutputDir(loaded.outputDir).then(setOutputDirValidation)
        })
        void window.videoApi.listDownloads().then(setJobs)
        return window.videoApi.onDownloadsUpdated(setJobs)
    }, [])

    // 自动识别平台
    useEffect(() => {
        const trimmed = url.trim()
        if (!trimmed) {
            setDetected(getPlatformInfo('unknown'))
            return
        }
        const timer = window.setTimeout(() => {
            void window.videoApi.detectPlatform(trimmed).then(setDetected)
        }, 140)
        return () => window.clearTimeout(timer)
    }, [url])

    // 海外站未开代理：卡住约 25 秒或失败时友好提示并附带一键打开设置
    useEffect(() => {
        if (!settings || settings.proxyEnabled) {
            return
        }

        const promptProxy = (): void => {
            setNotice(OVERSEAS_PROXY_TIP, {
                label: '代理设置',
                run: () => openSettingsModal(false),
            })
        }

        const tippedRef = overseasProxyTipRef.current
        for (const job of jobs) {
            const needsProxy = getPlatformInfo(job.platform ?? 'unknown').needsProxy
            if (!needsProxy || tippedRef.has(job.id)) {
                continue
            }
            if (job.state === 'failed') {
                tippedRef.add(job.id)
                promptProxy()
            }
        }

        const track = overseasStallTrackRef.current
        const now = Date.now()
        for (const job of jobs) {
            const needsProxy = getPlatformInfo(job.platform ?? 'unknown').needsProxy
            if (!needsProxy || !isJobActive(job.state) || tippedRef.has(job.id)) {
                track.delete(job.id)
                continue
            }
            const signature = `${job.state}:${job.progress}`
            const prev = track.get(job.id)
            if (!prev || prev.signature !== signature) {
                track.set(job.id, { signature, changedAt: now })
                continue
            }
            if (now - prev.changedAt >= 25000) {
                tippedRef.add(job.id)
                promptProxy()
            }
        }

        const timer = window.setInterval(() => {
            const tick = Date.now()
            for (const [jobId, meta] of track) {
                if (tippedRef.has(jobId)) {
                    continue
                }
                if (tick - meta.changedAt >= 25000) {
                    tippedRef.add(jobId)
                    promptProxy()
                }
            }
        }, 3000)
        return () => window.clearInterval(timer)
    }, [jobs, settings])

    // Windows 桌面端快捷键：Esc 关闭栈、Ctrl+, 打开设置、F1 打开关于、空白处 Ctrl+V 快速粘贴链接
    useEffect(() => {
        function onKeyDown(event: KeyboardEvent): void {
            if (event.key === 'Escape') {
                if (menu) {
                    setMenu(null)
                    return
                }
                if (removePrompt) {
                    setRemovePrompt(null)
                    return
                }
                if (invalidPathPrompt) {
                    setInvalidPathPrompt(null)
                    return
                }
                if (settingsOpen) {
                    void flushOutputDirSave(outputDirDraft)
                    setSettingsOpen(false)
                    setFocusPathOnSettingsOpen(false)
                    return
                }
                if (aboutOpen) {
                    setAboutOpen(false)
                }
                return
            }

            if ((event.ctrlKey || event.metaKey) && event.key === ',') {
                event.preventDefault()
                openSettingsModal(isOutputDirInvalid)
                return
            }

            if (event.key === 'F1') {
                event.preventDefault()
                setAboutOpen(true)
                return
            }

            const hasModalOpen =
                Boolean(menu) ||
                Boolean(removePrompt) ||
                Boolean(invalidPathPrompt) ||
                settingsOpen ||
                aboutOpen

            if (
                !hasModalOpen &&
                (event.ctrlKey || event.metaKey) &&
                event.key.toLowerCase() === 'v'
            ) {
                const activeEl = document.activeElement
                const isEditable =
                    activeEl instanceof HTMLInputElement ||
                    activeEl instanceof HTMLTextAreaElement ||
                    (activeEl instanceof HTMLElement && activeEl.isContentEditable)
                if (!isEditable) {
                    event.preventDefault()
                    void handlePasteClipboard()
                }
            }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [menu, removePrompt, invalidPathPrompt, settingsOpen, aboutOpen, outputDirDraft, isOutputDirInvalid])

    // 点击空白处关闭右键菜单
    useEffect(() => {
        if (!menu) {
            return
        }
        function onPointerDown(event: globalThis.MouseEvent): void {
            const target = event.target as HTMLElement | null
            if (!target?.closest('[data-job-menu="true"]')) {
                setMenu(null)
            }
        }
        window.addEventListener('mousedown', onPointerDown)
        return () => window.removeEventListener('mousedown', onPointerDown)
    }, [menu])

    useEffect(() => {
        return () => {
            if (saveTimerRef.current !== null) {
                window.clearTimeout(saveTimerRef.current)
            }
            clearToastTimers()
        }
    }, [])

    async function validateAndStoreOutputDir(rawDir: string): Promise<OutputDirValidation> {
        const seq = ++validateSeqRef.current
        const [result, updated] = await Promise.all([
            window.videoApi.validateOutputDir(rawDir),
            window.videoApi.updateSettings({ outputDir: rawDir }),
        ])
        if (seq === validateSeqRef.current) {
            setOutputDirValidation(result)
            setSettings(updated)
        }
        return result
    }

    async function flushOutputDirSave(rawDir: string): Promise<OutputDirValidation> {
        if (saveTimerRef.current !== null) {
            window.clearTimeout(saveTimerRef.current)
            saveTimerRef.current = null
        }
        const trimmed = rawDir.trim()
        if (trimmed !== rawDir) {
            setOutputDirDraft(trimmed)
        }
        return validateAndStoreOutputDir(trimmed)
    }

    function handleOutputDirChange(nextValue: string): void {
        setOutputDirDraft(nextValue)
        if (!outputDirInitializedRef.current) {
            return
        }
        if (saveTimerRef.current !== null) {
            window.clearTimeout(saveTimerRef.current)
        }
        saveTimerRef.current = window.setTimeout(() => {
            saveTimerRef.current = null
            void validateAndStoreOutputDir(nextValue)
        }, 200)
    }

    async function handleBrowseOutputDir(): Promise<void> {
        try {
            const picked = await window.videoApi.pickOutputDir(outputDirDraft)
            if (!picked) {
                return
            }
            setOutputDirDraft(picked)
            await flushOutputDirSave(picked)
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        }
    }

    async function handleOpenOutputDir(): Promise<void> {
        try {
            const check = await flushOutputDirSave(outputDirDraft)
            if (!check.valid) {
                setInvalidPathPrompt({
                    path: outputDirDraft,
                    reason: check.reason || '当前保存目录不可用',
                })
                return
            }
            await window.videoApi.openOutputDir(check.normalizedPath)
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        }
    }

    function openSettingsModal(focusPath = false): void {
        setFocusPathOnSettingsOpen(focusPath)
        setSettingsOpen(true)
        void window.videoApi.validateOutputDir(outputDirDraft).then(setOutputDirValidation)
    }

    async function ensureValidOutputDirBeforeDownload(): Promise<boolean> {
        const check = await flushOutputDirSave(outputDirDraft)
        if (!check.valid) {
            setInvalidPathPrompt({
                path: outputDirDraft,
                reason: check.reason || '当前保存目录不合规，请修改后再下载',
            })
            return false
        }
        return true
    }

    async function handlePasteClipboard(): Promise<void> {
        try {
            const text = await window.videoApi.readClipboardText()
            const trimmed = text.trim()
            if (!trimmed) {
                setNotice('剪贴板中没有文本内容')
                return
            }
            setUrl(trimmed)
            urlInputRef.current?.focus()
        } catch {
            setError('读取剪贴板失败')
        }
    }

    async function handleParse(): Promise<void> {
        const trimmed = url.trim()
        if (!trimmed) {
            setError('请先粘贴视频链接')
            urlInputRef.current?.focus()
            return
        }
        const platformNow = await window.videoApi.detectPlatform(trimmed)
        setDetected(platformNow)
        if (platformNow.id === 'unknown') {
            setError(`暂不支持该链接。当前支持：${supportedPlatformsText()}。`)
            return
        }
        setParsing(true)
        setNotice('正在解析列表，剧集较多或网络较慢时请稍候…')
        try {
            const cctvMode = platformNow.id === 'cctv'
            const result = await window.videoApi.listVideos({
                url: trimmed,
                fromMonth: cctvMode ? fromMonth : undefined,
                toMonth: cctvMode ? toMonth : undefined,
                includeHighlights: cctvMode ? includeHighlights : undefined,
            })
            setVideos(result.videos)
            setSelectedGuids(new Set())
            setDetected(getPlatformInfo(result.platform))
            if (result.videos.length === 0) {
                setNotice('未解析到可下载视频，请检查链接或筛选条件')
            } else {
                setNotice(
                    `已识别为 ${getPlatformInfo(result.platform).label}，共解析出 ${result.videos.length} 项`,
                )
            }
        } catch (err) {
            setVideos([])
            const message = err instanceof Error ? err.message : String(err)
            if (message.includes('已取消')) {
                setNotice('已取消列表解析')
            } else {
                setError(message)
            }
        } finally {
            setParsing(false)
        }
    }

    async function handleCancelCurrent(): Promise<void> {
        if (parsing) {
            await window.videoApi.cancelParse()
        }
        if (hasActiveJobs) {
            await window.videoApi.cancelDownload()
        }
        setNotice('已发送取消指令')
    }

    async function enqueueVideoItem(item: VideoItem, quality: QualityValue): Promise<void> {
        if (item.platform === 'cctv' || (!item.url && item.guid)) {
            await window.videoApi.startDownload({
                guid: item.guid,
                title: item.title,
                quality,
                platform: 'cctv',
            })
            return
        }
        await window.videoApi.startDownload({
            url: item.url || url.trim(),
            guid: item.guid,
            title: item.title,
            quality,
            platform: item.platform,
        })
    }

    async function handleDownloadSingleItem(item: VideoItem): Promise<void> {
        if (!settings) {
            return
        }
        if (!(await ensureValidOutputDirBeforeDownload())) {
            return
        }
        setSubmittingDownload(true)
        try {
            await enqueueVideoItem(item, settings.quality)
            setNotice(`已加入下载队列：${item.title}`)
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setSubmittingDownload(false)
        }
    }

    async function handleDownloadSelected(): Promise<void> {
        if (!settings) {
            return
        }
        const targets = videos.filter((item) => selectedGuids.has(item.guid))
        if (targets.length === 0) {
            setError('请先在列表中勾选要下载的视频')
            return
        }
        if (!(await ensureValidOutputDirBeforeDownload())) {
            return
        }
        setSubmittingDownload(true)
        try {
            for (const item of targets) {
                await enqueueVideoItem(item, settings.quality)
            }
            setNotice(`已加入 ${targets.length} 个下载任务`)
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setSubmittingDownload(false)
        }
    }

    async function handleDownloadPageDirect(): Promise<void> {
        const trimmed = url.trim()
        if (!trimmed) {
            setError('请先粘贴视频链接后再下载')
            urlInputRef.current?.focus()
            return
        }
        const platformNow = await window.videoApi.detectPlatform(trimmed)
        setDetected(platformNow)
        if (platformNow.id === 'unknown') {
            setError(`暂不支持该链接。当前支持：${supportedPlatformsText()}。`)
            return
        }
        if (!settings) {
            return
        }
        if (!(await ensureValidOutputDirBeforeDownload())) {
            return
        }
        setSubmittingDownload(true)
        try {
            await window.videoApi.startDownload({
                url: trimmed,
                quality: settings.quality,
                platform: platformNow.id,
            })
            setNotice('已加入下载队列，可继续粘贴新链接')
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setSubmittingDownload(false)
        }
    }

    function removeVideoItem(item: VideoItem): void {
        setVideos((prev) => {
            const next = prev.filter(
                (video) => !(video.guid === item.guid && video.index === item.index),
            )
            if (!next.some((video) => video.guid === item.guid)) {
                setSelectedGuids((selected) => {
                    if (!selected.has(item.guid)) {
                        return selected
                    }
                    const copy = new Set(selected)
                    copy.delete(item.guid)
                    return copy
                })
            }
            return next
        })
    }

    function removeSelectedVideos(): void {
        if (selectedGuids.size === 0) {
            return
        }
        setVideos((prev) => prev.filter((item) => !selectedGuids.has(item.guid)))
        setSelectedGuids(new Set())
    }

    function clearVideoList(): void {
        setVideos([])
        setSelectedGuids(new Set())
    }

    async function updateQuality(quality: QualityValue): Promise<void> {
        const next = await window.videoApi.updateSettings({ quality })
        setSettings(next)
    }

    async function commitThreads(raw: string): Promise<void> {
        const parsed = Number.parseInt(raw, 10)
        const clamped = Number.isFinite(parsed) ? Math.min(32, Math.max(1, parsed)) : 8
        setThreadsDraft(String(clamped))
        const next = await window.videoApi.updateSettings({ threads: clamped })
        setSettings(next)
    }

    async function handleClearFinishedJobs(): Promise<void> {
        const finished = jobs.filter((job) => !isJobActive(job.state) && job.state !== 'paused')
        for (const job of finished) {
            await window.videoApi.removeJob(job.id, false)
        }
    }

    function openJobMenu(event: ReactMouseEvent, job: DownloadJob): void {
        event.preventDefault()
        event.stopPropagation()
        setMenu({ x: event.clientX, y: event.clientY, job })
    }

    function requestRemoveJob(job: DownloadJob, mode: 'remove' | 'deleteFile' = 'remove'): void {
        setMenu(null)
        if (mode === 'deleteFile') {
            setRemovePrompt({ job, deleteLocalFile: true, mode: 'deleteFile' })
            return
        }
        const active = isJobActive(job.state) || job.state === 'paused'
        const hasFile =
            Boolean(job.outputPath) || (job.state === 'completed' && Boolean(job.outputDir))
        if (active || hasFile) {
            setRemovePrompt({
                job,
                deleteLocalFile: false,
                mode: 'remove',
            })
            return
        }
        void confirmRemoveJob(job, false)
    }

    async function confirmRemoveJob(job: DownloadJob, deleteLocalFile: boolean): Promise<void> {
        setRemovePrompt(null)
        try {
            await window.videoApi.removeJob(job.id, deleteLocalFile)
            setNotice(deleteLocalFile ? '已移除任务并将本地文件移入回收站' : '已从列表移除')
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        }
    }

    async function runJobAction(action: JobAction, job: DownloadJob): Promise<void> {
        setMenu(null)
        try {
            if (action === 'remove') {
                requestRemoveJob(job, 'remove')
                return
            }
            if (action === 'delete') {
                requestRemoveJob(job, 'deleteFile')
                return
            }
            if (action === 'pause') {
                await window.videoApi.pauseDownload(job.id)
                setNotice('已暂停下载')
                return
            }
            if (action === 'resume') {
                await window.videoApi.resumeDownload(job.id)
                setNotice('已继续下载')
                return
            }
            if (action === 'retry') {
                if (!(await ensureValidOutputDirBeforeDownload())) {
                    return
                }
                await window.videoApi.retryDownload(job.id)
                setNotice('已重新加入下载队列')
                return
            }
            if (action === 'copyUrl') {
                if (job.url) {
                    await window.videoApi.writeClipboardText(job.url)
                    setNotice('已复制视频链接')
                }
                return
            }
            if (action === 'open') {
                await window.videoApi.openJob(job.id)
                return
            }
            if (action === 'openWith') {
                await window.videoApi.openJobWith(job.id)
                return
            }
            if (action === 'reveal') {
                await window.videoApi.revealJob(job.id)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        }
    }

    if (!settings) {
        return (
            <div className="flex h-full items-center justify-center gap-2 text-[13px] text-[var(--ink-secondary)]">
                <SpinnerIcon className="h-4 w-4 animate-spin text-[var(--accent)]" />
                <span>正在启动…</span>
            </div>
        )
    }

    return (
        <div className="flex h-full w-full flex-col">
            <TitleBar
                appInfo={appInfo}
                activeJobCount={activeJobCount}
                isOutputDirInvalid={isOutputDirInvalid}
                invalidReason={outputDirValidation?.reason}
                onOpenSettings={() => openSettingsModal(isOutputDirInvalid)}
                onOpenAbout={() => setAboutOpen(true)}
            />

            <ToastBanner toast={toast} leaving={toastLeaving} onDismiss={dismissToast} />

            <main className="mx-auto flex min-h-0 w-full max-w-[1320px] flex-1 flex-col gap-3 p-3.5">
                <CommandPanel
                    urlInputRef={urlInputRef}
                    url={url}
                    onUrlChange={setUrl}
                    detected={detected}
                    settings={settings}
                    isOutputDirInvalid={isOutputDirInvalid}
                    fromMonth={fromMonth}
                    toMonth={toMonth}
                    includeHighlights={includeHighlights}
                    onFromMonthChange={setFromMonth}
                    onToMonthChange={setToMonth}
                    onIncludeHighlightsChange={setIncludeHighlights}
                    threadsDraft={threadsDraft}
                    onThreadsDraftChange={setThreadsDraft}
                    onCommitThreads={(val) => void commitThreads(val)}
                    onQualityChange={(q) => void updateQuality(q)}
                    parsing={parsing}
                    submittingDownload={submittingDownload}
                    onPaste={() => void handlePasteClipboard()}
                    onParse={() => void handleParse()}
                    onDownloadDirect={() => void handleDownloadPageDirect()}
                    onOpenOutputDir={() => void handleOpenOutputDir()}
                    onOpenSettings={openSettingsModal}
                />

                <div
                    className={`grid min-h-0 flex-1 grid-cols-1 gap-2.5 ${
                        showVideoList ? 'lg:grid-cols-2' : ''
                    }`}
                >
                    {showVideoList ? (
                        <VideoListPanel
                            videos={videos}
                            selectedGuids={selectedGuids}
                            submittingDownload={submittingDownload}
                            onSelectGuids={setSelectedGuids}
                            onRemoveItem={removeVideoItem}
                            onRemoveSelected={removeSelectedVideos}
                            onClearList={clearVideoList}
                            onDownloadSelected={() => void handleDownloadSelected()}
                            onDownloadSingle={(item) => void handleDownloadSingleItem(item)}
                        />
                    ) : null}

                    <DownloadQueuePanel
                        jobs={jobs}
                        parsing={parsing}
                        hasActiveJobs={hasActiveJobs}
                        hasFinishedJobs={hasFinishedJobs}
                        onClearFinished={() => void handleClearFinishedJobs()}
                        onCancelCurrent={() => void handleCancelCurrent()}
                        onJobAction={(action, job) => void runJobAction(action, job)}
                        onOpenJobMenu={openJobMenu}
                    />
                </div>
            </main>

            <SettingsModal
                open={settingsOpen}
                settings={settings}
                outputDirDraft={outputDirDraft}
                defaultOutputDir={appInfo?.defaultOutputDir || ''}
                validation={outputDirValidation}
                autoFocusPath={focusPathOnSettingsOpen}
                onOutputDirChange={handleOutputDirChange}
                onOutputDirBlur={() => void flushOutputDirSave(outputDirDraft)}
                onBrowseOutputDir={() => void handleBrowseOutputDir()}
                onOpenOutputDir={() => void handleOpenOutputDir()}
                onToggleOrganize={(checked) => {
                    void window.videoApi
                        .updateSettings({ organizeByPlatform: checked })
                        .then(setSettings)
                }}
                onToggleRemuxMp4={(checked) => {
                    void window.videoApi.updateSettings({ remuxMp4: checked }).then(setSettings)
                }}
                onProxyChange={(patch) => {
                    void window.videoApi.updateSettings(patch).then(setSettings)
                }}
                onClose={() => {
                    setSettingsOpen(false)
                    setFocusPathOnSettingsOpen(false)
                }}
            />

            <AboutModal open={aboutOpen} appInfo={appInfo} onClose={() => setAboutOpen(false)} />

            <InvalidPathDialog
                prompt={invalidPathPrompt}
                onCancel={() => setInvalidPathPrompt(null)}
                onConfirmGoSettings={() => {
                    setInvalidPathPrompt(null)
                    openSettingsModal(true)
                }}
            />

            <JobContextMenu
                menu={menu}
                onAction={(action, job) => void runJobAction(action, job)}
                onClose={() => setMenu(null)}
            />

            <RemoveJobDialog
                prompt={removePrompt}
                onToggleDeleteFile={(checked) => {
                    if (removePrompt) {
                        setRemovePrompt({ ...removePrompt, deleteLocalFile: checked })
                    }
                }}
                onCancel={() => setRemovePrompt(null)}
                onConfirm={(job, deleteLocalFile) => void confirmRemoveJob(job, deleteLocalFile)}
            />
        </div>
    )
}
