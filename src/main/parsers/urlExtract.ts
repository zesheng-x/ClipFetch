/** 从分享文案或纯链接中提取第一个 http(s) URL */
export function extractFirstUrl(input: string): string | null {
    const text = String(input ?? '').trim()
    if (!text) {
        return null
    }

    const withProto = text.match(/https?:\/\/[^\s，。、）)】\]"'<>]+/i)
    if (withProto) {
        return withProto[0].replace(/[.,;:!?]+$/g, '')
    }

    const bare = text.match(
        /(?:v|www|m|iesdouyin)\.douyin\.com\/[^\s，。、）)】\]"'<>]+|(?:www\.)?tiktok\.com\/[^\s，。、）)】\]"'<>]+|v\.kuaishou\.com\/[^\s，。、）)】\]"'<>]+|(?:www\.)?bilibili\.com\/[^\s，。、）)】\]"'<>]+|b23\.tv\/[^\s，。、）)】\]"'<>]+/i,
    )
    if (bare) {
        return `https://${bare[0].replace(/[.,;:!?]+$/g, '')}`
    }

    return null
}

export function sanitizeFileName(name: string): string {
    return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 120).trim() || 'video'
}
