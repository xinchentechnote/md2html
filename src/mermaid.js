/**
 * mermaid 后处理：把渲染层输出的「代码卡 + data-md2html-mermaid 标记」替换为内嵌 PNG。
 * 引擎优先级（auto）：本地 mmdc → mermaid.ink 在线服务 → 保留代码卡兜底。
 * 图片以 data URI 内嵌，HTML 单文件自包含。
 */
import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { s, findSectionEnd } from './utils.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MMDC = path.join(HERE, '../node_modules/.bin', process.platform === 'win32' ? 'mmdc.cmd' : 'mmdc')

export async function inlineMermaid(html, { engine = 'auto', vars, scale = 2, renderPng } = {}) {
  const renderer =
    renderPng ?? ((code) => renderMermaidPng(code, { engine, vars, scale }))
  let out = html
  const marker = /<section data-md2html-mermaid="([^"]*)"/g
  const jobs = []
  for (const m of out.matchAll(marker)) jobs.push({ start: m.index, code: Buffer.from(m[1], 'base64').toString('utf8') })
  // 从后往前替换，避免下标位移
  for (const { start, code } of jobs.reverse()) {
    const end = findSectionEnd(out, start)
    if (end === -1) continue
    try {
      const png = await renderer(code)
      out = out.slice(0, start) + imageCard(png, vars) + out.slice(end)
    } catch (err) {
      console.error(`⚠ mermaid 渲染失败，保留代码卡：${err.message}`)
    }
  }
  return out
}

function imageCard(png, vars) {
  const r = vars?.radius ?? { card: '12px' }
  return (
    `<section style="${s({ background: '#FFFFFF', borderRadius: r.card, padding: '12px 8px', margin: '16px 0' })}">` +
    `<img src="data:image/png;base64,${png.toString('base64')}" alt="mermaid 图表" style="${s({ maxWidth: '100%', display: 'block', margin: '0 auto' })}">` +
    `</section>`
  )
}

/** 单图渲染入口（CLI 后处理与 ui-server 共用）：mmdc（本地装了才用）→ ink → 抛错 */
export async function renderMermaidPng(code, { engine = 'auto', vars, scale = 2 } = {}) {
  const wantMmdc = engine === 'mmdc' || (engine === 'auto' && existsSync(MMDC))
  if (wantMmdc) {
    if (!existsSync(MMDC)) {
      throw new Error('未安装 mmdc（npm i -D @mermaid-js/mermaid-cli），或改用 --mermaid ink')
    }
    return renderWithMmdc(code, { vars, scale })
  }
  if (engine === 'auto' || engine === 'ink') return renderWithInk(code)
  throw new Error(`未知引擎 "${engine}"（可选 auto/ink/mmdc/off）`)
}

async function renderWithMmdc(code, { vars, scale }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'md2html-mermaid-'))
  const input = path.join(dir, 'in.mmd')
  const output = path.join(dir, 'out.png')
  writeFileSync(input, code, 'utf8')
  try {
    // 主题联动：mermaid 变量映射自 designVars（图与文章配色一致）
    const themeVariables = vars
      ? {
          primaryColor: vars.colors.accentLight,
          primaryBorderColor: vars.colors.accent,
          primaryTextColor: vars.colors.heading,
          lineColor: vars.colors.accent,
          textColor: vars.colors.text,
          background: '#FFFFFF',
          fontFamily: vars.font.family,
        }
      : undefined
    const args = ['-i', input, '-o', output, '-s', String(scale), '-b', 'white']
    if (themeVariables) args.push('--themeVariables', JSON.stringify(themeVariables))
    await new Promise((resolve, reject) => {
      execFile(MMDC, args, { timeout: 60000 }, (err, _stdout, stderr) =>
        err ? reject(new Error(stderr || err.message)) : resolve(),
      )
    })
    const { readFile } = await import('node:fs/promises')
    return await readFile(output)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function renderWithInk(code) {
  // mermaid.ink 路径要求 URL-safe base64（+/ 会 404）；源码必须以换行结尾，否则 400
  const normalized = code.endsWith('\n') ? code : `${code}\n`
  const b64 = Buffer.from(normalized, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  // 注意：scale 参数必须配合 width/height，单独使用返回 400
  const res = await fetch(`https://mermaid.ink/img/${b64}?type=png`, {
    headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) md2html' },
  })
  if (!res.ok) throw new Error(`mermaid.ink HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}
