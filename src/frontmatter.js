/**
 * 极简 frontmatter 提取（key: value 字符串/布尔值子集，够用即可，不引 YAML 依赖）。
 * 返回 { meta, body }，meta 键统一小写。
 */
export function extractFrontmatter(md) {
  const m = md.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return { meta: {}, body: md }
  const meta = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/)
    if (!kv) continue
    let value = kv[2].trim().replace(/^['"]|['"]$/g, '')
    if (value === 'true') value = true
    else if (value === 'false') value = false
    meta[kv[1].toLowerCase()] = value
  }
  return { meta, body: md.slice(m[0].length) }
}
