/**
 * Gemini API 轻量封装 — 零外部依赖 v1.1
 */

import { readFileSync, writeFileSync, statSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const API_BASE = 'https://generativelanguage.googleapis.com'

// ─── API Key ───────────────────────────────────────────

/** 从环境变量或 .env 文件读取 GEMINI_API_KEY */
export function loadApiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY

  const envPath = resolve(__dirname, '..', '..', '.env')
  try {
    const content = readFileSync(envPath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('#') || !trimmed.includes('=')) continue
      const [key, ...rest] = trimmed.split('=')
      if (key.trim() === 'GEMINI_API_KEY') {
        const value = rest.join('=').trim()
        if (value && value !== 'your-gemini-api-key-here') return value
      }
    }
  } catch (_) {}

  console.error('❌ 缺少 GEMINI_API_KEY')
  console.error(`   请创建 .env 文件: ${resolve(__dirname, '..', '..', '.env')}`)
  console.error('   内容：GEMINI_API_KEY=<你的API Key>')
  process.exit(1)
}

// ─── File Upload ───────────────────────────────────────

/**
 * 上传文件到 Gemini File API，并等待云端处理完成（ACTIVE）后返回。
 * 图片通常无需等待，视频会自动轮询直到 ACTIVE。
 * @returns {{ name: string, uri: string, mimeType: string }}
 */
export async function uploadFile(apiKey, filePath) {
  const absPath = resolve(filePath)
  const fileName = absPath.split(/[/\\]/).pop()
  const fileSize = statSync(absPath).size
  const mimeType = mimeFromExt(fileName)

  if (fileSize > 2 * 1024 * 1024 * 1024) {
    throw new Error(`文件超过 2GB 限制: ${fileName}`)
  }

  // Step 1: 获取上传 URL（resumable upload）
  const startUrl = `${API_BASE}/upload/v1beta/files?key=${apiKey}`
  const metadata = JSON.stringify({ file: { display_name: fileName } })

  const initResp = await fetch(startUrl, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(fileSize),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(metadata))
    },
    body: metadata
  })

  if (!initResp.ok) {
    const err = await initResp.text()
    throw new Error(`Gemini 上传初始化失败: ${initResp.status} ${err}`)
  }

  const uploadUrl = initResp.headers.get('x-goog-upload-url')
  if (!uploadUrl) throw new Error('未获取到上传 URL')

  // Step 2: 上传文件内容
  const fileBuffer = readFileSync(absPath)
  const uploadResp = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Command': 'upload, finalize',
      'X-Goog-Upload-Offset': '0',
      'Content-Length': String(fileSize),
      'Content-Type': mimeType
    },
    body: fileBuffer
  })

  if (!uploadResp.ok) {
    const err = await uploadResp.text()
    throw new Error(`Gemini 文件上传失败: ${uploadResp.status} ${err}`)
  }

  const result = await uploadResp.json()
  const fileInfo = result.file || result
  console.error(`📤 已上传: ${fileName} (${(fileSize / 1024 / 1024).toFixed(1)}MB) → ${fileInfo.name}`)

  // Step 3: 若文件尚未 ACTIVE（视频需要云端抽帧处理），则轮询等待
  if (fileInfo.state !== 'ACTIVE') {
    await waitForFileActive(apiKey, fileInfo.name)
  }

  return {
    name: fileInfo.name,   // 格式: "files/xxxx"，用于 deleteFile
    uri: fileInfo.uri,     // 格式: "https://...files/xxxx"，用于 generateContent
    mimeType
  }
}

/**
 * 轮询文件状态，直到变为 ACTIVE。
 * 每 3 秒查询一次，最多等待 maxWait 毫秒（默认 2 分钟）。
 * @internal
 */
async function waitForFileActive(apiKey, fileName, maxWait = 120000) {
  const url = `${API_BASE}/v1beta/${fileName}?key=${apiKey}`
  const start = Date.now()

  process.stderr.write('⏳ 等待云端处理')
  while (Date.now() - start < maxWait) {
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`查询文件状态失败 (${resp.status})`)

    const info = await resp.json()
    if (info.state === 'ACTIVE') {
      console.error(' ✅ 处理完成')
      return
    }
    if (info.state === 'FAILED') {
      throw new Error(`文件处理失败: ${info.error?.message || '未知错误'}`)
    }
    process.stderr.write('.')
    await new Promise(r => setTimeout(r, 3000))
  }
  throw new Error('文件处理超时（>2分钟），请检查文件格式或稍后重试')
}

// ─── File Delete ───────────────────────────────────────

/**
 * 删除 Gemini 云端文件，释放存储配额。
 * 每次分析结束后调用，防止 20GB 配额被耗尽。
 * @param {string} fileName - uploadFile 返回的 name 字段（格式: "files/xxxx"）
 */
export async function deleteFile(apiKey, fileName) {
  const url = `${API_BASE}/v1beta/${fileName}?key=${apiKey}`
  const resp = await fetch(url, { method: 'DELETE' })
  // 404 表示文件已不存在（可能已过期），视为成功
  if (!resp.ok && resp.status !== 404) {
    throw new Error(`删除失败 (${resp.status})`)
  }
  console.error(`🗑️ 已清理云端文件: ${fileName}`)
}

// ─── Content Generation ────────────────────────────────

/**
 * 调用 Gemini generateContent API 分析媒体文件。
 * @param {string} apiKey
 * @param {string} model          - gemini-3.7-flash | gemini-3.6-flash | gemini-3.5-flash | gemini-3.5-flash-lite
 * @param {string} systemPrompt   - 系统指令
 * @param {string} userQuestion   - 用户问题
 * @param {Array<{uri: string, mimeType: string}>} files - 已上传的媒体文件列表
 * @param {boolean} jsonMode      - true 时用 responseMimeType 强制返回纯 JSON
 * @returns {string} Gemini 返回的文本（jsonMode=true 时为合法 JSON 字符串）
 */
export async function generateContent(apiKey, model, systemPrompt, userQuestion, files = [], jsonMode = false) {
  const url = `${API_BASE}/v1beta/models/${model}:generateContent?key=${apiKey}`

  const parts = []
  for (const file of files) {
    parts.push({ file_data: { mime_type: file.mimeType, file_uri: file.uri } })
  }
  parts.push({ text: userQuestion })

  const body = {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.4,
      topP: 0.95,
      maxOutputTokens: 8192,
      // jsonMode=true 时通过 API 参数强制纯 JSON，不依赖 prompt 措辞
      ...(jsonMode ? { responseMimeType: 'application/json' } : {})
    }
  }

  if (systemPrompt) {
    body.system_instruction = { parts: [{ text: systemPrompt }] }
  }

  // 120 秒超时（视频分析可能较慢）
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120000)

  let resp
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    })
  } catch (err) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') throw new Error('Gemini API 请求超时（>120秒），请重试')
    throw err
  }
  clearTimeout(timeoutId)

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Gemini API 调用失败 (${resp.status}): ${err}`)
  }

  const data = await resp.json()

  if (!data.candidates || data.candidates.length === 0) {
    if (data.promptFeedback?.blockReason) {
      throw new Error(`Gemini 拒绝响应: ${data.promptFeedback.blockReason}`)
    }
    throw new Error('Gemini 返回空响应')
  }

  const text = data.candidates[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini 响应中无文本内容')

  if (data.usageMetadata) {
    const { promptTokenCount, candidatesTokenCount } = data.usageMetadata
    console.error(`📊 Token: ${promptTokenCount} prompt + ${candidatesTokenCount} response`)
  }

  return text
}

// ─── 新版本检测 ────────────────────────────────────────

const UPDATE_URL = 'https://api.github.com/repos/zouerdong/gemini-vision/releases/latest'
const CHECK_INTERVAL = 24 * 60 * 60 * 1000

/**
 * 每天检查一次 GitHub 最新 release，发现新版本在 stderr 提示一行（Claude 会转告用户）。
 * 任何失败（网络/限流/解析）都静默跳过，绝不影响、绝不阻塞分析。
 */
export async function checkForUpdate() {
  try {
    const marker = resolve(__dirname, '..', '..', '.update-check')
    let last = 0
    try { last = Number(readFileSync(marker, 'utf-8')) || 0 } catch (_) {}
    if (Date.now() - last < CHECK_INTERVAL) return
    writeFileSync(marker, String(Date.now()))  // 先记时间戳：失败的检查也隔天再试，避免每次分析都多等

    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 5000)
    const resp = await fetch(UPDATE_URL, {
      headers: { 'User-Agent': 'gemini-vision' },
      signal: controller.signal
    })
    clearTimeout(t)
    if (!resp.ok) return

    const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'package.json'), 'utf-8'))
    const latest = ((await resp.json()).tag_name || '').replace(/^v/, '')
    if (latest && isNewer(latest, pkg.version)) {
      console.error(`⬆️ gemini-vision 有新版本 v${latest}（含最新模型降级链）。请转告用户：对 Claude Code 说「更新 gemini-vision」即可升级。`)
    }
  } catch (_) {}
}

/** 语义化版本比较：a 是否大于 b（仅 x.y.z 三段） */
function isNewer(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true
    if ((pa[i] || 0) < (pb[i] || 0)) return false
  }
  return false
}

// ─── Helpers ───────────────────────────────────────────

function mimeFromExt(fileName) {
  const ext = fileName.split('.').pop().toLowerCase()
  const map = {
    mp4:  'video/mp4',
    mov:  'video/quicktime',
    mpeg: 'video/mpeg',
    mpg:  'video/mpeg',
    avi:  'video/x-msvideo',
    webm: 'video/webm',
    png:  'image/png',
    jpg:  'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif:  'image/gif',
    bmp:  'image/bmp',
    mp3:  'audio/mpeg',
    wav:  'audio/wav',
    m4a:  'audio/mp4'
  }
  return map[ext] || 'application/octet-stream'
}
