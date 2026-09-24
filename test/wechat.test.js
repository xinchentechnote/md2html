import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createWechatClient, WechatError } from '../src/wechat.js'

/** 按 URL 前缀路由的假 transport，可断言调用与返回序列 */
function fakeTransport(routes) {
  const calls = []
  const fn = async (url, init) => {
    calls.push({ url: String(url), init })
    const route = routes.find((r) => String(url).includes(r.match))
    if (!route) throw new Error(`未预期的请求: ${url}`)
    return { json: async () => (typeof route.reply === 'function' ? route.reply(calls.length) : route.reply) }
  }
  fn.calls = calls
  return fn
}

test('wechat: stable_token 获取并缓存', async () => {
  const t = fakeTransport([
    { match: 'stable_token', reply: { access_token: 'T1', expires_in: 7200 } },
    { match: 'uploadimg', reply: { url: 'https://mmbiz.qpic.cn/a.png' } },
  ])
  const wx = createWechatClient({ appid: 'a', secret: 's', fetchFn: t })
  await wx.uploadContentImage(Buffer.from('x'))
  await wx.uploadContentImage(Buffer.from('y'))
  assert.equal(t.calls.filter((c) => c.url.includes('stable_token')).length, 1, 'token 只取一次')
  const up = t.calls.find((c) => c.url.includes('uploadimg'))
  assert.ok(up.url.includes('access_token=T1'))
  assert.ok(up.init.body instanceof FormData)
})

test('wechat: 40001 触发一次 token 强刷重试', async () => {
  let uploadCalls = 0
  const t = fakeTransport([
    { match: 'stable_token', reply: (n) => ({ access_token: `T${n}` }) },
    {
      match: 'uploadimg',
      reply: () => {
        uploadCalls += 1
        return uploadCalls === 1 ? { errcode: 40001, errmsg: 'invalid credential' } : { url: 'https://mmbiz.qpic.cn/b.png' }
      },
    },
  ])
  const wx = createWechatClient({ appid: 'a', secret: 's', fetchFn: t })
  const url = await wx.uploadContentImage(Buffer.from('x'))
  assert.equal(url, 'https://mmbiz.qpic.cn/b.png')
  assert.equal(t.calls.filter((c) => c.url.includes('stable_token')).length, 2, 'token 刷新了一次')
})

test('wechat: 错误码映射为中文并抛 WechatError', async () => {
  const t = fakeTransport([
    { match: 'draft/add', reply: { errcode: 48001, errmsg: 'api unauthorized' } },
    { match: 'stable_token', reply: { access_token: 'T' } },
  ])
  const wx = createWechatClient({ appid: 'a', secret: 's', fetchFn: t })
  await assert.rejects(
    () => wx.addDraft({ title: 'x', content: 'y', thumb_media_id: 'z' }),
    (err) => err instanceof WechatError && err.message.includes('未授权') && err.code === 48001,
  )
})
