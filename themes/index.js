import { DEFAULT_VARS } from './base.js'
import moyu from './moyu.js'
import redwhite from './redwhite.js'
import deepblue from './deepblue.js'
import orange from './orange.js'
import grape from './grape.js'
import peach from './peach.js'

const REQUIRED_VARS = {
  colors: ['accent', 'accentLight', 'heading', 'text', 'muted', 'highlight', 'cardBg', 'border', 'codeBg', 'codeText'],
}

const themes = new Map()

/** 注册即合并默认变量并校验：主题是纯数据，键名写错只能靠运行时拦截 */
export function registerTheme(theme) {
  if (!theme?.id || !theme?.name) throw new Error(`主题缺少 id 或 name: ${JSON.stringify(theme?.id)}`)
  const vars = { ...DEFAULT_VARS, ...theme.vars }
  for (const group of Object.keys(DEFAULT_VARS)) {
    if (theme.vars?.[group] && typeof theme.vars[group] === 'object') {
      vars[group] = { ...DEFAULT_VARS[group], ...theme.vars[group] }
    }
  }
  const missing = []
  for (const [group, keys] of Object.entries(REQUIRED_VARS)) {
    for (const key of keys) {
      if (vars[group]?.[key] === undefined) missing.push(`vars.${group}.${key}`)
    }
  }
  if (missing.length) throw new Error(`主题 "${theme.id}" 缺少变量: ${missing.join(', ')}`)
  themes.set(theme.id, { ...theme, vars })
}

export function getTheme(id) {
  if (!themes.has(id)) throw new Error(`未知主题 "${id}"，可用主题: ${[...themes.keys()].join(', ')}`)
  return themes.get(id)
}

export function listThemes() {
  return [...themes.values()].map(({ id, name, description }) => ({ id, name, description }))
}

registerTheme(moyu)
registerTheme(redwhite)
registerTheme(deepblue)
registerTheme(orange)
registerTheme(grape)
registerTheme(peach)
