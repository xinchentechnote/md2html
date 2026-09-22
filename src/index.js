import { parseMarkdown } from './parse.js'
import { transform } from './transform.js'
import { render } from './render.js'
import { getTheme, listThemes } from '../themes/index.js'

/**
 * 唯一入口（纯函数）：md 字符串 → { html, theme, meta }。
 * CLI 与未来的浏览器 UI 共用，不碰文件系统。
 */
export function renderMarkdown(md, themeId = 'moyu', options = {}) {
  const theme = getTheme(themeId)
  const tree = transform(parseMarkdown(md), options)
  const html = render(tree, theme)
  const header = tree.children.find((n) => n.type === 'headerCard')
  return {
    html,
    theme: { id: theme.id, name: theme.name },
    meta: { title: header?.title, date: header?.date },
  }
}

export { listThemes }
