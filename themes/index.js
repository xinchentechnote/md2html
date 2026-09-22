import moyu from './moyu.js'

const REQUIRED_VARS = {
  colors: ['accent', 'accentLight', 'heading', 'text', 'muted', 'highlight', 'cardBg', 'border', 'codeBg', 'codeText'],
  font: ['base', 'title', 'h2', 'code', 'family', 'mono'],
  radius: ['card', 'tag'],
  spacing: ['paragraph', 'block'],
}

const themes = new Map()

/** 注册即校验：主题是纯数据，键名写错只能靠运行时拦截 */
export function registerTheme(theme) {
  if (!theme?.id || !theme?.name) throw new Error(`主题缺少 id 或 name: ${JSON.stringify(theme?.id)}`)
  const missing = []
  for (const [group, keys] of Object.entries(REQUIRED_VARS)) {
    for (const key of keys) {
      if (theme.vars?.[group]?.[key] === undefined) missing.push(`vars.${group}.${key}`)
    }
  }
  if (missing.length) {
    throw new Error(`主题 "${theme.id}" 缺少变量: ${missing.join(', ')}`)
  }
  themes.set(theme.id, theme)
}

export function getTheme(id) {
  if (!themes.has(id)) throw new Error(`未知主题 "${id}"，可用主题: ${[...themes.keys()].join(', ')}`)
  return themes.get(id)
}

export function listThemes() {
  return [...themes.values()].map(({ id, name, description }) => ({ id, name, description }))
}

registerTheme(moyu)
