import { nodeText } from './parse.js'
import { formatDate } from './utils.js'

/**
 * AST 结构性预处理，产出增强节点（自定义 type）：
 *   headerCard  文首标题卡（由首个 h1 摘出，无 h1 时用 title 兜底）
 *   gallery     连续 ≥2 张顶层图片合并的图集
 *   imageCard   单张顶层图片
 *   footerCard  文末三连页脚
 * 以及 h2 节点上的 meta = { no: '01', label: 'WHY'|null }
 * 编号/图集必须在 AST 层做：公众号剥离 class 后 CSS 计数器与 grid 全部失效。
 */
export function transform(tree, options = {}) {
  const children = [...tree.children]

  // 1. 首个 h1 → 标题卡；显式 title（参数/frontmatter）优先于 h1 文本
  const h1Index = children.findIndex((n) => n.type === 'heading' && n.depth === 1)
  let title = options.title
  if (h1Index >= 0) {
    title = title ?? nodeText(children[h1Index])
    children.splice(h1Index, 1)
  }
  const headerCard = { type: 'headerCard', title: title || '无标题', date: options.date || formatDate() }

  // 2. h2 自动编号；首个词为纯 ASCII 时拆为英文小标签
  let counter = 0
  for (const node of children) {
    if (node.type !== 'heading' || node.depth !== 2) continue
    counter++
    const meta = { no: String(counter).padStart(2, '0'), label: null }
    const first = node.children[0]
    if (first && first.type === 'text') {
      const m = first.value.match(/^([A-Za-z][A-Za-z0-9+#./-]*)\s+(.+)$/s)
      if (m) {
        meta.label = m[1]
        first.value = m[2]
      }
    }
    node.meta = meta
  }

  // 3. 纯图片段落 → 图集/图卡。空行是分组边界：只有同一段落内连续书写的
  //    多张图片合并为 gallery；单个图片段落（含跨空行的）独立为 imageCard
  const grouped = []
  for (const node of children) {
    const images =
      node.type === 'paragraph' &&
      node.children.some((c) => c.type === 'image') &&
      node.children.every((c) => c.type === 'image' || (c.type === 'text' && !c.value.trim()))
        ? node.children.filter((c) => c.type === 'image')
        : null
    if (!images) {
      grouped.push(node)
    } else if (images.length >= 2) {
      grouped.push({ type: 'gallery', images })
    } else {
      grouped.push({ type: 'imageCard', image: images[0] })
    }
  }

  // 4. 页脚
  if (options.footer !== false) grouped.push({ type: 'footerCard' })

  return { ...tree, children: [headerCard, ...grouped] }
}
