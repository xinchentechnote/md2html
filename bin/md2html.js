#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { cac } from 'cac'
import { renderMarkdown, listThemes } from '../src/index.js'
import { previewPage } from '../src/preview.js'
import { openBrowser } from '../src/utils.js'

const require = createRequire(import.meta.url)
const pkg = require('../package.json')

const cli = cac('md2html')

cli
  .command('[...files]', 'Markdown → 微信公众号排版 HTML')
  .option('-t, --theme <name>', '主题 id，默认 moyu')
  .option('-o, --out <file>', '输出路径（单文件时有效，默认同名 .html）')
  .option('--stdout', '仅输出正文 HTML 片段（管道友好）')
  .option('--open', '生成后自动打开预览页')
  .option('--no-footer', '不追加一键三连页脚')
  .option('--list-themes', '列出可用主题')
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
    let firstOut = null
    for (const file of files) {
      const md = file === '-' ? await readStdin() : await readFile(file, 'utf8')
      const base = file === '-' ? 'stdin' : file.replace(/\.md$/i, '')
      const { html, theme, meta } = renderMarkdown(md, themeId, { footer: options.footer })
      if (options.stdout) {
        console.log(html)
        continue
      }
      const out = files.length === 1 && options.out ? options.out : `${base}.html`
      await writeFile(out, previewPage(html, { themeName: theme.name }), 'utf8')
      if (!firstOut) firstOut = out
      console.error(`✔ ${file} → ${out}（主题: ${theme.name}${meta.title ? ` · ${meta.title}` : ''}）`)
    }
    if (options.open && firstOut) openBrowser(pathToFileURL(path.resolve(firstOut)).href)
  })
  .example('md2html article.md')
  .example('md2html article.md -t moyu --open')
  .example('md2html article.md --stdout | head')

cli.version(pkg.version)
cli.help()
cli.parse()

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}
