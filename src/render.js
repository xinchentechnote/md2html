import { createLowlight, common } from 'lowlight'
import { esc, s } from './utils.js'
import { nodeText } from './parse.js'

const lowlight = createLowlight(common)

/**
 * mdast → 全内联样式 HTML。
 * 结构约定见 docs/DESIGN.md 第 6 节：块级一律 <section>，代码逐行 <span>，
 * 布局用内联 flex，无 class/id/<style>——公众号粘贴白名单友好。
 */
export function render(tree, theme) {
  const ctx = deriveCtx({ vars: theme.vars, theme }, {})
  return blockNode(tree, ctx)
}

function deriveCtx(base, patch) {
  const ctx = { ...base, ...patch }
  ctx.blocks = (nodes) => nodes.map((n) => blockNode(n, ctx)).join('')
  ctx.inline = (nodes) => nodes.map((n) => inlineNode(n, ctx)).join('')
  return ctx
}

function blockNode(node, ctx) {
  const override = ctx.theme.components?.[node.type]
  if (override) return override(node, ctx)
  const fn = BLOCK[node.type]
  return fn ? fn(node, ctx) : ''
}

const BLOCK = {
  root: (node, ctx) => {
    const { font: f, colors: c } = ctx.vars
    return `<section style="${s({ fontFamily: f.family, fontSize: f.base, color: c.text, lineHeight: '1.75', padding: '0', margin: '0' })}">${ctx.blocks(node.children)}</section>`
  },

  headerCard: ({ title, date }, ctx) => {
    const { colors: c, font: f, radius: r } = ctx.vars
    return `<section style="${s({ background: `linear-gradient(135deg, ${c.accentLight}, #FFFFFF)`, borderRadius: r.card, padding: '28px 20px 24px', textAlign: 'center', marginBottom: '28px' })}">` +
      `<section style="${s({ fontSize: '12px', letterSpacing: '2px', color: c.muted })}">${esc(date)}</section>` +
      `<section style="${s({ fontSize: f.title, fontWeight: '700', color: c.heading, margin: '12px 0 14px', lineHeight: '1.4' })}">${esc(title)}</section>` +
      `<section style="${s({ width: '36px', height: '4px', background: c.accent, borderRadius: '2px', margin: '0 auto' })}"></section>` +
      `</section>`
  },

  heading: (node, ctx) => {
    const { colors: c, font: f } = ctx.vars
    if (node.depth === 2) {
      const { no, label } = node.meta
      const labelHtml = label
        ? `<span style="${s({ fontSize: '12px', letterSpacing: '2px', color: c.muted, textTransform: 'uppercase' })}">${esc(label)}</span>`
        : ''
      return `<section style="${s({ margin: '32px 0 16px' })}">` +
        `<section style="${s({ display: 'flex', alignItems: 'baseline', gap: '8px' })}"><span style="${s({ fontSize: '30px', fontWeight: '800', color: c.accent, lineHeight: '1' })}">${no}</span>${labelHtml}</section>` +
        `<section style="${s({ fontSize: f.h2, fontWeight: '700', color: c.heading, marginTop: '4px' })}">${ctx.inline(node.children)}</section>` +
        `</section>`
    }
    if (node.depth === 3) {
      return `<section style="${s({ display: 'flex', alignItems: 'center', gap: '8px', margin: '24px 0 12px' })}">` +
        `<span style="${s({ width: '4px', height: '16px', background: c.accent, borderRadius: '2px', flexShrink: 0 })}"></span>` +
        `<span style="${s({ fontSize: '16px', fontWeight: '700', color: c.heading })}">${ctx.inline(node.children)}</span>` +
        `</section>`
    }
    return `<section style="${s({ fontSize: '15px', fontWeight: '700', color: c.accent, margin: '18px 0 8px' })}">${ctx.inline(node.children)}</section>`
  },

  paragraph: (node, ctx) => {
    const { colors: c, font: f, spacing: sp } = ctx.vars
    if (ctx.inQuote) {
      return `<p style="${s({ fontSize: f.base, fontWeight: '600', color: c.heading, lineHeight: '1.9', margin: '0', textAlign: 'center' })}">${ctx.inline(node.children)}</p>`
    }
    return `<p style="${s({ fontSize: f.base, color: ctx.taskDone ? c.muted : c.text, lineHeight: '1.75', margin: ctx.tight ? '0' : `0 0 ${sp.paragraph}`, textAlign: 'justify', overflowWrap: 'break-word' })}">${ctx.inline(node.children)}</p>`
  },

  blockquote: (node, ctx) => {
    const { colors: c, radius: r } = ctx.vars
    const quoteCtx = deriveCtx(ctx, { inQuote: true })
    return `<section style="${s({ border: `1.5px dashed ${c.accent}`, borderRadius: r.card, padding: '18px 22px', margin: '20px 0' })}">${node.children.map((n) => blockNode(n, quoteCtx)).join('')}</section>`
  },

  code: (node, ctx) => {
    const { colors: c, font: f, radius: r } = ctx.vars
    const lang = (node.lang || '').split(/\s+/)[0]
    const tree = lang && lowlight.registered(lang)
      ? lowlight.highlight(lang, node.value)
      : { type: 'root', children: [{ type: 'text', value: node.value }] }
    return `<section style="${s({ background: c.codeBg, borderRadius: r.card, padding: '16px', margin: '16px 0', fontFamily: f.mono, fontSize: f.code, lineHeight: '1.7', overflowX: 'auto' })}">${codeLines(tree, ctx.vars)}</section>`
  },

  list: (node, ctx) => {
    const isTask = node.children.some((it) => it.checked === true || it.checked === false)
    if (isTask) return taskList(node, ctx)
    return node.ordered ? orderedList(node, ctx) : unorderedList(node, ctx)
  },

  table: (node, ctx) => {
    const { colors: c, border } = ctx.vars
    const align = node.align || []
    const [head, ...body] = node.children
    const labels = head ? head.children.map((cell) => nodeText(cell)) : []
    // 公众号正文不支持横向滚动：列数多或表头过长时降级为逐行卡片
    if (labels.length >= 4 || labels.join('').length >= 14) return wideTableCards(labels, body, ctx)
    const cell = (cellNode, index, header) =>
      `<t${header ? 'h' : 'd'} style="${s({ padding: '8px 12px', border: `1px solid ${border ?? c.border}`, textAlign: align[index] || 'left', fontSize: '14px', color: header ? c.accent : c.text, fontWeight: header ? '700' : '400', background: header ? c.accentLight : 'transparent', overflowWrap: 'break-word' })}">${ctx.inline(cellNode.children)}</t${header ? 'h' : 'd'}>`
    const headRow = head ? `<thead><tr>${head.children.map((cellNode, i) => cell(cellNode, i, true)).join('')}</tr></thead>` : ''
    const bodyRows = body
      .map((row) => `<tr>${row.children.map((cellNode, i) => cell(cellNode, i, false)).join('')}</tr>`)
      .join('')
    return `<section style="${s({ margin: '16px 0', overflowX: 'auto' })}"><table style="${s({ width: '100%', borderCollapse: 'collapse' })}">${headRow}<tbody>${bodyRows}</tbody></table></section>`
  },

  thematicBreak: (_node, ctx) => {
    const { colors: c } = ctx.vars
    return `<section style="${s({ textAlign: 'center', margin: '24px 0' })}"><span style="${s({ display: 'inline-block', width: '40px', height: '4px', background: c.accent, borderRadius: '2px' })}"></span></section>`
  },

  imageCard: ({ image }, ctx) => {
    const { colors: c } = ctx.vars
    const caption = image.alt
      ? `<section style="${s({ fontSize: '12px', color: c.muted, marginTop: '6px', textAlign: 'center' })}">— ${esc(image.alt)} —</section>`
      : ''
    return `<section style="${s({ margin: '16px 0' })}"><img src="${esc(image.url)}" alt="${esc(image.alt || '')}" style="${s({ width: '100%', borderRadius: '8px', display: 'block' })}">${caption}</section>`
  },

  gallery: ({ images }, ctx) => {
    const rows = []
    for (let i = 0; i < images.length; i += 2) rows.push(images.slice(i, i + 2))
    return `<section style="${s({ margin: '16px 0' })}">${rows
      .map(
        (row) =>
          `<section style="${s({ display: 'flex', gap: '6px', marginBottom: '6px' })}">${row
            .map(
              (img) =>
                `<img src="${esc(img.url)}" alt="${esc(img.alt || '')}" style="${s({ flex: '1', width: '0', minWidth: '0', height: 'auto', borderRadius: '8px', display: 'block' })}">`,
            )
            .join('')}</section>`,
      )
      .join('')}</section>`
  },

  footerCard: (_node, ctx) => {
    const { colors: c } = ctx.vars
    const cards = [
      ['👍', '点赞'],
      ['👀', '在看'],
      ['🔁', '转发'],
    ]
      .map(
        ([emoji, label]) =>
          `<section style="${s({ flex: '1', background: c.cardBg, borderRadius: '8px', padding: '12px 0' })}">` +
          `<section style="${s({ fontSize: '20px', lineHeight: '1' })}">${emoji}</section>` +
          `<section style="${s({ fontSize: '12px', color: c.muted, marginTop: '6px' })}">${label}</section>` +
          `</section>`,
      )
      .join('')
    return `<section style="${s({ margin: '36px 0 8px', textAlign: 'center' })}">` +
      `<section style="${s({ fontSize: '14px', color: c.muted, marginBottom: '12px' })}">— 有收获的话，「三连」支持一下，下期再见 —</section>` +
      `<section style="${s({ display: 'flex', gap: '10px' })}">${cards}</section>` +
      `</section>`
  },

  // md 里的原生 HTML 片段直接丢弃，避免把未内联的标签带进公众号
  html: () => '',
}

function orderedList(node, ctx) {
  const { colors: c, font: f } = ctx.vars
  const start = node.start || 1
  const items = node.children
    .map((item, i) =>
      `<section style="${s({ display: 'flex', gap: '10px', alignItems: 'flex-start', background: c.cardBg, borderRadius: '8px', padding: '12px 14px', marginBottom: '8px' })}">` +
      `<span style="${s({ flexShrink: 0, width: '20px', height: '20px', lineHeight: '20px', borderRadius: '50%', background: c.accent, color: '#FFFFFF', fontSize: '12px', fontWeight: '700', textAlign: 'center' })}">${start + i}</span>` +
      `<section style="${s({ flex: 1, minWidth: 0, fontSize: f.base, color: c.text, lineHeight: '1.7' })}">${listBody(item, ctx)}</section>` +
      `</section>`,
    )
    .join('')
  return `<section style="${s({ margin: '12px 0 4px', marginLeft: ctx.listDepth ? '1.5em' : '' })}">${items}</section>`
}

function unorderedList(node, ctx) {
  const { colors: c, font: f } = ctx.vars
  const items = node.children
    .map(
      (item) =>
        `<section style="${s({ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '6px' })}">` +
        `<span style="${s({ flexShrink: 0, width: '6px', height: '6px', borderRadius: '50%', background: c.accent, marginTop: '9px' })}"></span>` +
        `<section style="${s({ flex: 1, minWidth: 0, fontSize: f.base, color: c.text, lineHeight: '1.7' })}">${listBody(item, ctx)}</section>` +
        `</section>`,
    )
    .join('')
  return `<section style="${s({ margin: '10px 0 4px', marginLeft: ctx.listDepth ? '1.5em' : '' })}">${items}</section>`
}

function taskList(node, ctx) {
  const { colors: c, font: f } = ctx.vars
  const items = node.children
    .map((item) => {
      const checked = item.checked === true
      return `<section style="${s({ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '6px' })}">` +
        `<span style="${s({ flexShrink: 0, color: checked ? c.accent : c.muted, fontSize: f.base, lineHeight: '1.7' })}">${checked ? '☑' : '☐'}</span>` +
        `<section style="${s({ flex: 1, minWidth: 0, fontSize: f.base, color: checked ? c.muted : c.text, lineHeight: '1.7', textDecoration: checked ? 'line-through' : 'none' })}">${item.children.map((n) => blockNode(n, deriveCtx(ctx, { tight: true, taskDone: checked }))).join('')}</section>` +
        `</section>`
    })
    .join('')
  return `<section style="${s({ margin: '10px 0 4px', marginLeft: ctx.listDepth ? '1.5em' : '' })}">${items}</section>`
}

function listBody(item, ctx) {
  return item.children
    .map((n) => blockNode(n, deriveCtx(ctx, { tight: true, listDepth: (ctx.listDepth || 0) + 1 })))
    .join('')
}

/** 宽表降级：每行一张卡，表头作为字段标签（公众号不支持横向滚动） */
function wideTableCards(labels, rows, ctx) {
  const { colors: c } = ctx.vars
  const cards = rows
    .map((row) => {
      const fields = row.children
        .map((cellNode, i) =>
          `<section style="${s({ display: 'flex', gap: '8px', fontSize: '14px', lineHeight: '1.6', marginBottom: i === row.children.length - 1 ? '0' : '4px' })}">` +
          `<span style="${s({ flexShrink: 0, minWidth: '4em', fontSize: '12px', fontWeight: '700', color: c.accent, paddingTop: '2px' })}">${esc(labels[i] || '')}</span>` +
          `<section style="${s({ flex: '1', minWidth: '0', color: c.text, overflowWrap: 'break-word' })}">${ctx.inline(cellNode.children)}</section>` +
          `</section>`)
        .join('')
      return `<section style="${s({ background: c.cardBg, borderRadius: '8px', padding: '10px 14px', marginBottom: '8px' })}">${fields}</section>`
    })
    .join('')
  return `<section style="${s({ margin: '16px 0' })}">${cards}</section>`
}

/** 语法高亮 → 逐行 span；跨行 token 通过颜色栈携带，保证行结构在公众号不丢 */
function codeLines(root, vars) {
  const { colors: c } = vars
  const lines = [[]]
  const walk = (node, color) => {
    if (node.type === 'text') {
      const parts = node.value.split('\n')
      parts.forEach((part, i) => {
        if (i > 0) lines.push([])
        if (part) lines[lines.length - 1].push({ text: part, color })
      })
    } else if (node.children) {
      const next = tokenColor(node, vars) || color
      for (const child of node.children) walk(child, next)
    }
  }
  walk(root, null)
  return lines
    .map((segs) => {
      const inner = segs.length
        ? segs
            .map(({ text, color }) => (color ? `<span style="color:${color}">${esc(text)}</span>` : esc(text)))
            .join('')
        : '&nbsp;'
      return `<span style="${s({ display: 'block', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: c.codeText })}">${inner}</span>`
    })
    .join('')
}

function tokenColor(node, vars) {
  const cls = (node.properties?.className || []).find((k) => typeof k === 'string' && k.startsWith('hljs-'))
  return cls ? vars.codeTokens?.[cls.slice(5)] || null : null
}

const INLINE = {
  text: (node) => esc(node.value),
  strong: (node, ctx) => {
    const { colors: c } = ctx.vars
    const style = ctx.inQuote
      ? { fontWeight: '700', color: c.heading, background: `linear-gradient(180deg, transparent 62%, ${c.highlight} 62%)` }
      : { fontWeight: '700', color: c.accent }
    return `<span style="${s(style)}">${ctx.inline(node.children)}</span>`
  },
  emphasis: (node, ctx) => `<em style="font-style:italic">${ctx.inline(node.children)}</em>`,
  inlineCode: (node, ctx) => {
    const { colors: c, font: f, radius: r } = ctx.vars
    return `<code style="${s({ background: c.accentLight, color: c.accent, padding: '2px 6px', borderRadius: r.tag, fontSize: f.code, fontFamily: f.mono })}">${esc(node.value)}</code>`
  },
  // 公众号对多数个人号剥 <a>：降级为主题色文字，样式不丢
  link: (node, ctx) => {
    const { colors: c } = ctx.vars
    return `<span style="${s({ color: c.accent, textDecoration: 'underline' })}">${ctx.inline(node.children)}</span>`
  },
  image: (node) =>
    `<img src="${esc(node.url)}" alt="${esc(node.alt || '')}" style="max-width:100%;border-radius:4px;vertical-align:middle">`,
  delete: (node, ctx) => {
    const { colors: c } = ctx.vars
    return `<span style="${s({ textDecoration: 'line-through', color: c.muted })}">${ctx.inline(node.children)}</span>`
  },
  break: () => '<br>',
  html: () => '',
}

function inlineNode(node, ctx) {
  const fn = INLINE[node.type]
  if (fn) return fn(node, ctx)
  return node.children ? ctx.inline(node.children) : ''
}
