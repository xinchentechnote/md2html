// 浏览器端编辑器逻辑：由 ui-server 用 esbuild 打包成 IIFE 注入页面。
// core（renderMarkdown）是纯函数，在浏览器直接运行，无任何接口。
import { renderMarkdown, listThemes } from '../index.js'

const state = {
  theme: localStorage.getItem('md2html-theme') || 'moyu',
  file: null,
}

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
    .then(({ file, content, theme }) => {
      state.file = file
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
  try {
    const { html } = renderMarkdown($('editor').value, state.theme, {})
    $('preview').innerHTML = html
    $('error').style.display = 'none'
  } catch (err) {
    $('error').textContent = `渲染出错: ${err.message}`
    $('error').style.display = 'block'
  }
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
