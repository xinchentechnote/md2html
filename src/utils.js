const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** HTML 文本转义（属性与文本节点通用） */
export function esc(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ESCAPES[ch])
}

/** 样式对象 → 内联 style 字符串，忽略空值； camelCase 键自动转 kebab-case */
export function s(style) {
  const parts = []
  for (const [key, value] of Object.entries(style || {})) {
    if (value === undefined || value === null || value === false || value === '') continue
    const prop = key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
    parts.push(`${prop}:${value}`)
  }
  return parts.join(';')
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** 格式化为公众号头卡日期：22 SEP 2026 */
export function formatDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/**
 * 剥离带 data-md2html-block 标记的整块（header/footer），用于「复制到公众号」与 publish 草稿。
 * 按嵌套深度扫描配对的 </section>，不依赖正则贪婪匹配。
 */
export function stripDecorations(html, blocks = ['header', 'footer']) {
  let out = html
  for (const block of blocks) {
    const start = out.indexOf(`<section data-md2html-block="${block}"`)
    const end = findSectionEnd(out, start)
    if (end === -1) continue
    out = out.slice(0, start) + out.slice(end)
  }
  return out
}

/** 找到 start 位置起始的 <section ...> 的配对闭合标签结束下标（按嵌套深度扫描） */
export function findSectionEnd(html, start) {
  if (start === -1) return -1
  let i = html.indexOf('>', start) + 1
  let depth = 1
  while (i < html.length) {
    const open = html.indexOf('<section', i)
    const close = html.indexOf('</section>', i)
    if (close === -1) return -1
    if (open !== -1 && open < close) {
      depth++
      i = open + '<section'.length
      continue
    }
    depth--
    if (depth === 0) return close + '</section>'.length
    i = close + '</section>'.length
  }
  return -1
}
