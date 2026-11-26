import { useState } from 'react'
import { PLATFORM_CATALOG } from '../../../shared/platform'
import type { AppInfo } from '../../../shared/types'
import {
    CheckIcon,
    CloseIcon,
    CodeIcon,
    CopyIcon,
    DownloadIcon,
    FileTextIcon,
    FilmIcon,
    MailIcon,
    PhoneIcon,
    ShieldIcon,
} from './Icons'

interface AboutModalProps {
    open: boolean
    appInfo: AppInfo | null
    onClose: () => void
}

const CONTACT_PHONE = '19204944006'
const CONTACT_EMAIL = '551125020@qq.com'

export function AboutModal({ open, appInfo, onClose }: AboutModalProps) {
    const [copiedKey, setCopiedKey] = useState<'phone' | 'email' | null>(null)

    if (!open) {
        return null
    }

    async function handleCopy(key: 'phone' | 'email', text: string): Promise<void> {
        try {
            await window.videoApi.writeClipboardText(text)
            setCopiedKey(key)
            window.setTimeout(() => {
                setCopiedKey((current) => (current === key ? null : current))
            }, 1800)
        } catch {
            // ignore
        }
    }

    return (
        <div
            className="win-backdrop fixed inset-0 z-40 flex items-center justify-center p-4"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    onClose()
                }
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                className="win-dialog flex max-h-[86vh] w-full max-w-[576px] flex-col overflow-hidden"
            >
                <div className="flex shrink-0 items-center justify-between border-b border-[var(--line)] px-5 py-3.5">
                    <h3 className="text-[16px] font-semibold leading-none text-[var(--ink)]">
                        关于软件
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="关闭关于窗口"
                        className="win-btn-subtle flex h-7.5 w-7.5 items-center justify-center"
                    >
                        <CloseIcon className="h-4 w-4" />
                    </button>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
                    {/* 顶部品牌与开发者名片 */}
                    <div className="flex items-center gap-4 rounded-[10px] border border-[var(--line)] bg-gradient-to-br from-slate-50 via-white to-[#eef6ff] p-4">
                        {appInfo?.iconDataUrl ? (
                            <img
                                src={appInfo.iconDataUrl}
                                alt="泽晟视频下载器"
                                className="h-14 w-14 shrink-0 rounded-[12px] shadow-xs"
                            />
                        ) : (
                            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[12px] bg-[var(--accent)] text-white shadow-xs">
                                <DownloadIcon className="h-7 w-7" />
                            </div>
                        )}
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <h4 className="text-[16.5px] font-semibold leading-none text-[var(--ink)]">
                                    {appInfo?.name || '泽晟视频下载器'}
                                </h4>
                                <span className="inline-flex h-5 items-center rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2.5 text-xs font-medium leading-none tabular-nums text-[var(--accent-text)]">
                                    v{appInfo?.version || '1.2.0'}
                                </span>
                            </div>
                            <p className="mt-1.5 text-[13px] text-[var(--ink-secondary)]">
                                Windows 桌面端多平台视频下载工具 · 由{' '}
                                <span className="font-semibold text-[var(--ink)]">陈泽晟</span>{' '}
                                独立开发与维护
                            </p>
                        </div>
                    </div>

                    {/* 业务承接与联系方式 */}
                    <div className="rounded-[10px] border border-[var(--accent-border)] bg-gradient-to-br from-[#f5faff] to-white p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold leading-none text-[var(--ink)]">
                                <CodeIcon className="h-4 w-4 text-[var(--accent)]" />
                                <span>定制开发与联系合作</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {['软件开发', '网站开发', '小程序开发'].map((tag) => (
                                    <span
                                        key={tag}
                                        className="inline-flex h-5 items-center rounded-[5px] border border-[var(--accent-border)] bg-white px-2 text-xs font-medium leading-none text-[var(--accent-text)]"
                                    >
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <p className="mt-2.5 text-xs leading-relaxed text-[var(--ink-secondary)]">
                            承接各类桌面软件开发、企业网站与管理系统开发、微信小程序开发及工具定制，如有项目合作或定制需求，欢迎随时联系：
                        </p>

                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <div className="flex items-center justify-between gap-2 rounded-[8px] border border-[var(--line)] bg-white px-3 py-2.5">
                                <div className="flex min-w-0 items-center gap-2.5">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-[var(--accent-soft)] text-[var(--accent)]">
                                        <PhoneIcon className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-[11px] text-[var(--muted)]">
                                            电话 / 微信
                                        </div>
                                        <div className="selectable truncate text-[13.5px] font-semibold tabular-nums text-[var(--ink)]">
                                            {CONTACT_PHONE}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void handleCopy('phone', CONTACT_PHONE)}
                                    className={`win-btn h-7 px-2.5 text-xs ${
                                        copiedKey === 'phone'
                                            ? '!border-[var(--success-border)] !bg-[var(--success-bg)] !text-[var(--success)]'
                                            : ''
                                    }`}
                                >
                                    {copiedKey === 'phone' ? (
                                        <>
                                            <CheckIcon className="h-3 w-3" />
                                            <span>已复制</span>
                                        </>
                                    ) : (
                                        <>
                                            <CopyIcon className="h-3 w-3" />
                                            <span>复制</span>
                                        </>
                                    )}
                                </button>
                            </div>

                            <div className="flex items-center justify-between gap-2 rounded-[8px] border border-[var(--line)] bg-white px-3 py-2.5">
                                <div className="flex min-w-0 items-center gap-2.5">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-[var(--accent-soft)] text-[var(--accent)]">
                                        <MailIcon className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-[11px] text-[var(--muted)]">
                                            联系邮箱
                                        </div>
                                        <div className="selectable truncate text-[13.5px] font-semibold text-[var(--ink)]">
                                            {CONTACT_EMAIL}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void handleCopy('email', CONTACT_EMAIL)}
                                    className={`win-btn h-7 px-2.5 text-xs ${
                                        copiedKey === 'email'
                                            ? '!border-[var(--success-border)] !bg-[var(--success-bg)] !text-[var(--success)]'
                                            : ''
                                    }`}
                                >
                                    {copiedKey === 'email' ? (
                                        <>
                                            <CheckIcon className="h-3 w-3" />
                                            <span>已复制</span>
                                        </>
                                    ) : (
                                        <>
                                            <CopyIcon className="h-3 w-3" />
                                            <span>复制</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* 支持的平台 */}
                    <div className="win-subcard p-4">
                        <div className="mb-2 inline-flex items-center gap-1.5 text-[13.5px] font-semibold leading-none text-[var(--ink)]">
                            <FilmIcon className="h-4 w-4 text-[var(--accent)]" />
                            <span>已支持平台</span>
                        </div>
                        <p className="mb-2.5 text-xs leading-relaxed text-[var(--ink-secondary)]">
                            粘贴链接或分享文案即可自动识别（海外站点请在设置中开启网络代理）：
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {PLATFORM_CATALOG.map((item) => (
                                <span
                                    key={item.id}
                                    title={item.hint}
                                    className="inline-flex h-5.5 items-center rounded-[5px] border border-[var(--line)] bg-white px-2 text-xs leading-none text-[var(--ink-secondary)]"
                                >
                                    {item.label}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* 隐私说明 */}
                    <div className="win-subcard p-4">
                        <div className="mb-2 inline-flex items-center gap-1.5 text-[13.5px] font-semibold leading-none text-[var(--ink)]">
                            <ShieldIcon className="h-4 w-4 text-[var(--accent)]" />
                            <span>本地隐私承诺</span>
                        </div>
                        <ul className="space-y-1.5 text-xs leading-relaxed text-[var(--ink-secondary)]">
                            <li>
                                1. 本软件为纯本地桌面客户端，视频解析、下载与合并均在本机直接完成，不经过任何第三方中转服务器。
                            </li>
                            <li>
                                2. 不收集、不上传您的个人信息、剪贴板内容、下载记录或本地磁盘文件。
                            </li>
                            <li>
                                3. 保存目录、画质与代理配置仅保存在本机用户目录下，卸载时可选择一并清理。
                            </li>
                        </ul>
                    </div>

                    {/* 使用须知与免责声明 */}
                    <div className="win-subcard p-4">
                        <div className="mb-2 inline-flex items-center gap-1.5 text-[13.5px] font-semibold leading-none text-[var(--ink)]">
                            <FileTextIcon className="h-4 w-4 text-[var(--accent)]" />
                            <span>使用须知与免责声明</span>
                        </div>
                        <ul className="space-y-1.5 text-xs leading-relaxed text-[var(--ink-secondary)]">
                            <li>
                                1. 本软件仅供个人学习、技术研究及合法资料留存使用，严禁用于商业盈利或违法违规用途。
                            </li>
                            <li>
                                2. 各平台音视频内容著作权归原作者及对应平台所有，请仅下载您拥有合法授权的内容，并遵守平台服务条款与版权法规。
                            </li>
                            <li>
                                3. 因违规使用或未经授权传播下载内容产生的一切版权纠纷及法律责任由使用者自行承担。
                            </li>
                            <li>
                                4. 本软件基于 GPL-3.0 协议发布，集成开源组件 cctv-dl、yt-dlp 与 FFmpeg；解析能力受各平台接口变化影响，不作永久可用保证。
                            </li>
                        </ul>
                    </div>
                </div>

                <div className="win-dialog-footer flex shrink-0 items-center justify-between px-5 py-3.5">
                    <span className="text-xs text-[var(--muted)]">
                        © 陈泽晟 · 泽晟视频下载器 (GPL-3.0)
                    </span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="win-btn-primary h-8.5 min-w-[96px] px-5"
                    >
                        确定
                    </button>
                </div>
            </div>
        </div>
    )
}
