# 第三方组件说明

## cctv-dl / CCTVVideoDownloader

- 项目：https://github.com/letr007/CCTVVideoDownloader
- 许可：GPL-3.0
- 用途：央视网节目解析、H5E 解密、分片下载与 MP4 封装

本应用在发布包中附带上游官方 Windows 发行版中的 `cctv-dl` 可执行文件及其依赖库，未修改其二进制内容。
按 GPL-3.0 要求，完整对应源码可从上述仓库获取。

## yt-dlp

- 项目：https://github.com/yt-dlp/yt-dlp
- 许可：Unlicense
- 用途：哔哩哔哩、抖音、TikTok 等站点的视频解析与下载

本应用分发官方 Windows 独立可执行文件 `yt-dlp.exe`，未修改其二进制内容。

## FFmpeg（Gyan essentials build）

- 构建：https://www.gyan.dev/ffmpeg/builds/
- 源码：https://ffmpeg.org/
- 许可：GPL（essentials 构建）
- 用途：配合 yt-dlp 进行音视频合流与封装

本应用仅分发 `ffmpeg.exe` / `ffprobe.exe`，未修改其二进制内容。

## Electron / Chromium / Node.js

- 许可：分别遵循 Electron、Chromium、Node.js 及其依赖的开源许可
- 用途：桌面应用运行时

## 抖音 / TikTok / 快手免登录解析说明

短视频平台采用自研解析，**不依赖登录 Cookie**：

- 抖音：嵌入播放器 Origin 调用公开 web detail，并在失败时回退到客户端 Feed / `watermark=0` play 直链
- TikTok：页面内嵌数据提取后，无 Cookie 跟随 `aweme/v1/play` 302 获取 CDN
- 快手：分享页 SSR / GraphQL 直链提取（yt-dlp 暂无官方提取器）

实现参考了公开技术讨论与开源社区实践（如 shineyear/douyin-tiktok-downloader、ga-ven/douyin-wx-video-download 等免登录思路），不捆绑第三方闭源程序，也不转发第三方在线解析站流量。
