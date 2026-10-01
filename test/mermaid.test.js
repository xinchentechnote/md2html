import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderMarkdown } from '../src/index.js'
import { transform } from '../src/transform.js'
import { parseMarkdown } from '../src/parse.js'
import { inlineMermaid } from '../src/mermaid.js'

const MERMAID_MD = '```mermaid\ngraph LR\n  A --> B\n```\n'

test('transform: mermaid 代码块转为 mermaidBlock 节点', () => {
  const tree = transform(parseMarkdown(MERMAID_MD), {})
  const block = tree.children.find((n) => n.type === 'mermaidBlock')
  assert.ok(block, '存在 mermaidBlock')
  assert.equal(block.code, 'graph LR\n  A --> B')
})

test('render: mermaid 兜底形态 = 标记 + 主题代码卡', () => {
  const { html } = renderMarkdown(MERMAID_MD, 'moyu', { header: false })
  assert.ok(html.includes('<section data-md2html-mermaid="'))
  assert.ok(html.includes('graph LR'), '源码保留在代码卡里')
  assert.ok(html.includes('#1E1E1E'), '代码卡主题样式在')
})

test('inlineMermaid: 渲染成功替换为内嵌 PNG', async () => {
  const { html } = renderMarkdown(MERMAID_MD, 'moyu', { header: false })
  const out = await inlineMermaid(html, {
    renderPng: async (code) => {
      assert.equal(code, 'graph LR\n  A --> B')
      return Buffer.from('fake-png-bytes')
    },
  })
  assert.ok(out.includes('data:image/png;base64,'), '替换为 data URI 图片')
  assert.ok(!out.includes('data-md2html-mermaid'), '标记不残留')
  assert.ok(!out.includes('graph LR'), '代码卡被替换')
})

test('inlineMermaid: 渲染失败保留代码卡兜底', async () => {
  const { html } = renderMarkdown(MERMAID_MD, 'moyu', { header: false })
  const out = await inlineMermaid(html, {
    renderPng: async () => {
      throw new Error('boom')
    },
  })
  assert.ok(out.includes('data-md2html-mermaid'), '标记保留（仍是兜底形态）')
  assert.ok(out.includes('graph LR'), '源码可见')
})

test('inlineMermaid: 多图与正文不受影响', async () => {
  const md = '# T\n\n前置正文\n\n```mermaid\ngraph TD\n  A --> B\n```\n\n中段\n\n```mermaid\ngraph LR\n  C --> D\n```\n\n结尾'
  const { html } = renderMarkdown(md, 'moyu', { header: false })
  const out = await inlineMermaid(html, {
    renderPng: async (code) => Buffer.from(`png-${code.includes('A --> B') ? '1' : '2'}`),
  })
  assert.equal((out.match(/data:image\/png;base64,/g) || []).length, 2, '两图都被替换')
  assert.ok(out.includes('前置正文') && out.includes('中段') && out.includes('结尾'), '正文完整')
  assert.ok(!out.includes('data-md2html-mermaid'), '标记清空')
})
