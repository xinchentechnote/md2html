// 打包管线：编辑器浏览器 bundle 内嵌 → CLI 打成 CJS → 交叉编译平台目标。
// 用法：npm run build:bin [-- macos-arm64 win-x64 ...]  不传 = 全部 5 个目标。
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pkg = require('../package.json')
// Windows 上 new URL().pathname 是 /D:/...，必须用 fileURLToPath 转换，否则拼出 D:\D:\...
const ROOT = path.dirname(fileURLToPath(import.meta.url))
const wanted = process.argv.slice(2)

const TARGETS = [
  ['node22-macos-arm64', `md2html-v${pkg.version}-macos-arm64`, false],
  ['node22-macos-x64', `md2html-v${pkg.version}-macos-x64`, false],
  // linuxstatic = musl 全静态链接，不依赖系统 glibc（Node18+ 官方基座要 glibc≥2.28，
  // CentOS 7 只有 2.17 会报 GLIBC not found）；产物可在 CentOS 7 / Alpine 等任何发行版运行
  ['node22-linuxstatic-x64', `md2html-v${pkg.version}-linux-x64`, false],
  ['node22-linux-arm64', `md2html-v${pkg.version}-linux-arm64`, false],
  ['node22-win-x64', `md2html-v${pkg.version}-win-x64`, true],
]

const EMBEDDED = path.join(ROOT, '../src/editor/embedded.js')
const PLACEHOLDER = '// 由 scripts/build-bin.mjs 在打包时生成，内嵌编辑器浏览器端 bundle。\n// null = 开发模式：ui-server 启动时用本地 esbuild 现场打包。\nexport default null\n'

mkdirSync(path.join(ROOT, '../build'), { recursive: true })
mkdirSync(path.join(ROOT, '../dist'), { recursive: true })

const targets = TARGETS.filter(
  ([, name]) => wanted.length === 0 || wanted.some((w) => name.includes(w)),
)
if (targets.length === 0) throw new Error(`无匹配目标: ${wanted.join(', ')}`)

// 1) 编辑器浏览器 bundle → 内嵌模块（打包产物不再依赖 esbuild 原生二进制）
const editor = await build({
  entryPoints: [path.join(ROOT, '../src/editor/main.js')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  minify: true,
  write: false,
  logLevel: 'silent',
})
writeFileSync(EMBEDDED, `export default ${JSON.stringify(editor.outputFiles[0].text)}\n`)

try {
  // 2) CLI → 单文件 CJS bundle（esbuild 保持 external：打包产物走内嵌路径，永不加载）
  await build({
    entryPoints: [path.join(ROOT, '../bin/md2html.js')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['esbuild'],
    outfile: path.join(ROOT, '../build/md2html.cjs'),
    logLevel: 'silent',
  })

  // 3) 交叉编译
  const pkgBin = path.join(ROOT, '../node_modules/.bin', process.platform === 'win32' ? 'pkg.cmd' : 'pkg')
  for (const [target, name, isWin] of targets) {
    const out = path.join(ROOT, '../dist', name + (isWin ? '.exe' : ''))
    execFileSync(pkgBin, ['build/md2html.cjs', '--target', target, '--output', out], {
      cwd: path.join(ROOT, '..'),
      stdio: 'inherit',
    })
    console.error(`✔ ${out}`)
  }
} finally {
  // 还原占位，开发模式继续走运行时打包，避免本地残留过期 bundle
  writeFileSync(EMBEDDED, PLACEHOLDER)
}
