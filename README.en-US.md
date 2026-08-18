# gemini-vision — Give Claude Code eyes and ears

English | [中文](./README.md)

Lets Claude Code analyze **video, images, and audio** directly — regardless of which model powers it under the hood.

If you run Claude Code on GLM, DeepSeek, or any other model without native multimodal input, this skill gives you Gemini's multimodal capabilities: extract camera work and style from reference videos, QC AI-generated content, compare output versions, and distill reusable production frameworks.

## Features

- **Zero dependencies** — plain Node.js (≥ 18) with native fetch; no `npm install`
- **Cross-platform** — identical commands on Windows / macOS / Linux
- **Bring your own key** — your own Gemini API key; data never touches a third party
- **Self-cleaning** — files uploaded to Gemini are deleted right after analysis; the 20GB storage quota stays free
- **Agent-friendly** — strict stdout (result) / stderr (log) separation; `--json` enforces valid JSON at the API layer, safe to `JSON.parse()`
- **Model fallback chain** — auto-degrades on 503/429, which also absorbs free-tier rate limits

## Requirements

1. **Node.js ≥ 18** (check with `node -v`)
2. **A Gemini API key** — get one free at [Google AI Studio](https://aistudio.google.com/apikey) (the free tier is rate-limited per minute; paid tier is seamless)
3. Network access to `generativelanguage.googleapis.com`

## Install

**Step 1 — Clone** (works on macOS / Linux / Windows, in any terminal):

```bash
git clone https://github.com/zouerdong/gemini-vision ~/.claude/skills/gemini-vision
```

**Step 2 — Configure your API key** (same on every platform):

Open any Claude Code session and say:

> Set up gemini-vision's GEMINI_API_KEY for me — my key is \<your key\>

Claude writes the `.env` and verifies connectivity. Get a free key at [Google AI Studio](https://aistudio.google.com/apikey).

Prefer doing it manually? Equivalent commands:

```bash
# macOS / Linux / Git Bash
echo "GEMINI_API_KEY=<your key>" > ~/.claude/skills/gemini-vision/.env

# Windows PowerShell
notepad $env:USERPROFILE\.claude\skills\gemini-vision\.env   # add GEMINI_API_KEY=<your key> and save
```

**Step 3 — Verify**: in any Claude Code session, say "analyze this image with gemini-vision". Getting an analysis back means the install worked. From then on, phrases like "take a look at this video" trigger the skill automatically.

**Windows note**: Claude Code runs commands through Git Bash, where `~` means `C:\Users\<you>` — every bash command on this page works as-is in Git Bash. In PowerShell, only Step 1's git clone is recommended (git expands `~` itself).

## Usage

```bash
# Basic analysis
node ~/.claude/skills/gemini-vision/scripts/gemini-vision.mjs --file video.mp4 --question "Analyze the pacing and visual style of this video"

# Compare multiple files
node ~/.claude/skills/gemini-vision/scripts/gemini-vision.mjs --file v1.mp4 --file v2.mp4 --question "Compare the two versions — which is better?"

# JSON output (for agents)
node ~/.claude/skills/gemini-vision/scripts/gemini-vision.mjs --file video.mp4 --question "..." --json

# Deep analysis (Pro model)
node ~/.claude/skills/gemini-vision/scripts/gemini-vision.mjs --file video.mp4 --question "..." --model gemini-3.1-pro-preview
```

Full options (`--output` report file, `--system` custom system prompt) are in [SKILL.md](./SKILL.md). Reports come back in the language of your question — ask in English, get English; ask in Chinese, get Chinese.

### Agent integration contract

Two rules when calling from other skills or workflows:

1. **Read stdout only** — the analysis result (or valid JSON); stderr is progress logging, ignore it
2. **`--json` mode** — enforces valid JSON via Gemini's `responseMimeType: application/json`, independent of prompt wording

## Updating

The script checks for a new version once a day (a single GitHub release query; failures are silent and never affect analysis). When a newer release exists, a notice appears in the logs and Claude relays it to you. Upgrading is one sentence in any Claude Code session:

> Update gemini-vision to the latest version

Or manually:

```bash
git -C ~/.claude/skills/gemini-vision pull   # your local .env is untouched
```

When Gemini ships new models, the author updates the fallback chain — users get nudged and upgrade with one sentence to use the latest models.

## Model fallback chain

Defaults to `gemini-3.7-flash`; on 503/429 it degrades automatically: `3.7-flash → 3.6-flash → 3.5-flash → 3.5-flash-lite`. An explicit `--model` never degrades — it fails loudly instead.

## Cloud files & privacy

- Uploaded files are deleted immediately after analysis (guaranteed in a `finally` block, even on failure)
- If the script is killed mid-run, leftover cloud files expire on their own after 48 hours
- Your key lives only in the local `.env` — never in git, never in logs

## Uninstall

```bash
rm -rf ~/.claude/skills/gemini-vision
```

Nothing left behind.

## License

[MIT](./LICENSE)
