import http from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import embeddedEditor from './editor/embedded.js'

const PAGE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>md2html 编辑器</title>
<style>
*{box-sizing:border-box}
body{margin:0;height:100vh;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;color:#1F2937}
header{display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid #E5E7EB;background:#FFFFFF}
.logo{width:28px;height:28px;border-radius:8px;background:#07C160;color:#FFFFFF;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.brand{font-weight:700}
#filename{color:#6B7280;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px}
.spacer{flex:1}
#count,#status{color:#9CA3AF;font-size:12px;white-space:nowrap}
select,button{font-size:13px;padding:7px 12px;border-radius:8px;border:1px solid #D1D5DB;background:#FFFFFF;cursor:pointer}
button:disabled{opacity:.45;cursor:not-allowed}
#copy{background:#07C160;border-color:#07C160;color:#FFFFFF;font-weight:600}
main{flex:1;display:flex;min-height:0}
#editor{flex:1;border:none;resize:none;outline:none;padding:16px 20px;font-family:Menlo,Consolas,'Courier New',monospace;font-size:14px;line-height:1.7;color:#1F2937;background:#FCFCFC;border-right:1px solid #E5E7EB}
#preview-wrap{flex:1;overflow:auto;background:#EDEDED;padding:24px 16px}
#preview{max-width:677px;margin:0 auto;background:#FFFFFF;border-radius:12px;padding:40px 32px;min-height:100%}
#error{display:none;background:#FEE2E2;color:#B91C1C;padding:8px 16px;font-size:13px}
</style>
</head>
<body>
<header>
<div class="logo">M</div>
<div class="brand">md2html</div>
<div id="filename">加载中…</div>
<div class="spacer"></div>
<span id="count"></span>
<select id="theme"></select>
<button id="save" type="button">保存 ⌘S</button>
<button id="copy" type="button">复制到公众号</button>
<span id="status"></span>
</header>
<div id="error"></div>
<main>
<textarea id="editor" spellcheck="false" placeholder="# 开始写作…"></textarea>
<div id="preview-wrap"><div id="preview"></div></div>
</main>
<script src="/editor.js"></script>
</body>
</html>`

/**
 * 浏览器编辑器服务：仅绑定 127.0.0.1，只服务启动时指定的那一个文件，
 * 不接受任意路径读写。GET / 页面、GET /editor.js 打包产物、
 * GET /api/state 初始内容、PUT /api/file 保存。
 */
export async function startEditorServer({ file, theme } = {}) {
  const js =
    embeddedEditor ??
    (await bundleEditorRuntime().catch((err) => {
      throw new Error(`编辑器 bundle 不可用（内嵌为空且运行时打包失败）: ${err.message}`)
    }))

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    const send = (status, type, body) => {
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' })
      res.end(body)
    }
    try {
      if (req.method === 'GET' && url.pathname === '/') return send(200, 'text/html; charset=utf-8', PAGE)
      if (req.method === 'GET' && url.pathname === '/editor.js') return send(200, 'text/javascript; charset=utf-8', js)
      if (req.method === 'GET' && url.pathname === '/api/state') {
        let content = ''
        if (file) {
          try {
            content = await readFile(file, 'utf8')
          } catch {
            content = ''
          }
        }
        return send(200, 'application/json; charset=utf-8', JSON.stringify({ file, content, theme }))
      }
      if (req.method === 'PUT' && url.pathname === '/api/file') {
        if (!file) return send(400, 'application/json; charset=utf-8', '{"error":"no file"}')
        const chunks = []
        for await (const chunk of req) chunks.push(chunk)
        await writeFile(file, Buffer.concat(chunks).toString('utf8'))
        return send(200, 'application/json; charset=utf-8', '{"ok":true}')
      }
      return send(404, 'text/plain; charset=utf-8', 'not found')
    } catch (err) {
      return send(500, 'text/plain; charset=utf-8', String(err?.message || err))
    }
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { server, url: `http://127.0.0.1:${server.address().port}` }
}

/** 开发模式：esbuild 懒加载（只在未内嵌 bundle 时执行；pkg 打包产物永远走内嵌） */
async function bundleEditorRuntime() {
  const { build } = await import('esbuild')
  const bundled = await build({
    entryPoints: [fileURLToPath(new URL('./editor/main.js', import.meta.url))],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    minify: true,
    write: false,
    logLevel: 'silent',
  })
  return bundled.outputFiles[0].text
}
