import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { publish } from '../src/publish.js'
import { createWechatClient } from '../src/wechat.js'

test('publish: 全链路（外链图转存替换 / 封面上传 / 草稿字段）', async () => {
  const tmp = path.join(os.tmpdir(), `md2html-pub-${Date.now()}.md`)
  // 图片用 data URI，避免测试依赖网络
  const png1x1 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
  const md = [
    '---',
    'title: 测试文章',
    'author: 歆晨',
    'digest: 自定义摘要',
    '---',
    '',
    '# 会被 frontmatter title 覆盖的标题',
    '',
    `![配图](${png1x1})`,
    '',
    '正文内容',
  ].join('\n')
  await writeFile(tmp, md, 'utf8')

  const drafts = []
  const t = {
    fn: async (url, init) => {
      if (String(url).includes('stable_token')) return { json: async () => ({ access_token: 'T' }) }
      if (String(url).includes('uploadimg')) return { json: async () => ({ url: 'https://mmbiz.qpic.cn/mmbiz/123.png' }) }
      if (String(url).includes('add_material')) return { json: async () => ({ media_id: 'THUMB_ID', url: 'https://mmbiz.qpic.cn/cover.png' }) }
      if (String(url).includes('draft/add')) {
        drafts.push(JSON.parse(init.body))
        return { json: async () => ({ media_id: 'DRAFT_ID' }) }
      }
      throw new Error(`未预期的请求: ${url}`)
    },
  }

  try {
    const report = await publish(tmp, {}, {
      loadConfig: async () => ({ appid: 'a', secret: 's', source: 'test' }),
      createClient: (cfg) => createWechatClient({ ...cfg, fetchFn: t.fn }),
    })

    assert.equal(report.mediaId, 'DRAFT_ID')
    assert.equal(report.title, '测试文章', 'frontmatter title 优先于 h1')
    assert.equal(report.images, 1)

    const article = drafts[0].articles[0]
    assert.equal(article.title, '测试文章')
    assert.equal(article.author, '歆晨')
    assert.equal(article.digest, '自定义摘要')
    assert.equal(article.thumb_media_id, 'THUMB_ID')
    assert.ok(article.content.includes('https://mmbiz.qpic.cn/mmbiz/123.png'), '正文图已替换为微信 URL')
    assert.ok(!article.content.includes('data:image/'), 'data URI 不残留')
    assert.ok(article.content.includes('正文内容'))
  } finally {
    await rm(tmp, { force: true })
  }
})

test('publish: 无封面且无图时报可操作错误', async () => {
  const tmp = path.join(os.tmpdir(), `md2html-pub2-${Date.now()}.md`)
  await writeFile(tmp, '# 纯文字\n\n没有图片', 'utf8')
  try {
    await assert.rejects(
      () =>
        publish(tmp, {}, {
          loadConfig: async () => ({ appid: 'a', secret: 's', source: 'test' }),
          createClient: (cfg) => createWechatClient({ ...cfg, fetchFn: async () => ({ json: async () => ({}) }) }),
        }),
      (err) => err.message.includes('封面'),
    )
  } finally {
    await rm(tmp, { force: true })
  }
})

test('publish: digest 兜底取首段', async () => {
  const tmp = path.join(os.tmpdir(), `md2html-pub3-${Date.now()}.md`)
  await writeFile(tmp, `![封面图](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==)\n\n这是第一段比较长的摘要候选内容，应当被截取为草稿摘要。`, 'utf8')
  const bodies = []
  const fn = async (url, init) => {
    if (String(url).includes('stable_token')) return { json: async () => ({ access_token: 'T' }) }
    if (String(url).includes('uploadimg')) return { json: async () => ({ url: 'https://mmbiz.qpic.cn/x.png' }) }
    if (String(url).includes('add_material')) return { json: async () => ({ media_id: 'M', url: 'u' }) }
    if (String(url).includes('draft/add')) {
      bodies.push(JSON.parse(init.body))
      return { json: async () => ({ media_id: 'D' }) }
    }
  }
  try {
    await publish(tmp, {}, {
      loadConfig: async () => ({ appid: 'a', secret: 's', source: 'test' }),
      createClient: (cfg) => createWechatClient({ ...cfg, fetchFn: fn }),
    })
    assert.equal(bodies[0].articles[0].digest, '这是第一段比较长的摘要候选内容，应当被截取为草稿摘要。')
  } finally {
    await rm(tmp, { force: true })
  }
})
