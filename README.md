# ClipFetch

多平台视频下载工具（Windows）。本仓库按分支区分两个产品形态：

| 分支 | 产品 | 说明 |
|------|------|------|
| [`main`](https://github.com/zesheng-x/ClipFetch/tree/main) | **ClipFetch Desktop** | Windows 桌面端（Electron + Fluent UI） |
| [`cli`](https://github.com/zesheng-x/ClipFetch/tree/cli) | **ClipFetch CLI** | 命令行版：粘贴链接回车即可下载 |

当前文档对应 **Desktop（`main`）**。命令行版请切换到 [`cli`](https://github.com/zesheng-x/ClipFetch/tree/cli) 分支查看。

## 简介

ClipFetch Desktop 是面向 Windows 的多平台视频下载器，支持栏目/合集解析、下载队列、清晰度选择与代理。界面遵循 Windows 11 Fluent Design。

## 已支持平台（16 个）

| 平台 | 引擎 | 说明 |
|------|------|------|
| 央视网 | [cctv-dl](https://github.com/letr007/CCTVVideoDownloader) | 栏目 / 专辑 / 单集，支持月份筛选与看点 |
| 哔哩哔哩 | [yt-dlp](https://github.com/yt-dlp/yt-dlp) | 单集、多 P、番剧与常见合集 |
| 抖音 | 自研免登录解析 | **无需登录 / Cookie**，分享短链或整段文案 → 无水印直链 |
| TikTok | 自研免登录解析 | **无需登录 / Cookie**，页面解析 + 无 Cookie 302 直链 |
| 快手 | 自研分享页解析 | 分享短链 / `short-video` 详情页 |
| YouTube / X / Instagram / Facebook / 小红书 / 微博 / 西瓜视频 / Reddit / Vimeo / Twitch / AcFun | [yt-dlp](https://github.com/yt-dlp/yt-dlp) | 自动识别平台并按所选清晰度下载（海外站点建议开启代理） |

## 核心特性

- Windows 11 原生交互：单实例防多开、任务栏下载进度、原生文件夹选择、删除移入回收站
- 快捷键：空白处 `Ctrl + V` 粘贴、`Enter` 下载、`Shift + Enter` 解析列表、`Ctrl + ,` 设置、`F1` 关于
- 批量解析与队列管理：多选、筛选、双击播放、失败重试
- 画质与封装：默认自动最高画质，可选合并封装为 MP4

## 环境要求

- Windows 10 / 11 x64
- [Node.js](https://nodejs.org/) 20+（建议 LTS）
- [pnpm](https://pnpm.io/) 9+

```bash
npm install -g pnpm
```

## 安装与运行（开发）

```bash
git clone https://github.com/zesheng-x/ClipFetch.git
cd ClipFetch
git checkout main

pnpm install
pnpm vendor:fetch
pnpm icon:make
pnpm dev
```

`vendor:fetch` 会拉取 `cctv-dl`、`yt-dlp.exe`、`ffmpeg` / `ffprobe` 到 `resources/vendor/`。  
访问海外资源时，脚本会优先使用环境变量代理，或本机 `http://127.0.0.1:7897`。

## 生产打包

```bash
pnpm typecheck
pnpm dist
```

安装包输出至 `release/`（如 `ZeshengDownloader-Setup-1.2.0.exe`）。

## 代理说明

下载 YouTube、TikTok、X 等海外站点时，请在应用 **设置** 中开启代理，并填写地址（默认 `http://127.0.0.1:7897`）。

## 目录结构

```text
ClipFetch/
├── build/                  # 图标与 NSIS 安装脚本
├── resources/vendor/       # 外部引擎（Git 忽略，需 vendor:fetch）
├── scripts/                # 图标、依赖拉取、打包脚本
└── src/
    ├── main/               # Electron 主进程与下载引擎
    ├── preload/            # IPC 桥接
    ├── renderer/           # React + Tailwind 界面
    └── shared/             # 共享类型与平台规则
```

## 分支说明

- `main`：桌面端（本文档）
- `cli`：命令行版（一次一条，默认保存到系统「下载」文件夹）

## 许可与声明

- 以 GPL-3.0 协议发布（因随包分发 GPL 许可的 `cctv-dl` 与 FFmpeg）
- 第三方说明见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)
- 仅供个人学习与技术交流；请仅下载拥有合法访问权限的内容，并遵守各平台条款与版权法规
