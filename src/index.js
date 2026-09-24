import { parseMarkdown } from './parse.js'
import { transform } from './transform.js'
import { render } from './render.js'
import { extractFrontmatter } from './frontmatter.js'
import { getTheme, listThemes } from '../themes/index.js'

export const DEFAULT_THEME = 'deepblue'

/**
 * 唯一入口（纯函数）：md 字符串 → { html, theme, meta }。
 * 元数据优先级：调用参数 options > frontmatter > 默认值。
 * CLI 与浏览器 UI 共用，不碰文件系统。
 */
export function renderMarkdown(md, themeId, options = {}) {
  const { meta: fm, body } = extractFrontmatter(md)
  const theme = getTheme(themeId || fm.theme || DEFAULT_THEME)
  const resolved = {
    title: options.title ?? fm.title,
    date: options.date ?? fm.date,
    footer: options.footer ?? (fm.footer === undefined ? true : fm.footer !== false),
  }
  const tree = transform(parseMarkdown(body), resolved)
  const html = render(tree, theme)
  const header = tree.children.find((n) => n.type === 'headerCard')
  return {
    html,
    theme: { id: theme.id, name: theme.name },
    meta: {
      title: header?.title,
      date: header?.date,
      author: fm.author,
      digest: fm.digest,
      cover: fm.cover,
    },
  }
}

export { listThemes }
