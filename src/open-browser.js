// node 专属：不能进浏览器 bundle，独立成模块（utils 保持纯函数供 core 复用）
import { spawn } from 'node:child_process'

export function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
  const child = spawn(cmd, args, { stdio: 'ignore', detached: true })
  child.on('error', () => {})
  child.unref()
}
