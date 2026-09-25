import { parseMarkdown, nodeText } from './parse.js'
import { transform } from './transform.js'
import { render } from './render.js'
import { extractFrontmatter } from './frontmatter.js'
import { getTheme, listThemes } from '../themes/index.js'

export const DEFAULT_THEME = 'deepblue'

/**
 * 唯一入口（纯函数）：md 字符串 → { html, theme, meta }。
 * 元数据优先级：调用参数 options > frontmatter > 默认值。
 * 头卡/页脚默认不含（公众号标题走后台标题栏）：header / footer 显式开启。
 * CLI 与浏览器 UI 共用，不碰文件系统。
 */
export function renderMarkdown(md, themeId, options = {}) {
  const { meta: fm, body } = extractFrontmatter(md)
  const theme = getTheme(themeId || fm.theme || DEFAULT_THEME)
  const resolved = {
    title: options.title ?? fm.title,
    date: options.date ?? fm.date,
    // 头卡默认渲染，仅复制/publish 时剥离；页脚默认不追加，--footer / frontmatter footer:true 开启
    header: options.header ?? fm.header ?? true,
    footer: options.footer ?? fm.footer ?? false,
  }
  const tree = transform(parseMarkdown(body), resolved)
  const html = render(tree, theme)
  const header = tree.children.find((n) => n.type === 'headerCard')
  const h1 = tree.children.find((n) => n.type === 'heading' && n.depth === 1)
  return {
    html,
    theme: { id: theme.id, name: theme.name },
    meta: {
      // 显式 title/frontmatter 优先，h1 仅兜底（header 开启时头卡已按此规则定题）
      title: header?.title ?? resolved.title ?? (h1 ? nodeText(h1) : undefined),
      date: header?.date ?? (resolved.date || undefined),
      author: fm.author,
      digest: fm.digest,
      cover: fm.cover,
    },
  }
}

export { listThemes }
