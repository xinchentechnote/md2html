import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { renderMarkdown } from './index.js'
import { parseMarkdown, nodeText } from './parse.js'
import { extractFrontmatter } from './frontmatter.js'
import { loadWechatConfig } from './config.js'
import { createWechatClient } from './wechat.js'
import { esc, stripDecorations } from './utils.js'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024

/**
 * 发布到公众号草稿箱（不群发）。
 * 流程：渲染 → 正文图片转存微信 → 封面上传素材 → draft/add。
 * deps 可注入配置与客户端（测试用）。
 */
export async function publish(file, options = {}, deps = {}) {
  const loadConfig = deps.loadConfig ?? loadWechatConfig
  const createClient = deps.createClient ?? createWechatClient

  const mdPath = path.resolve(file)
  const md = await readFile(mdPath, 'utf8')
  const dir = path.dirname(mdPath)

  const { html, meta } = renderMarkdown(md, options.theme, { footer: options.footer })
  // 发往微信的正文剥离头卡（标题走草稿标题字段）；页脚默认不渲染，开启时视为内容保留
  let content = stripDecorations(html, ['header'])
  const title = options.title || meta.title || path.basename(mdPath).replace(/\.md$/i, '')
  const author = options.author || meta.author || ''
  const digest = options.digest || meta.digest || firstParagraphText(md).slice(0, 120)

  const config = await loadConfig()
  const wx = createClient(config)
  const report = { configSource: config.source, title, digest, images: 0, skipped: [] }

  // 1) 正文图片转存（外链/本地/data URI → uploadimg → 替换为微信 URL）
  let firstAsset = null
  for (const rawSrc of uniqueImageSources(html)) {
    const src = unescapeHtml(rawSrc)
    if (src.startsWith('https://mmbiz.qpic.cn')) continue // 已是微信图
    const asset = await loadAsset(src, dir)
    if (!asset) {
      report.skipped.push(src)
      continue
    }
    if (asset.buffer.length > MAX_IMAGE_BYTES) {
      report.skipped.push(`${src}（超过 10MB）`)
      continue
    }
    firstAsset ??= asset
    const wxUrl = await wx.uploadContentImage(asset.buffer, asset.filename)
    content = content.split(`src="${rawSrc}"`).join(`src="${esc(wxUrl)}"`)
    report.images += 1
  }

  // 2) 封面（草稿必填 thumb_media_id）：--cover/frontmatter 指定 > 文内第一张图
  const coverSpec = options.cover || meta.cover
  let coverAsset = null
  if (coverSpec) {
    coverAsset = await loadAsset(coverSpec, dir)
    if (!coverAsset) throw new Error(`封面图片不可读: ${coverSpec}`)
  } else if (firstAsset) {
    coverAsset = firstAsset
  } else {
    throw new Error('公众号草稿必须有封面图：用 --cover 指定（本地路径/URL），或在文中放至少一张图片')
  }
  const cover = await wx.uploadCover(coverAsset.buffer, coverAsset.filename)
  report.coverUrl = cover.url

  // 3) 写入草稿箱
  const mediaId = await wx.addDraft({
    title,
    author,
    digest,
    content,
    thumb_media_id: cover.media_id,
    need_open_comment: 0,
    only_fans_can_comment: 0,
  })
  report.mediaId = mediaId
  return report
}

/** 收集渲染产物里全部 img src（去重保序） */
function uniqueImageSources(html) {
  const seen = new Set()
  const out = []
  for (const m of html.matchAll(/<img src="([^"]*)"/g)) {
    if (!seen.has(m[1])) {
      seen.add(m[1])
      out.push(m[1])
    }
  }
  return out
}

/** 支持 data URI / http(s) URL / 本地路径（相对 md 文件目录） */
async function loadAsset(src, baseDir) {
  if (src.startsWith('data:image/')) {
    const m = src.match(/^data:image\/[\w.+-]+;base64,(.*)$/s)
    if (!m) return null
    return { buffer: Buffer.from(m[1], 'base64'), filename: 'image.' + (m[0].match(/^data:image\/([\w.+-]+)/)?.[1] || 'jpeg').split('.')[0] }
  }
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src).catch(() => null)
    if (!res || !res.ok) return null
    return {
      buffer: Buffer.from(await res.arrayBuffer()),
      filename: decodeURIComponent(new URL(src).pathname.split('/').pop() || '') || 'image.jpg',
    }
  }
  try {
    return {
      buffer: await readFile(path.resolve(baseDir, src)),
      filename: path.basename(src) || 'image.jpg',
    }
  } catch {
    return null
  }
}

/** 摘要兜底：第一段非空纯文本（跳过纯图片段落） */
function firstParagraphText(md) {
  const { body } = extractFrontmatter(md)
  const tree = parseMarkdown(body)
  const p = tree.children.find((n) => n.type === 'paragraph' && nodeText(n).trim())
  return p ? nodeText(p).trim().replace(/\s+/g, ' ') : ''
}

const UNESCAPES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }

function unescapeHtml(text) {
  return text.replace(/&(amp|lt|gt|quot|#39);/g, (m) => UNESCAPES[m])
}
