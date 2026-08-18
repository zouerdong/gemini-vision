---
name: gemini-vision
description: 轻量 Gemini 多模态桥接，补齐 GLM / DeepSeek 等主模型的多模态能力缺口。分析视频/图片/音频 — 提炼参考风格、核验生成质量、对比版本差异、提取可复用框架。当用户需要"看视频""听音频""分析画面""检查生成质量""提炼参考风格""对比视频版本"时触发。Lightweight Gemini multimodal bridge for Claude Code — analyze video, images, and audio when the underlying model lacks multimodal input. Triggers on "watch/analyze this video", "check generation quality", "compare versions".
---

# Gemini 多模态桥接

为 GLM / DeepSeek 等无原生多模态的主模型补齐视觉/听觉能力。通过 Gemini API 分析视频、图片、音频文件。

## 前置条件

- Node.js ≥ 18（零外部依赖，用原生 fetch）
- skill 根目录的 `.env` 中已配置 `GEMINI_API_KEY`
- 网络可访问 `generativelanguage.googleapis.com`（中国大陆需 TUN 模式代理，详见 README；Node ≥ 24 也可设 `NODE_USE_ENV_PROXY=1` 走系统代理）

## 用法

```bash
# 基础用法
node ~/.claude/skills/gemini-vision/scripts/gemini-vision.mjs --file "path/to/video.mp4" --question "分析这个广告视频的节奏和视觉风格"

# 多文件对比
node ~/.claude/skills/gemini-vision/scripts/gemini-vision.mjs --file "v1.mp4" --file "v2.mp4" --question "对比两个版本的差异，哪个更好？为什么？"

# 生成后质量核验
node ~/.claude/skills/gemini-vision/scripts/gemini-vision.mjs --file "output.mp4" --question "对比以下提示词，逐条检查视频是否满足要求：<原始提示词>"

# 提取可复用框架
node ~/.claude/skills/gemini-vision/scripts/gemini-vision.mjs --file "reference.mp4" --question "提炼这个视频的分镜节奏、运镜手法、色彩方案，输出可复用的制作框架"

# 输出 JSON（给 Agent 消费，responseMimeType 保证干净 JSON，可直接 parse）
node ~/.claude/skills/gemini-vision/scripts/gemini-vision.mjs --file "video.mp4" --question "..." --json

# 同时输出 Markdown 报告文件
node ~/.claude/skills/gemini-vision/scripts/gemini-vision.mjs --file "video.mp4" --question "..." --output "./analysis_report.md"

# 使用 Pro 模型（深度分析）
node ~/.claude/skills/gemini-vision/scripts/gemini-vision.mjs --file "video.mp4" --question "..." --model gemini-3.1-pro-preview
```

## 支持的格式

| 类型 | 格式 |
|------|------|
| 视频 | mp4, mov, avi, webm |
| 图片 | png, jpg, webp, gif, bmp |
| 音频 | mp3, wav, m4a |

## 模型降级链

默认模型 `gemini-3.7-flash`，遇到 503/429 时自动降级：

1. `gemini-3.7-flash`（默认首选）
2. `gemini-3.6-flash`（降级 1）
3. `gemini-3.5-flash`（降级 2）
4. `gemini-3.5-flash-lite`（降级 3）

**注意**：显式指定 `--model` 时**不降级**，直接用指定模型，失败即报错。

## 使用场景

| 工作流阶段 | 典型问题 |
|-----------|---------|
| 🎬 创意前期 | "分析这个参考视频的运镜手法、节奏和视觉风格，提炼可复用的框架" |
| 📝 提示词编写 | "分析这个视频的色彩和光照方案，帮我写出对应的风格描述" |
| ✅ 生成后QC | "对比原始提示词逐条检查：角色外貌、运镜、BGM、台词是否匹配" |
| 🔀 多版本选择 | "比较这3个版本，从画面质量、节奏、卖点传达三个维度排序" |
| 🐛 问题诊断 | "视频中角色有没有变形或伪影？画面是否抖动？" |

## Agent 集成说明

Claude Code 调用时：
1. 执行命令并加 `--json` 参数
2. **只读取 stdout**（`console.log`）：分析结果或 JSON
3. **忽略 stderr**（`console.error`）：上传进度、token 统计、文件清理日志
4. `--json` 模式下，stdout 为 API 强制的合法 JSON，可直接 `JSON.parse()`
5. 若 stderr 出现 `⬆️ gemini-vision 有新版本` 提示，用一句话转告用户"有新版可更新"即可，不影响本次分析结果

## 注意

- 视频上传后需等待云端处理，脚本自动轮询（进度打印到 stderr），通常 5-30 秒
- 分析结束后自动删除云端文件，无需手动清理
- 本 skill 由 git 仓库管理：脚本每天自动检测一次新版本（stderr 提示），用户说「更新 gemini-vision」后执行 `git -C ~/.claude/skills/gemini-vision pull` 即可，本地 `.env` 不受影响
- 遇到模型报错或降级链全部失效时，先拉取更新（通常是模型链过期），再排查其他原因
- Gemini 分析结果供参考，不能替代人工最终判断
