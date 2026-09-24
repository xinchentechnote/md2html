/** 微信公众号 API 客户端：stable_token + 图片上传 + 草稿箱。fetch 可注入便于测试。 */

const API = 'https://api.weixin.qq.com'

// 常见错误码中文映射（完整列表见微信公众平台文档）
const ERRCODE_TIPS = {
  '-1': '系统繁忙，稍后重试',
  40001: 'AppSecret 错误，或不属于该公众号',
  40002: '凭证类型不合法',
  40013: 'AppID 不合法',
  40004: '媒体文件类型不合法（支持 jpg/png）',
  40005: '不支持的文件类型',
  40009: '图片尺寸过大（封面建议 900×383，正文图 ≤10MB）',
  40125: '无效的 AppSecret（可能在后台被重置）',
  40164: 'IP 不在白名单（错误信息里通常带了本机出口 IP，去后台加上）',
  41001: '缺少 access_token',
  42001: 'access_token 已过期',
  43104: 'AppID 与账号不匹配',
  44002: 'POST 内容为空',
  45002: '内容超过大小限制（正文 ≤2 万字符 / 20 万字节内保险）',
  45009: '接口调用频率超限，稍后重试',
  48001: 'api 未授权——该账号大概率没有草稿/素材接口权限（未认证个人订阅号通常没有，需微信认证）',
}

export class WechatError extends Error {
  constructor(code, message) {
    super(`[${code}] ${ERRCODE_TIPS[code] || '微信接口错误'}（${message}）`)
    this.name = 'WechatError'
    this.code = code
  }
}

export function createWechatClient({ appid, secret, fetchFn = fetch } = {}) {
  if (!appid || !secret) throw new Error('createWechatClient 需要 appid 与 secret')
  let token = null

  async function getToken(force = false) {
    if (token && !force) return token
    const res = await fetchFn(`${API}/cgi-bin/stable_token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credential', appid, secret }),
    })
    const data = await res.json()
    assertOk(data)
    token = data.access_token
    return token
  }

  /** 带 token 调用；40001/42001 时强制刷新 token 重试一次 */
  async function call(pathname, init, retried = false) {
    const t = await getToken()
    const sep = pathname.includes('?') ? '&' : '?'
    const res = await fetchFn(`${API}${pathname}${sep}access_token=${t}`, init)
    const data = await res.json()
    if ((data.errcode === 40001 || data.errcode === 42001) && !retried) {
      await getToken(true)
      return call(pathname, init, true)
    }
    assertOk(data)
    return data
  }

  /** 正文图片转存，返回微信 URL（草稿正文不允许外链图） */
  async function uploadContentImage(buffer, filename = 'image.jpg') {
    const form = new FormData()
    form.append('media', new Blob([buffer]), filename)
    const data = await call('/cgi-bin/media/uploadimg', { method: 'POST', body: form })
    if (!data.url) throw new Error(`uploadimg 未返回 url: ${JSON.stringify(data)}`)
    return data.url
  }

  /** 封面图上传为永久素材，返回 { media_id, url }（草稿必填 thumb_media_id） */
  async function uploadCover(buffer, filename = 'cover.jpg') {
    const form = new FormData()
    form.append('media', new Blob([buffer]), filename)
    return call('/cgi-bin/material/add_material?type=image', { method: 'POST', body: form })
  }

  /** 新建草稿，返回草稿 media_id */
  async function addDraft(article) {
    const data = await call('/cgi-bin/draft/add', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ articles: [article] }),
    })
    if (!data.media_id) throw new Error(`draft/add 未返回 media_id: ${JSON.stringify(data)}`)
    return data.media_id
  }

  return { getToken, uploadContentImage, uploadCover, addDraft }
}

function assertOk(data) {
  if (data.errcode) throw new WechatError(data.errcode, data.errmsg || '')
}
