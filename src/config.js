import { readFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

/** 凭据加载：环境变量优先，其次 ~/.md2html/config.json；都没有给出可操作的报错 */
export async function loadWechatConfig() {
  if (process.env.MD2HTML_APPID && process.env.MD2HTML_SECRET) {
    return {
      appid: process.env.MD2HTML_APPID,
      secret: process.env.MD2HTML_SECRET,
      source: '环境变量 MD2HTML_APPID / MD2HTML_SECRET',
    }
  }
  const file = path.join(os.homedir(), '.md2html', 'config.json')
  try {
    const conf = JSON.parse(await readFile(file, 'utf8'))
    if (conf.appid && conf.secret) return { ...conf, source: file }
    throw new Error(`配置文件缺少 appid/secret 字段: ${file}`)
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(
        [
          '未配置公众号凭据，无法发布草稿。两种方式任选：',
          '  1) 环境变量：export MD2HTML_APPID=xxx MD2HTML_SECRET=xxx',
          '  2) 配置文件 ~/.md2html/config.json：{ "appid": "xxx", "secret": "xxx" }',
          '',
          '凭据获取：公众号后台「设置与开发 → 基本配置」；IP 白名单需包含本机出口 IP。',
          '暂不发布可继续用复制粘贴流程：md2html 文章.md --open',
        ].join('\n'),
      )
    }
    throw err
  }
}
