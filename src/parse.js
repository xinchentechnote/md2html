import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'

export function parseMarkdown(md) {
  return unified().use(remarkParse).use(remarkGfm).parse(md)
}

/** 节点内全部纯文本（用于标题等） */
export function nodeText(node) {
  if (node.type === 'text') return node.value
  return (node.children || []).map(nodeText).join('')
}
