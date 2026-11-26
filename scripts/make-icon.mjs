/**
 * 将圆角外的黑底抠成透明，生成 Windows 多尺寸 ICO 与轻量 UI 图标
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pngToIco from 'png-to-ico'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcPng = join(root, 'build', 'icon.png')
const outIco = join(root, 'build', 'icon.ico')
const outUiPng = join(root, 'build', 'icon-ui.png')

/** 近黑像素阈值（含抗锯齿软边） */
const BLACK_THRESHOLD = 22

/**
 * 从四角洪水填充，仅清除连通到边角的近黑像素
 */
function clearConnectedBlackCorners(rgba, width, height) {
    const visited = new Uint8Array(width * height)
    const queue = []
    let cleared = 0

    const isNearBlack = (offset) => {
        const r = rgba[offset]
        const g = rgba[offset + 1]
        const b = rgba[offset + 2]
        return r <= BLACK_THRESHOLD && g <= BLACK_THRESHOLD && b <= BLACK_THRESHOLD
    }

    const enqueue = (x, y) => {
        const idx = y * width + x
        if (visited[idx]) {
            return
        }
        visited[idx] = 1
        queue.push(idx)
    }

    const corners = [
        [0, 0],
        [width - 1, 0],
        [0, height - 1],
        [width - 1, height - 1],
    ]
    for (const [x, y] of corners) {
        if (isNearBlack((y * width + x) * 4)) {
            enqueue(x, y)
        }
    }

    while (queue.length > 0) {
        const idx = queue.pop()
        const offset = idx * 4
        if (!isNearBlack(offset)) {
            continue
        }

        // 极暗像素直接全透明；略亮的抗锯齿边保留软透明度
        const luma = Math.max(rgba[offset], rgba[offset + 1], rgba[offset + 2])
        let alpha = 0
        if (luma > 6) {
            alpha = Math.round((255 * (luma - 6)) / Math.max(BLACK_THRESHOLD - 6, 1))
            alpha = Math.min(255, Math.max(0, alpha))
        }
        rgba[offset] = 0
        rgba[offset + 1] = 0
        rgba[offset + 2] = 0
        rgba[offset + 3] = alpha
        cleared += 1

        const x = idx % width
        const y = (idx / width) | 0
        if (x > 0) {
            enqueue(x - 1, y)
        }
        if (x + 1 < width) {
            enqueue(x + 1, y)
        }
        if (y > 0) {
            enqueue(x, y - 1)
        }
        if (y + 1 < height) {
            enqueue(x, y + 1)
        }
    }

    return cleared
}

async function ensureTransparentPng() {
    const image = sharp(srcPng).ensureAlpha()
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true })
    const rgba = new Uint8Array(data)

    // 四角已透明则跳过，避免重复处理破坏抗锯齿软边
    const cornerOffsets = [
        0,
        (info.width - 1) * 4,
        ((info.height - 1) * info.width) * 4,
        ((info.height - 1) * info.width + (info.width - 1)) * 4,
    ]
    const alreadyTransparent = cornerOffsets.every((offset) => rgba[offset + 3] < 16)
    const cleared = alreadyTransparent
        ? 0
        : clearConnectedBlackCorners(rgba, info.width, info.height)

    if (cleared > 0) {
        await sharp(rgba, {
            raw: {
                width: info.width,
                height: info.height,
                channels: 4,
            },
        })
            .png()
            .toFile(srcPng)
    }

    return { width: info.width, height: info.height, cleared, skipped: alreadyTransparent }
}

async function main() {
    const { width, height, cleared, skipped } = await ensureTransparentPng()
    if (skipped) {
        console.log(`透明底已存在，跳过抠图：${width}x${height}`)
    } else {
        console.log(`已处理透明底：${width}x${height}，清除近黑像素 ${cleared} 个`)
    }

    const buf = await pngToIco(srcPng)
    writeFileSync(outIco, buf)

    await sharp(srcPng)
        .resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9 })
        .toFile(outUiPng)

    const head = Buffer.from(buf).subarray(0, 4)
    console.log(`已生成 ${outIco} (${buf.length} bytes) 与 ${outUiPng}`)
    console.log(`文件头：${[...head].map((b) => b.toString(16).padStart(2, '0')).join(' ')}`)
    if (head[0] !== 0 || head[1] !== 0 || head[2] !== 1 || head[3] !== 0) {
        throw new Error('ICO 文件头无效')
    }
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
