import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractFrontmatter } from '../src/frontmatter.js'
import { renderMarkdown } from '../src/index.js'

test('frontmatter: 提取字符串与布尔值，body 去掉头部', () => {
  const { meta, body } = extractFrontmatter('---\ntitle: 你好\nauthor: "歆晨"\nfooter: false\n---\n\n正文')
  assert.equal(meta.title, '你好')
  assert.equal(meta.author, '歆晨')
  assert.equal(meta.footer, false)
  assert.ok(body.startsWith('\n正文'))
})

test('frontmatter: 无头信息时原样返回', () => {
  const { meta, body } = extractFrontmatter('# 标题\n')
  assert.deepEqual(meta, {})
  assert.equal(body, '# 标题\n')
})

test('renderMarkdown: 参数 > frontmatter > 默认值', async () => {
  const md = '---\ntitle: fm标题\ndate: 01 JAN 2025\ntheme: moyu\nfooter: false\n---\n# 文内标题\n\n正文'
  // 参数覆盖
  const a = renderMarkdown(md, 'grape', { title: '参数标题', footer: true })
  assert.equal(a.meta.title, '参数标题')
  assert.equal(a.theme.id, 'grape')
  // frontmatter 生效（theme/date/title/footer）
  const b = renderMarkdown(md)
  assert.equal(b.theme.id, 'moyu')
  assert.equal(b.meta.title, 'fm标题')
  assert.equal(b.meta.date, '01 JAN 2025')
  assert.ok(!b.html.includes('三连'), 'footer:false 不应有页脚')
  // 均未指定时 h1 兜底 + 默认主题 deepblue
  const c = renderMarkdown('# 兜底标题\n\nx')
  assert.equal(c.meta.title, '兜底标题')
  assert.equal(c.theme.id, 'deepblue')
  // frontmatter 元信息透出
  const d = renderMarkdown('---\nauthor: 歆晨\ndigest: 摘要\ndigest2: x\ncover: ./c.png\n---\n\nx')
  assert.equal(d.meta.author, '歆晨')
  assert.equal(d.meta.digest, '摘要')
  assert.equal(d.meta.cover, './c.png')
})
