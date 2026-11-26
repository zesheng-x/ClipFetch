/**
 * Windows NSIS 打包入口。
 *
 * electron-builder 生成卸载器时会临时 spawn 未签名安装包。
 * WineVm 在 win32 上只传入 { __COMPAT_LAYER }，丢掉 PATH/SYSTEMROOT，
 * 导致间歇性 spawn UNKNOWN。打包前先打补丁。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, unlinkSync, statSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const releaseDir = join(root, 'release')

function cleanStaleArtifacts() {
    if (!existsSync(releaseDir)) {
        return
    }
    for (const name of readdirSync(releaseDir)) {
        const full = join(releaseDir, name)
        if (
            name.endsWith('.__uninstaller.exe') ||
            name.endsWith('.nsis.7z') ||
            name === 'builder-debug.yml' ||
            name === 'dist-debug.log'
        ) {
            try {
                unlinkSync(full)
            } catch {
                // ignore
            }
            continue
        }
        if (/Setup-.*\.exe$/i.test(name)) {
            try {
                if (statSync(full).size < 2 * 1024 * 1024) {
                    unlinkSync(full)
                }
            } catch {
                // ignore
            }
        }
    }
}

function findWineVmFiles(dir, depth = 0, out = []) {
    if (depth > 8 || !existsSync(dir)) {
        return out
    }
    let entries
    try {
        entries = readdirSync(dir, { withFileTypes: true })
    } catch {
        return out
    }
    for (const entry of entries) {
        const full = join(dir, entry.name)
        if (entry.isFile() && entry.name === 'WineVm.js' && full.includes('app-builder-lib') && full.includes(`${join('out', 'vm')}`)) {
            out.push(full)
            continue
        }
        if (entry.isDirectory() && entry.name !== '.git' && entry.name !== 'release') {
            const underBuilder = full.includes('app-builder-lib')
            if (
                entry.name === 'node_modules' ||
                entry.name === '.pnpm' ||
                entry.name.startsWith('app-builder-lib') ||
                (underBuilder && (entry.name === 'out' || entry.name === 'vm' || entry.name === 'node_modules'))
            ) {
                findWineVmFiles(full, depth + 1, out)
            }
        }
    }
    return out
}

/** 修复 WineVm：win32 子进程必须继承完整 process.env */
function patchWineVmEnv() {
    const files = findWineVmFiles(join(root, 'node_modules'))
    if (files.length === 0) {
        console.warn('[dist-win] 未找到 WineVm.js，跳过补丁')
        return
    }

    const marker = '/* zesheng-win-env-fix */'
    const bad = `if (process.platform === "win32") {
            return (0, builder_util_1.exec)(target, appArgs, options);
        }`
    const good = `if (process.platform === "win32") {
            ${marker}
            // 必须合并 process.env：builder-util 在 win32 上不会自动继承，只传 __COMPAT_LAYER 会 spawn UNKNOWN
            return (0, builder_util_1.exec)(target, appArgs, {
                ...options,
                env: { ...process.env, ...(options.env || {}) },
            });
        }`

    for (const wineVmPath of files) {
        let source = readFileSync(wineVmPath, 'utf8')
        if (source.includes(marker)) {
            console.log('[dist-win] WineVm 环境补丁已存在')
            continue
        }
        if (!source.includes(bad)) {
            console.warn('[dist-win] WineVm.js 内容已变化，无法自动打补丁：', wineVmPath)
            continue
        }
        writeFileSync(wineVmPath, source.replace(bad, good), 'utf8')
        console.log('[dist-win] 已修复 WineVm win32 环境继承：', wineVmPath)
    }
}

cleanStaleArtifacts()
patchWineVmEnv()

const env = {
    ...process.env,
    __COMPAT_LAYER: 'RunAsInvoker',
    CSC_IDENTITY_AUTO_DISCOVERY: 'false',
}

const result = spawnSync('pnpm', ['exec', 'electron-builder', '--win', 'nsis'], {
    stdio: 'inherit',
    env,
    shell: true,
    cwd: root,
})

process.exit(result.status ?? 1)
