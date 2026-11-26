# ClipFetch CLI

多平台视频**命令行**下载器。粘贴分享链接，回车即下载；一次只处理一条，默认保存到系统「下载」文件夹。

桌面端请查看 [`main`](https://github.com/zesheng-x/ClipFetch/tree/main) 分支。

## 简介

ClipFetch CLI 复用与桌面端相同的解析 / 下载引擎，去掉图形界面，适合：

- 快速下一条分享视频
- 脚本或终端工作流
- 不想打开桌面应用时的轻量使用

## 已支持平台（16 个）

央视网、哔哩哔哩、抖音、TikTok、快手、YouTube、X、Instagram、Facebook、小红书、微博、西瓜视频、Reddit、Vimeo、Twitch、AcFun。

| 类型 | 平台 | 说明 |
|------|------|------|
| 免登录短链 | 抖音 / TikTok / 快手 | 可直接粘贴分享口令或短链 |
| 列表站 | 央视网 / B 站 等 | CLI 按单条链接下载（一次一条） |
| 海外站 | YouTube / X / Instagram 等 | 建议开启代理 |

## 环境要求

- Windows 10 / 11 x64（当前主要支持）
- [Node.js](https://nodejs.org/) 20+（建议 LTS）
- [pnpm](https://pnpm.io/) 9+

```bash
npm install -g pnpm
```

## 安装

```bash
git clone https://github.com/zesheng-x/ClipFetch.git
cd ClipFetch
git checkout cli

pnpm install
pnpm vendor:fetch
```

`vendor:fetch` 会下载 `yt-dlp`、`ffmpeg`、`cctv-dl` 到 `resources/vendor/`。  
拉取海外资源时，可先设置代理环境变量，或确保本机 `http://127.0.0.1:7897` 可用。

## 使用

### 启动

```bash
pnpm cli
# 或
pnpm start
```

### 交互流程

1. 启动后出现 `>` 提示符  
2. 粘贴视频分享链接或整段分享文案  
3. 回车开始下载（显示进度）  
4. 完成后文件落在「下载」文件夹，可继续粘贴下一条  
5. 输入 `q` / `quit` / `exit` 退出  

下载进行中按 `Ctrl+C` 可取消当前任务；空闲时再按一次退出。

### 代理（海外站点）

```bash
# 使用默认代理 http://127.0.0.1:7897
pnpm cli --proxy

# 指定代理地址
pnpm cli --proxy http://127.0.0.1:7897

# 或先设置环境变量再启动
set HTTPS_PROXY=http://127.0.0.1:7897
pnpm cli
```

### 保存位置

默认目录为系统用户「下载」文件夹，例如：

```text
C:\Users\<你的用户名>\Downloads
```

（资源管理器中显示为「下载」，路径一般为 `Downloads`。）

### 帮助

```bash
pnpm cli --help
```

## 与桌面端的区别

| | Desktop (`main`) | CLI (`cli`) |
|--|------------------|-------------|
| 界面 | Windows 图形界面 | 终端交互 |
| 下载方式 | 支持队列 / 批量 | **一次一条** |
| 默认目录 | 视频\泽晟视频下载器 | 系统「下载」 |
| 设置 | 应用内设置页 | 命令行参数 / 环境变量 |

## 常见问题

**提示缺少运行时引擎**  
先执行 `pnpm install` 与 `pnpm vendor:fetch`。

**抖音 / 快手解析失败**  
确认链接完整；可直接粘贴 App 分享出来的整段文字。

**YouTube 等卡住或失败**  
国内网络请加 `--proxy`，并确保本地代理软件已开启。

## 许可与声明

- 以 GPL-3.0 协议发布
- 第三方说明见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)
- 仅供个人学习与技术交流；请仅下载拥有合法访问权限的内容，并遵守各平台条款与版权法规
