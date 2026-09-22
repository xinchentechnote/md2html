import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { renderMarkdown, listThemes } from '../src/index.js'
import { transform } from '../src/transform.js'
import { parseMarkdown, nodeText } from '../src/parse.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const sample = readFileSync(path.join(HERE, 'fixtures/sample.md'), 'utf8')

function snapshot(name, html) {
  const file = path.join(HERE, '__snapshots__', `${name}.html`)
  if (!existsSync(file) || process.env.UPDATE_SNAPSHOTS) {
    mkdirSync(path.join(HERE, '__snapshots__'), { recursive: true })
    writeFileSync(file, html)
    return
  }
  assert.equal(html, readFileSync(file, 'utf8'), `快照不一致: ${name}（UPDATE_SNAPSHOTS=1 npm test 更新）`)
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

test('transform: h1 摘取为标题卡，默认追加页脚，footer:false 可关', () => {
  const tree = transform(parseMarkdown('# 标题\n\n正文'), {})
  assert.equal(tree.children[0].type, 'headerCard')
  assert.equal(tree.children[0].title, '标题')
  assert.equal(tree.children.at(-1).type, 'footerCard')
  const noFooter = transform(parseMarkdown('# 标题\n\n正文'), { footer: false })
  assert.notEqual(noFooter.children.at(-1).type, 'footerCard')
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
