#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { cac } from 'cac'
import { renderMarkdown, listThemes } from '../src/index.js'
import { previewPage } from '../src/preview.js'
import { openBrowser } from '../src/open-browser.js'

const require = createRequire(import.meta.url)
const pkg = require('../package.json')

const cli = cac('md2html')

cli
  .command('ui [file]', '浏览器编辑器：编辑 md 实时预览、⌘S 保存、一键复制')
  .option('-t, --theme <name>', '默认主题（页面内可随时切换）')
  .option('--no-open', '启动后不自动打开浏览器')
  .action(async (file, options) => {
    const { startEditorServer } = await import('../src/ui-server.js')
    const { url } = await startEditorServer({
      file: file ? path.resolve(file) : undefined,
      theme: options.theme,
    })
    console.error(`✔ 编辑器已启动: ${url}（Ctrl+C 退出）`)
    if (options.open !== false) openBrowser(url)
  })
  .example('md2html ui article.md -t deepblue')

cli
  .command('[...files]', 'Markdown → 微信公众号排版 HTML')
  .option('-t, --theme <name>', '主题 id，默认 moyu')
  .option('-o, --out <file>', '输出路径（单文件时有效，默认同名 .html）')
  .option('--stdout', '仅输出正文 HTML 片段（管道友好）')
  .option('--open', '生成后自动打开预览页')
  .option('--no-footer', '不追加一键三连页脚')
  .option('--list-themes', '列出可用主题')
  .option('-w, --watch', '监听文件变更并重新生成（单文件）')
  .action(async (files, options) => {
    if (options.listThemes) {
      for (const t of listThemes()) console.log(`${t.id.padEnd(12)}${t.name}  ${t.description || ''}`)
      return
    }
    if (!files || files.length === 0) {
      cli.outputHelp()
      process.exitCode = 1
      return
    }
    const themeId = options.theme || 'moyu'
    const convertOne = async (file) => {
      const md = file === '-' ? await readStdin() : await readFile(file, 'utf8')
      const base = file === '-' ? 'stdin' : file.replace(/\.md$/i, '')
      const { html, theme, meta } = renderMarkdown(md, themeId, { footer: options.footer })
      if (options.stdout) {
        console.log(html)
        return null
      }
      const out = files.length === 1 && options.out ? options.out : `${base}.html`
      await writeFile(out, previewPage(html, { themeName: theme.name }), 'utf8')
      console.error(`✔ ${file} → ${out}（主题: ${theme.name}${meta.title ? ` · ${meta.title}` : ''}）`)
      return out
    }
    let firstOut = null
    for (const file of files) {
      const out = await convertOne(file)
      if (out && !firstOut) firstOut = out
    }
    if (options.open && firstOut) openBrowser(pathToFileURL(path.resolve(firstOut)).href)
    if (options.watch) {
      if (options.stdout) {
        console.error('⚠ --watch 与 --stdout 不兼容，已忽略 --watch')
      } else if (files.length !== 1 || files[0] === '-') {
        console.error('⚠ --watch 仅支持监听单个文件')
      } else {
        const { watch } = await import('node:fs')
        let timer = null
        watch(files[0], () => {
          clearTimeout(timer)
          // 防抖：编辑器保存时常触发多次事件
          timer = setTimeout(() => convertOne(files[0]).catch((e) => console.error(`✖ ${e.message}`)), 200)
        })
        console.error(`👁 正在监听 ${files[0]}，保存后自动重新生成（Ctrl+C 退出）`)
      }
    }
  })
  .example('md2html article.md')
  .example('md2html article.md -t moyu --open')
  .example('md2html article.md -w --open   # 监听变更实时预览')
  .example('md2html article.md --stdout | head')

cli.version(pkg.version)
cli.help()
cli.parse()

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}
