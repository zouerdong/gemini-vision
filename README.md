# gemini-vision — 给 Claude Code 补上眼睛和耳朵

[English](./README.en-US.md) | 中文

让你的 Claude Code 直接分析**视频、图片、音频** — 无论底层跑的是什么模型。

如果你在 Claude Code 里接的是 GLM、DeepSeek 等没有原生多模态输入的主模型，这个 skill 让你调用 Gemini 的多模态能力：提炼参考视频的运镜与风格、核验 AI 生成内容的质量、对比多个版本的差异、提取可复用的制作框架。你自己两台电脑（Win + Mac）能用的，别人装完提供自己的 Key 一样能用。

## 特性

- **零依赖** — 纯 Node.js（≥ 18）原生 fetch，无需 `npm install`
- **跨平台** — Windows / macOS / Linux 同一套命令
- **自带 Key** — 用你自己的 Gemini API Key，数据不经过任何第三方
- **自动清理** — 上传到 Gemini 云端的文件分析完即删，不占 20GB 存储配额
- **Agent 友好** — stdout（结果）/ stderr（日志）严格分离，`--json` 由 API 层强制合法 JSON，可直接 `JSON.parse()`
- **模型降级链** — 遇 503/429 自动降级到备用模型，免费额度的限流也能扛

## 前置要求

1. **Node.js ≥ 18**（`node -v` 检查）
2. **Gemini API Key** — 在 [Google AI Studio](https://aistudio.google.com/apikey) 免费获取（免费档有每分钟限流，付费档无感）
3. 网络能访问 `generativelanguage.googleapis.com`（中国大陆用户见下方[代理说明](#中国大陆用户代理说明)）

## 安装

**第 1 步 — 克隆**（macOS / Linux / Windows 通用，任何终端都能跑）：

```bash
git clone https://github.com/zouerdong/gemini-vision ~/.claude/skills/gemini-vision
```

**第 2 步 — 配置你自己的 API Key**（全平台统一做法）：

打开任意 Claude Code 会话，直接说：

> 帮我配置 gemini-vision 的 GEMINI_API_KEY，我的 Key 是 \<你的Key\>

Claude 会写好 `.env` 并验证连通。Key 在 [Google AI Studio](https://aistudio.google.com/apikey) 免费获取。

喜欢手动配置的话，等价命令：

```bash
# macOS / Linux / Git Bash
echo "GEMINI_API_KEY=<你的Key>" > ~/.claude/skills/gemini-vision/.env

# Windows PowerShell
notepad $env:USERPROFILE\.claude\skills\gemini-vision\.env   # 写入 GEMINI_API_KEY=<你的Key> 后保存
```

**第 3 步 — 验证**：在任意 Claude Code 会话里说"用 gemini-vision 分析这张图"，返回分析结果即安装成功。之后说"帮我看看这个视频"之类的话，skill 会自动触发。

**Windows 用户注意**：Claude Code 执行命令走 Git Bash（`~` 即 `C:\Users\<你>`），本页所有 bash 命令在 Git Bash 里原样可用；PowerShell 里只建议跑第 1 步的 git clone（git 自己会展开 `~`）。

## 使用

```bash
# 基础分析
node ~/.claude/skills/gemini-vision/scripts/gemini-vision.mjs --file video.mp4 --question "分析这个视频的节奏和视觉风格"

# 多文件对比
node ~/.claude/skills/gemini-vision/scripts/gemini-vision.mjs --file v1.mp4 --file v2.mp4 --question "对比两个版本，哪个更好？"

# JSON 输出（Agent 消费）
node ~/.claude/skills/gemini-vision/scripts/gemini-vision.mjs --file video.mp4 --question "..." --json

# 深度分析（Pro 模型）
node ~/.claude/skills/gemini-vision/scripts/gemini-vision.mjs --file video.mp4 --question "..." --model gemini-3.1-pro-preview
```

完整参数（`--output` 报告文件、`--system` 自定义系统提示词）见 [SKILL.md](./SKILL.md)。

### Agent 集成契约

其他 skill / 工作流调用时遵守两条约定：

1. **只读 stdout** — 分析结果（或合法 JSON）；stderr 是进度日志，忽略
2. **`--json` 模式** — 通过 Gemini API 的 `responseMimeType: application/json` 强制合法 JSON，不依赖提示词措辞

## 模型降级链

默认 `gemini-3.7-flash`，遇 503/429 自动降级：`3.7-flash → 3.6-flash → 3.5-flash → 3.5-flash-lite`。显式指定 `--model` 时不降级，失败即报错。

## 中国大陆用户：代理说明

Node.js 原生 `fetch` **不读取**系统代理环境变量（`HTTP_PROXY` / `HTTPS_PROXY`），所以普通代理模式下会连接超时。两个解决办法：

| 方案 | 说明 |
|------|------|
| **TUN 模式**（推荐） | Surge / Clash 等开增强模式或 TUN，全局接管网卡流量，对 Node 透明 |
| `NODE_USE_ENV_PROXY=1` | Node ≥ 24 支持，让 fetch 读取系统代理变量后普通代理模式即可 |

症状对照：报错含 `Gemini API` 字样 = 服务端问题（等恢复 / 换模型）；纯超时无响应 = 代理模式问题，先按上表排查。

## 云端文件与隐私

- 上传的媒体文件在分析结束后立即自动删除（`finally` 块保证，失败也删）
- 若脚本中途被强杀，云端残留文件 48 小时后自动过期
- 你的 Key 只存在本地 `.env`，不进 git、不进任何日志

## 卸载

```bash
rm -rf ~/.claude/skills/gemini-vision
```

不留任何痕迹。

## License

[MIT](./LICENSE)
