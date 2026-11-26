/**
 * 统一清晰度档位：
 * - 0：始终选可用最高
 * - 1～6：优先目标档；没有则回落到不超过该档的最高可用，再不行取全站最高
 * 央视网 cctv-dl 仅支持 0～4，映射见 toCctvQuality
 */
export type QualityValue = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface QualityOption {
    value: QualityValue
    label: string
    hint: string
    /** 目标短边像素上限；0 表示不限制 */
    maxHeight: number
}

export const QUALITY_OPTIONS: QualityOption[] = [
    {
        value: 0,
        label: 'MAX',
        hint: '始终下载原视频可用的最高清晰度',
        maxHeight: 0,
    },
    {
        value: 1,
        label: '4K',
        hint: '优先 4K（2160P）；没有则自动回落',
        maxHeight: 2160,
    },
    {
        value: 2,
        label: '2K',
        hint: '优先 2K（1440P）；没有则自动回落',
        maxHeight: 1440,
    },
    {
        value: 3,
        label: '1080P',
        hint: '优先 1080P；没有则自动回落',
        maxHeight: 1080,
    },
    {
        value: 4,
        label: '720P',
        hint: '优先 720P；没有则自动回落',
        maxHeight: 720,
    },
    {
        value: 5,
        label: '480P',
        hint: '优先 480P；没有则自动回落',
        maxHeight: 480,
    },
    {
        value: 6,
        label: '360P',
        hint: '优先 360P；适合节省流量或网络较差时',
        maxHeight: 360,
    },
]

export const DEFAULT_QUALITY: QualityValue = 0

export function getQualityOption(value: QualityValue): QualityOption {
    return QUALITY_OPTIONS.find((item) => item.value === value) ?? QUALITY_OPTIONS[0]
}

export function isQualityValue(value: unknown): value is QualityValue {
    return (
        value === 0 ||
        value === 1 ||
        value === 2 ||
        value === 3 ||
        value === 4 ||
        value === 5 ||
        value === 6
    )
}

/** 央视网 cctv-dl --quality（0～4） */
export function toCctvQuality(quality: QualityValue): number {
    switch (quality) {
        case 0:
        case 1:
        case 2:
            // MAX / 4K / 2K：按最高可用
            return 0
        case 3:
            return 1
        case 4:
            return 2
        case 5:
            return 3
        case 6:
            return 4
        default:
            return 0
    }
}

/**
 * yt-dlp 格式串：先卡高度上限，再回落到整体最优
 * 例：选 1080P 但片源只有 720P → 会落到 720P
 */
export function qualityToYtDlpFormat(quality: QualityValue): string {
    const option = getQualityOption(quality)
    if (!option.maxHeight) {
        return 'bv*+ba/b'
    }
    const h = option.maxHeight
    return `bv*[height<=${h}]+ba/b[height<=${h}]/bv*+ba/b`
}

/** 根据实际高度生成展示文案（带单位） */
export function formatHeightLabel(height?: number): string | undefined {
    if (!height || height <= 0) {
        return undefined
    }
    if (height >= 2160) {
        return '4K'
    }
    if (height >= 1440) {
        return '2K'
    }
    if (height >= 1080) {
        return '1080P'
    }
    if (height >= 720) {
        return '720P'
    }
    if (height >= 480) {
        return '480P'
    }
    if (height >= 360) {
        return '360P'
    }
    return `${height}P`
}

/** 任务列表展示用：优先实际清晰度 */
export function displayQualityLabel(quality: QualityValue, resolvedLabel?: string): string {
    if (resolvedLabel && resolvedLabel.trim()) {
        return resolvedLabel
    }
    return getQualityOption(quality).label
}
