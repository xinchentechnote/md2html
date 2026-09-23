// 二进制冒烟测试（跨平台，CI 与本地通用）：
//   node scripts/smoke-test.mjs <target>   如 macos-arm64 / linux-x64 / win-x64
// 验证：--version、--list-themes、md→html 转换、ui 服务（内嵌编辑器 bundle、读写闭环）。
import { spawn, spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { writeFile, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const target = process.argv[2]
if (!target) throw new Error('用法: node scripts/smoke-test.mjs <target>，如 macos-arm64')

const found = readdirSync(path.resolve('dist')).find((f) => f.includes(target))
if (!found) throw new Error(`dist/ 中未找到包含 "${target}" 的二进制`)
const bin = path.resolve('dist', found)
console.log(`▶ 测试 ${bin}`)

const run = (args, opts = {}) => {
  const r = spawnSync(bin, args, { encoding: 'utf8', ...opts })
  if (r.status !== 0) throw new Error(`md2html ${args.join(' ')} 退出码 ${r.status}: ${r.stderr || r.stdout}`)
  return r
}

// 1) --version / --list-themes
const ver = run(['--version']).stdout.trim()
console.log(`✔ --version → ${ver}`)
const themes = run(['--list-themes']).stdout
if (!themes.includes('moyu')) throw new Error('--list-themes 缺少 moyu')
console.log(`✔ --list-themes → ${themes.trim().split('\n').length} 套主题`)

// 2) 转换
const tmpMd = path.join(os.tmpdir(), `md2html-smoke-${Date.now()}.md`)
await writeFile(tmpMd, '# 冒烟测试标题\n\n**加粗** 与 `行内代码`\n', 'utf8')
const outHtml = tmpMd.replace(/\.md$/, '.html')
run([tmpMd])
const html = await readFile(outHtml, 'utf8')
if (!html.includes('复制到公众号') || !html.includes('冒烟测试标题')) throw new Error('转换产物缺少关键内容')
console.log('✔ md → html 转换（含复制按钮与正文）')

// 3) ui 服务：内嵌编辑器 bundle + 状态读取 + 保存闭环
const child = spawn(bin, ['ui', tmpMd, '--no-open'], { stdio: ['ignore', 'pipe', 'pipe'] })
try {
  const url = await waitForUrl(child)
  const page = await (await fetch(url)).text()
  if (!page.includes('md2html')) throw new Error('ui 页面异常')
  const state = await (await fetch(`${url}/api/state`)).json()
  if (!state.content.includes('冒烟测试标题')) throw new Error('ui 初始内容异常')
  const js = await (await fetch(`${url}/editor.js`)).text()
  if (js.length < 5000) throw new Error(`编辑器 bundle 疑似未内嵌（${js.length} 字节）`)
  const put = await fetch(`${url}/api/file`, { method: 'PUT', body: '# 保存验证\n' })
  if (put.status !== 200) throw new Error('ui 保存失败')
  const saved = await readFile(tmpMd, 'utf8')
  if (saved !== '# 保存验证\n') throw new Error('ui 保存未写回')
  console.log('✔ ui 服务（内嵌编辑器 bundle、状态、保存闭环）')
} finally {
  child.kill()
  await rm(tmpMd, { force: true })
  await rm(outHtml, { force: true })
}

function waitForUrl(proc) {
  return new Promise((resolve, reject) => {
    let buf = ''
    const timer = setTimeout(() => reject(new Error('等待 ui 服务启动超时')), 20000)
    const onData = (d) => {
      buf += d
      const m = buf.match(/http:\/\/127\.0\.0\.1:\d+/)
      if (m) {
        clearTimeout(timer)
        resolve(m[0])
      }
    }
    proc.stdout.on('data', onData)
    proc.stderr.on('data', onData)
    proc.on('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`ui 进程提前退出（${code}）: ${buf}`))
    })
  })
}
