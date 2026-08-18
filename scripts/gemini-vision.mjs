#!/usr/bin/env node
/**
 * Gemini 多模态桥接 — 主入口 v1.0
 *
 * 用法:
 *   node gemini-vision.mjs --file <path> --question "<问题>"
 *   node gemini-vision.mjs --file <path1> --file <path2> --question "<问题>"
 *   node gemini-vision.mjs --file <path> --question "<问题>" --json
 *   node gemini-vision.mjs --file <path> --question "<问题>" --output report.md
 *
 * 选项:
 *   --file, -f    <path>   媒体文件路径（可多次指定）
 *   --question, -q <text>  分析问题（必填）
 *   --model, -m   <name>   模型（默认 gemini-3.7-flash；503/429 时自动降级到 gemini-3.6-flash → gemini-3.5-flash → gemini-3.5-flash-lite。显式指定 --model 时不降级）
 *   --output, -o  <path>   额外写入 Markdown 报告文件
 *   --json                  输出纯 JSON（由 API 层强制，Claude Code 可安全 parse）
 *   --system, -s  <text>   自定义系统提示词（可选，默认用内置）
 */

import { loadApiKey, uploadFile, generateContent, deleteFile } from './lib/gemini-client.mjs'
import { writeFileSync, statSync } from 'fs'
import { resolve } from 'path'

// ════════════════════════════════════════════════════════
// 参数解析
// ════════════════════════════════════════════════════════

const args = process.argv.slice(2)
const options = {
  files: [],
  question: '',
  model: 'gemini-3.7-flash',
  output: null,
  jsonMode: false,
  system: ''
}

let i = 0
while (i < args.length) {
  switch (args[i]) {
    case '--file': case '-f':     options.files.push(args[++i]); break
    case '--question': case '-q': options.question = args[++i]; break
    case '--model': case '-m':    options.model = args[++i]; break
    case '--output': case '-o':   options.output = args[++i]; break
    case '--json':                options.jsonMode = true; break
    case '--system': case '-s':   options.system = args[++i]; break
    default:
      if (!options.question && !args[i].startsWith('-')) options.question = args[i]
  }
  i++
}

// ════════════════════════════════════════════════════════
// 校验
// ════════════════════════════════════════════════════════

if (options.files.length === 0) {
  console.error('❌ 请指定媒体文件: --file <path>')
  console.error('   支持格式: mp4, mov, avi, webm, png, jpg, webp, gif, mp3, wav')
  process.exit(1)
}

if (!options.question) {
  console.error('❌ 请指定分析问题: --question "<问题>"')
  console.error('   示例: --question "分析这个视频的运镜手法和剪辑节奏"')
  process.exit(1)
}

// 检查文件存在，区分"不存在"和"无权限访问"
for (const f of options.files) {
  try {
    statSync(resolve(f))
  } catch (err) {
    const msg = err.code === 'ENOENT' ? '文件不存在' : `无法访问文件 (${err.code})`
    console.error(`❌ ${msg}: ${f}`)
    process.exit(1)
  }
}

// ════════════════════════════════════════════════════════
// 默认系统提示词
// ════════════════════════════════════════════════════════

const DEFAULT_SYSTEM = `你是专业的多模态媒体分析专家，服务于创意与视频制作团队。你的分析报告被 AI Agent（Claude Code 等）直接消费，同时也被人阅读。

输出语言：始终与用户提问的语言一致 — 英文提问输出英文报告，中文提问输出中文报告，其他语言同理。

分析原则：
1. 具体、量化、可操作 — 不说"画面不错"，说"暖色调主导，色温约 4500K，高光略过曝约 0.5 档"
2. 结构清晰 — 分维度、分条目，每条一个观察
3. 提炼可复用框架 — 不只描述"是什么"，还要指出"怎么做"，例如"运镜手法：手持微晃 + 快速推拉，节奏控制在 2.5s/镜头"
4. 诚实 — 看不到的就说看不到，听不清的就说听不清，不要编造

输出格式：
- 如果分析的是创意参考视频：用"## 可复用框架"结构化提炼
- 如果是对比生成结果和提示词：用"## 匹配度评估"逐条对比
- 最后始终有一个"## 总结"段落，3-5 句话概括核心发现和行动建议`

const systemPrompt = options.system || DEFAULT_SYSTEM

// ════════════════════════════════════════════════════════
// 模型降级链
// ════════════════════════════════════════════════════════

const MODEL_PRIORITY = ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite']
const RETRYABLE_CODES = [503, 429]

/**
 * 构建模型尝试队列。
 * 用户显式指定 --model 时只用该模型，不降级；
 * 使用默认模型时按 PRIORITY 列表逐个尝试。
 */
function buildModelQueue(requestedModel, isExplicit) {
  if (isExplicit) return [requestedModel]
  // 以 requestedModel 为起点，后面跟 PRIORITY 中剩余的（去重）
  const rest = MODEL_PRIORITY.filter(m => m !== requestedModel)
  return [requestedModel, ...rest]
}

/** 判断是否为可重试（降级）的错误 */
function isRetryable(err) {
  return RETRYABLE_CODES.some(code => err.message.includes(String(code)))
}

// ════════════════════════════════════════════════════════
// 执行
// ════════════════════════════════════════════════════════

async function main() {
  const apiKey = loadApiKey()
  const uploaded = []

  try {
    // 上传所有文件（uploadFile 内部已等待 ACTIVE，视频自动轮询）
    console.error(`📤 上传 ${options.files.length} 个文件...`)
    for (const fp of options.files) {
      uploaded.push(await uploadFile(apiKey, fp))
    }

    // 构建问题（后缀指令用英文作中立锚点，语言规则写两遍保证服从）
    let question = options.question + '\n\n---\nAnalyze the media file(s) above and produce a professional report in the same language as the question.'
    if (options.jsonMode) {
      question += '\n\nOutput strict JSON with this structure: {"summary":"one-line summary","findings":[{"dimension":"analysis dimension","observation":"observation","score":1-10,"actionable":"actionable suggestion"}],"overall_score":1-10}. Write all string values in the same language as the question.'
    }

    // 模型降级链：默认优先 3.7-flash，503/429 时自动降级
    const userExplicitModel = process.argv.includes('--model') || process.argv.includes('-m')
    const modelQueue = buildModelQueue(options.model, userExplicitModel)
    let result = null
    let usedModel = null
    let lastError = null

    for (const model of modelQueue) {
      try {
        console.error(`🤖 调用 ${model}...`)
        result = await generateContent(
          apiKey, model, systemPrompt, question, uploaded, options.jsonMode
        )
        usedModel = model
        break
      } catch (err) {
        lastError = err
        if (isRetryable(err) && modelQueue.indexOf(model) < modelQueue.length - 1) {
          console.error(`⚠️ ${model} 不可用 (${err.message.split('\n')[0]}), 降级重试...`)
          continue
        }
        throw err
      }
    }

    if (!result) throw lastError

    // 输出结果到 stdout（Claude Code 从这里读取，stderr 的日志不会干扰）
    console.log(result)

    // 可选：写入 Markdown 报告文件
    if (options.output) {
      const outPath = resolve(options.output)
      const md = `# 多模态分析报告\n\n**模型**: ${usedModel}\n**文件**: ${options.files.join(', ')}\n**时间**: ${new Date().toISOString()}\n\n---\n\n${result}`
      writeFileSync(outPath, md, 'utf-8')
      console.error(`📄 报告已写入: ${outPath}`)
    }

  } finally {
    // 无论成功或失败（含上传中途报错），都清理已上传的云端文件，释放配额
    for (const file of uploaded) {
      try {
        await deleteFile(apiKey, file.name)
      } catch (e) {
        console.error(`⚠️ 清理文件失败: ${file.name} — ${e.message}`)
      }
    }
  }
}

main().catch(err => {
  console.error(`❌ 运行失败: ${err.message}`)
  process.exit(1)
})
