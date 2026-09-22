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
