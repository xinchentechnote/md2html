// 浏览器端编辑器逻辑：由 ui-server 用 esbuild 打包成 IIFE 注入页面。
// core（renderMarkdown）是纯函数，在浏览器直接运行，无任何接口。
import { renderMarkdown, listThemes } from '../index.js'

const state = {
  theme: localStorage.getItem('md2html-theme') || 'moyu',
  mermaid: 'auto',
  file: null,
}

const mermaidCache = new Map()
let renderSeq = 0

const $ = (id) => document.getElementById(id)

function init() {
  const select = $('theme')
  for (const t of listThemes()) {
    const opt = document.createElement('option')
    opt.value = t.id
    opt.textContent = t.name
    select.appendChild(opt)
  }
  select.value = state.theme
  select.addEventListener('change', () => {
    state.theme = select.value
    localStorage.setItem('md2html-theme', state.theme)
    render()
  })

  fetch('/api/state')
    .then((r) => r.json())
    .then(({ file, content, theme, mermaid }) => {
      state.file = file
      state.mermaid = mermaid || 'auto'
      if (theme && !localStorage.getItem('md2html-theme')) {
        state.theme = theme
        select.value = theme
      }
      $('editor').value = content || ''
      $('filename').textContent = file ? file.split('/').pop() : '未命名（用 md2html ui 文件.md 打开可编辑保存）'
      if (!file) $('save').disabled = true
      updateCount()
      render()
    })
    .catch(() => {
      $('filename').textContent = '加载失败'
    })

  let timer = null
  $('editor').addEventListener('input', () => {
    markDirty()
    updateCount()
    clearTimeout(timer)
    timer = setTimeout(render, 300)
  })

  // Tab 缩进（textarea 默认会跳出焦点）
  $('editor').addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return
    e.preventDefault()
    const el = e.target
    const { selectionStart: a, selectionEnd: b, value } = el
    el.value = value.slice(0, a) + '  ' + value.slice(b)
    el.selectionStart = el.selectionEnd = a + 2
    markDirty()
    render()
  })

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      save()
    }
  })

  $('save').addEventListener('click', save)
  $('copy').addEventListener('click', copyArticle)
}

function render() {
  const seq = ++renderSeq
  try {
    const { html } = renderMarkdown($('editor').value, state.theme, {})
    $('preview').innerHTML = html
    $('error').style.display = 'none'
    hydrateMermaid(seq)
  } catch (err) {
    $('error').textContent = `渲染出错: ${err.message}`
    $('error').style.display = 'block'
  }
}

/** 把预览里的 mermaid 兜底形态（代码卡+标记）异步换成服务端渲染的图片，与 CLI 产出一致 */
async function hydrateMermaid(seq) {
  if (state.mermaid === 'off') return
  const holders = [...document.querySelectorAll('#preview [data-md2html-mermaid]')]
  for (const el of holders) {
    const b64 = el.getAttribute('data-md2html-mermaid')
    const res = await fetchMermaidPng(b64ToUtf8(b64))
    if (seq !== renderSeq) return // 已被更新的渲染取代，丢弃过期结果
    if (res.png) {
      const card = document.createElement('section')
      card.style.cssText = 'background:#FFFFFF;border-radius:12px;padding:12px 8px;margin:16px 0'
      const img = new Image()
      img.src = `data:image/png;base64,${res.png}`
      img.alt = 'mermaid 图表'
      img.style.cssText = 'max-width:100%;display:block;margin:0 auto'
      card.appendChild(img)
      el.replaceWith(card)
    }
    // res.error：保留代码卡兜底
  }
}

function fetchMermaidPng(code) {
  const key = `${state.theme}::${code}`
  if (!mermaidCache.has(key)) {
    const entry = fetch('/api/mermaid', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, theme: state.theme }),
    })
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
        return { png: j.png }
      })
      .catch((err) => ({ error: err.message }))
    mermaidCache.set(key, entry)
  }
  return mermaidCache.get(key)
}

function b64ToUtf8(b64) {
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function markDirty() {
  $('status').textContent = '● 未保存'
}

async function save() {
  if (!state.file) return
  try {
    await fetch('/api/file', { method: 'PUT', body: $('editor').value })
    $('status').textContent = `✓ 已保存 ${new Date().toLocaleTimeString()}`
  } catch (err) {
    $('status').textContent = `保存失败: ${err.message}`
  }
}

function copyArticle() {
  const range = document.createRange()
  range.selectNodeContents($('preview'))
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
  document.execCommand('copy')
  sel.removeAllRanges()
  const btn = $('copy')
  btn.textContent = '已复制 ✓'
  setTimeout(() => (btn.textContent = '复制到公众号'), 2000)
}

function updateCount() {
  $('count').textContent = `${$('editor').value.length} 字`
}

init()
