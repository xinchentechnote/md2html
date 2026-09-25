#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { cac } from 'cac'
import { renderMarkdown, listThemes } from '../src/index.js'
import { previewPage } from '../src/preview.js'
import { openBrowser } from '../src/open-browser.js'
// JSON 导入会被 esbuild 构建时内联。不能用 createRequire(import.meta.url)：
// 那在 pkg 打包产物的 CJS 沙箱里 import.meta.url 为 undefined，启动即崩
import pkg from '../package.json' with { type: 'json' }

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
  .command('publish <file>', '渲染并发布到公众号草稿箱（不群发，需配置凭据）')
  .option('-t, --theme <name>', '主题')
  .option('--title <title>', '标题（默认取文首 h1 或文件名）')
  .option('--author <author>', '作者（默认取 frontmatter author）')
  .option('--digest <digest>', '摘要（默认 frontmatter digest 或首段前 120 字）')
  .option('--cover <image>', '封面：本地路径或图片 URL（默认文内第一张图）')
  .option('--no-header', '草稿正文不含头卡（默认即剥离，此参数连 HTML 也不渲染）')
  .option('--footer', '草稿正文附一键三连页脚（默认不追加）')
  .action(async (file, options) => {
    const { publish } = await import('../src/publish.js')
    try {
      const report = await publish(file, options)
      console.error(`✔ 已存入草稿箱：${report.title}`)
      console.error(`  草稿 media_id: ${report.mediaId}`)
      console.error(`  正文图转存: ${report.images} 张${report.skipped.length ? `，跳过 ${report.skipped.length} 张（${report.skipped.join('、')}）` : ''}`)
      console.error(`  凭据来源: ${report.configSource}`)
      console.error('  到公众号后台「草稿箱」查看，确认无误后手动群发。')
    } catch (err) {
      console.error(`✖ 发布失败: ${err.message}`)
      process.exitCode = 1
    }
  })
  .example('md2html publish article.md -t deepblue')
  .example('md2html publish article.md --cover ./cover.png --author 歆晨')

cli
  .command('[...files]', 'Markdown → 微信公众号排版 HTML')
  .option('-t, --theme <name>', '主题 id，默认 deepblue')
  .option('-o, --out <file>', '输出路径（单文件时有效，默认同名 .html）')
  .option('--stdout', '仅输出正文 HTML 片段（管道友好）')
  .option('--open', '生成后自动打开预览页')
  .option('--no-header', '不渲染文首标题卡（复制到公众号时本就会自动剔除）')
  .option('--footer', '追加文末一键三连页脚（默认不追加）')
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
    const themeId = options.theme // 未指定时由 renderMarkdown 走 frontmatter.theme → 默认 deepblue
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
  .example('md2html article.md -t deepblue --open')
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
