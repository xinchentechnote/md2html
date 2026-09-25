import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { renderMarkdown, listThemes } from '../src/index.js'
import { transform } from '../src/transform.js'
import { parseMarkdown, nodeText } from '../src/parse.js'
import { stripDecorations } from '../src/utils.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const sample = readFileSync(path.join(HERE, 'fixtures/sample.md'), 'utf8')

// 快照是纯正文片段，补 charset 头避免浏览器直接打开时中文乱码；写入与对比同源
const SNAPSHOT_HEAD = '<!-- md2html 回归快照（UTF-8）· 本文件是测试基准，日常预览请用 md2html 生成 -->\n<meta charset="utf-8">\n'

function snapshot(name, html) {
  const file = path.join(HERE, '__snapshots__', `${name}.html`)
  const content = SNAPSHOT_HEAD + html
  if (!existsSync(file) || process.env.UPDATE_SNAPSHOTS) {
    mkdirSync(path.join(HERE, '__snapshots__'), { recursive: true })
    writeFileSync(file, content)
    return
  }
  // 归一化行尾：抵御 Windows checkout 的 autocrlf（另有 .gitattributes 强制 LF 双保险）
  const baseline = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  assert.equal(content, baseline, `快照不一致: ${name}（UPDATE_SNAPSHOTS=1 npm test 更新）`)
}

for (const t of listThemes()) {
  test(`快照: ${t.id}（元素齐全样例）`, () => {
    const { html } = renderMarkdown(sample, t.id, { date: '22 SEP 2026' })
    snapshot(`render-${t.id}`, html)
  })
}

test('transform: h2 自动编号与英文标签拆分', () => {
  const tree = transform(parseMarkdown('## WHY 为什么\n\n## 纯中文标题'), {})
  const h2s = tree.children.filter((n) => n.type === 'heading' && n.depth === 2)
  assert.deepEqual(
    h2s.map((h) => h.meta),
    [
      { no: '01', label: 'WHY' },
      { no: '02', label: null },
    ],
  )
  assert.equal(nodeText(h2s[0]), '为什么')
})

test('transform: 同段落多图合并图集，单图段落独立成卡', () => {
  const one = transform(parseMarkdown('![a](u1)\n![b](u2)\n![c](u3)'), {})
  assert.equal(one.children.filter((n) => n.type === 'gallery')[0].images.length, 3)
  const single = transform(parseMarkdown('![a](u1)'), {})
  assert.ok(single.children.some((n) => n.type === 'imageCard'))
  assert.ok(!single.children.some((n) => n.type === 'gallery'))
})

test('transform: 空行是分组边界，跨空行的单图不合并图集', () => {
  const md = '![a](u1)\n\n![b](u2)\n\n![c](u3)'
  const tree = transform(parseMarkdown(md), {})
  assert.equal(tree.children.filter((n) => n.type === 'imageCard').length, 3)
  assert.ok(!tree.children.some((n) => n.type === 'gallery'))
})

test('transform: 头卡默认渲染，页脚默认不追加', () => {
  const t = transform(parseMarkdown('# 标题\n\n正文'), {})
  assert.equal(t.children[0].type, 'headerCard')
  assert.ok(!t.children.some((n) => n.type === 'footerCard'), '页脚默认不追加')
  const withFooter = transform(parseMarkdown('# 标题\n\n正文'), { footer: true })
  assert.equal(withFooter.children.at(-1).type, 'footerCard')
  const off = transform(parseMarkdown('# 标题\n\n正文'), { header: false })
  assert.ok(!off.children.some((n) => n.type === 'headerCard'))
  assert.ok(off.children.some((n) => n.type === 'heading' && n.depth === 1), '关闭头卡时 h1 留在正文')
})

test('render: 产出无 class/id/<style>，样式全内联', () => {
  const { html } = renderMarkdown(sample, 'moyu', { date: '22 SEP 2026' })
  assert.ok(!/class=|id=|<style|<script/.test(html), '正文不允许出现 class/id/style/script')
  assert.ok(html.includes('style="'))
})

test('render: 代码块逐行 span 且保留高亮色', () => {
  const { html } = renderMarkdown('```js\n// 注释\nconst a = "s"\n```', 'moyu', { footer: false })
  assert.ok(html.includes('display:block'))
  assert.ok(html.includes('#6A9955'), '注释应有高亮色')
  assert.ok(html.includes('#CE9178'), '字符串应有高亮色')
})

test('render: 宽表格降级为逐行卡片，窄表格保留 table', () => {
  const wide = renderMarkdown('| a | b | c | d |\n| --- | --- | --- | --- |\n| 1 | 2 | 3 | 4 |', 'moyu', { footer: false })
  assert.ok(!wide.html.includes('<table'), '4 列表格应降级')
  const narrow = renderMarkdown('| a | b | c |\n| --- | --- | --- |\n| 1 | 2 | 3 |', 'moyu', { footer: false })
  assert.ok(narrow.html.includes('<table'), '3 列表格应保留 table')
})

test('render: 段落与单元格长词换行保护', () => {
  const { html } = renderMarkdown('文字 https://a-very-long-example-url.test/with/many/segments', 'moyu', {
    footer: false,
  })
  assert.ok(html.includes('overflow-wrap:break-word'))
})

test('render: 嵌套多级列表可渲染', () => {
  const { html } = renderMarkdown('- a\n  - b\n    - c', 'moyu', { footer: false })
  const bullets = html.match(/border-radius:50%;background:#07C160/g)
  assert.equal(bullets.length, 3)
})

test('render: 空文档不抛错且有标题卡兜底', () => {
  const { html } = renderMarkdown('', 'moyu')
  assert.ok(html.includes('无标题'))
})

test('render: 头尾带标记；stripDecorations 只删指定块保留正文', () => {
  const { html } = renderMarkdown('# 文章标题\n\n正文内容', 'moyu', { footer: true })
  assert.ok(html.includes('data-md2html-block="header"'), '头卡有标记')
  assert.ok(html.includes('data-md2html-block="footer"'), '页脚有标记')
  const stripped = stripDecorations(html)
  assert.ok(!stripped.includes('data-md2html-block'), '标记块已剔除')
  assert.ok(!stripped.includes('三连'), '页脚不残留')
  assert.ok(stripped.includes('正文内容'), '正文保留')
  const onlyHeader = stripDecorations(html, ['header'])
  assert.ok(onlyHeader.includes('三连'), '仅剥头时页脚保留')
})

test('render: --no-header 时 h1 渲染为居中标题', () => {
  const { html } = renderMarkdown('# 文章标题\n\n正文', 'moyu', { header: false, footer: false })
  assert.ok(!html.includes('linear-gradient'), '无头卡')
  assert.ok(html.includes('text-align:center'), 'h1 居中')
})

test('themes: 全部主题变量完整且各具主色', () => {
  for (const t of listThemes()) {
    const { html } = renderMarkdown('# t\n\nbody', t.id, { footer: false })
    assert.ok(html.length > 0, `${t.id} 应可渲染`)
  }
  const ids = listThemes().map((t) => t.id)
  assert.deepEqual(ids, ['moyu', 'redwhite', 'deepblue', 'orange', 'grape', 'peach'])
})
