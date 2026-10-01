import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeFile, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { startEditorServer } from '../src/ui-server.js'

test('ui server: 页面 / 初始状态 / 保存闭环', async () => {
  const tmp = path.join(os.tmpdir(), `md2html-ui-${Date.now()}.md`)
  await writeFile(tmp, '# 你好\n\n正文', 'utf8')
  const { server, url } = await startEditorServer({ file: tmp })
  try {
    const page = await (await fetch(url)).text()
    assert.ok(page.includes('md2html') && page.includes('/editor.js'))

    const state = await (await fetch(`${url}/api/state`)).json()
    assert.equal(state.file, tmp)
    assert.equal(state.content, '# 你好\n\n正文')

    const put = await fetch(`${url}/api/file`, { method: 'PUT', body: '# 改动\n' })
    assert.equal(put.status, 200)
    assert.equal(await readFile(tmp, 'utf8'), '# 改动\n')

    const js = await (await fetch(`${url}/editor.js`)).text()
    assert.ok(js.length > 5000, '编辑器 bundle 应已打包（含 core）')

    const notFound = await fetch(`${url}/nope`)
    assert.equal(notFound.status, 404)
  } finally {
    server.close()
    await rm(tmp, { force: true })
  }
})

test('ui server: 未指定文件时禁止写入', async () => {
  const { server, url } = await startEditorServer({})
  try {
    const put = await fetch(`${url}/api/file`, { method: 'PUT', body: 'x' })
    assert.equal(put.status, 400)
    const state = await (await fetch(`${url}/api/state`)).json()
    assert.ok(!state.file, '未指定文件时 state.file 应为空')
  } finally {
    server.close()
  }
})

test('ui server: /api/mermaid 渲染端点（成功/语法错/空代码）', async () => {
  const { server, url } = await startEditorServer({
    mermaidRenderer: async (code) => {
      if (code.includes('BAD')) throw new Error('diagram syntax error')
      return Buffer.from('fake-png:' + code.length)
    },
  })
  try {
    const ok = await fetch(`${url}/api/mermaid`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'graph TD\nA-->B', theme: 'moyu' }),
    })
    assert.equal(ok.status, 200)
    const j = await ok.json()
    assert.equal(j.png, Buffer.from('fake-png:14').toString('base64'))

    const bad = await fetch(`${url}/api/mermaid`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'BAD diagram' }),
    })
    assert.equal(bad.status, 422)
    assert.ok((await bad.json()).error.includes('syntax'))

    const empty = await fetch(`${url}/api/mermaid`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: '   ' }),
    })
    assert.equal(empty.status, 400)
  } finally {
    server.close()
  }
})
