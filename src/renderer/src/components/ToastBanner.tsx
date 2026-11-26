import { AlertTriangleIcon, CheckCircleIcon, CloseIcon } from './Icons'

export interface ToastState {
    key: number
    text: string
    kind: 'ok' | 'err'
    actionLabel?: string
    onAction?: () => void
}

interface ToastBannerProps {
    toast: ToastState | null
    leaving: boolean
    onDismiss: () => void
}

export function ToastBanner({ toast, leaving, onDismiss }: ToastBannerProps) {
    if (!toast) {
        return null
    }

    const isError = toast.kind === 'err'

    return (
        <div
            key={toast.key}
            role="status"
            className={`pointer-events-auto fixed top-[calc(env(titlebar-area-height,38px)+10px)] left-1/2 z-[60] flex max-w-[min(92vw,580px)] items-center gap-2.5 rounded-[10px] border px-3.5 py-2.5 text-[13px] shadow-[0_10px_28px_rgba(15,23,42,0.12)] backdrop-blur-md ${
                leaving ? 'toast-leave' : 'toast-enter'
            } ${
                isError
                    ? 'border-[var(--danger-border)] bg-[#fff5f5]/95 text-[var(--danger)]'
                    : 'border-[#dbe4ee] bg-white/95 text-[var(--ink)]'
            }`}
        >
            <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                    isError ? 'bg-[var(--danger)] text-white' : 'bg-[var(--success)] text-white'
                }`}
            >
                {isError ? (
                    <AlertTriangleIcon className="h-3 w-3" />
                ) : (
                    <CheckCircleIcon className="h-3.5 w-3.5" />
                )}
            </span>

            <span className="min-w-0 flex-1 whitespace-pre-wrap break-all leading-snug">
                {toast.text}
            </span>

            {toast.actionLabel && toast.onAction ? (
                <button
                    type="button"
                    onClick={() => {
                        toast.onAction?.()
                        onDismiss()
                    }}
                    className="win-btn-soft h-7 px-2.5 text-xs"
                >
                    {toast.actionLabel}
                </button>
            ) : null}

            <button
                type="button"
                onClick={onDismiss}
                aria-label="关闭通知"
                className="win-btn-subtle flex h-6.5 w-6.5 shrink-0 items-center justify-center"
            >
                <CloseIcon className="h-3.5 w-3.5" />
            </button>
        </div>
    )
}
