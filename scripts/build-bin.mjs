// 打包管线：编辑器浏览器 bundle 内嵌 → CLI 打成 CJS → 交叉编译平台目标。
// 用法：npm run build:bin [-- macos-arm64 win-x64 ...]  不传 = 全部目标。
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, createWriteStream, chmodSync } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pkg = require('../package.json')
// Windows 上 new URL().pathname 是 /D:/...，必须用 fileURLToPath 转换，否则拼出 D:\D:\...
const ROOT = path.dirname(fileURLToPath(import.meta.url))
const wanted = process.argv.slice(2)

// Win7 基座版本：Node 14 是最后支持 Win7 的大版本，但晚期 14.x 构建依赖 Win8+ API，
// 14.17.6 是社区确认的最后干净版本；pkg-fetch 现成的 node14 基座是 14.21.3 不可用，
// 因此直接从 nodejs.org 拉官方 exe 作为自定义基座交给 pkg 打补丁
const WIN7_NODE = '14.17.6'

const T = (target, name, engine, { exe = false, win7Arch = null } = {}) => ({
  target,
  name,
  engine,
  exe,
  win7Arch,
})

const TARGETS = [
  T('node22-macos-arm64', `md2html-v${pkg.version}-macos-arm64`, 'yao'),
  T('node22-macos-x64', `md2html-v${pkg.version}-macos-x64`, 'yao'),
  // linuxstatic = musl 全静态链接，不依赖系统 glibc（Node18+ 官方基座要 glibc≥2.28，
  // CentOS 7 只有 2.17 会报 GLIBC not found）；产物可在 CentOS 7 / Alpine 等任何发行版运行
  T('node22-linuxstatic-x64', `md2html-v${pkg.version}-linux-x64`, 'yao'),
  T('node22-linux-arm64', `md2html-v${pkg.version}-linux-arm64`, 'yao'),
  T('node22-win-x64', `md2html-v${pkg.version}-win-x64`, 'yao', { exe: true }),
  T(null, `md2html-v${pkg.version}-win7-x64`, 'pkg5', { exe: true, win7Arch: 'x64' }),
  T(null, `md2html-v${pkg.version}-win7-x86`, 'pkg5', { exe: true, win7Arch: 'x86' }),
]

mkdirSync(path.join(ROOT, '../build'), { recursive: true })
mkdirSync(path.join(ROOT, '../dist'), { recursive: true })

const targets = TARGETS.filter(
  (t) => wanted.length === 0 || wanted.some((w) => t.name.includes(w)),
)
if (targets.length === 0) throw new Error(`无匹配目标: ${wanted.join(', ')}`)

async function win7Base(arch) {
  const file = path.join(ROOT, `../build/node-v${WIN7_NODE}-win-${arch}.exe`)
  if (!existsSync(file)) {
    const url = `https://nodejs.org/dist/v${WIN7_NODE}/win-${arch}/node.exe`
    console.error(`↓ 下载 Win7 基座 ${url}`)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`下载失败 ${res.status}: ${url}`)
    await pipeline(Readable.fromWeb(res.body), createWriteStream(file))
  }
  chmodSync(file, 0o755)
  return file
}

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
const EMBEDDED = path.join(ROOT, '../src/editor/embedded.js')
const PLACEHOLDER = '// 由 scripts/build-bin.mjs 在打包时生成，内嵌编辑器浏览器端 bundle。\n// null = 开发模式：ui-server 启动时用本地 esbuild 现场打包。\nexport default null\n'
writeFileSync(EMBEDDED, `export default ${JSON.stringify(editor.outputFiles[0].text)}\n`)

try {
  // 2) CLI → 单文件 CJS bundle（esbuild 保持 external：打包产物走内嵌路径，永不加载；
  //    target es2020 兼容 node14 基座——Win7 产物用的旧运行时）
  await build({
    entryPoints: [path.join(ROOT, '../bin/md2html.js')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'es2020',
    external: ['esbuild'],
    outfile: path.join(ROOT, '../build/md2html.cjs'),
    logLevel: 'silent',
  })

  // 3) 交叉编译（两个 pkg 引擎按路径调用，避免 .bin 名称冲突）
  const ENGINES = {
    yao: path.join(ROOT, '../node_modules/@yao-pkg/pkg/lib-es5/bin.js'),
    pkg5: path.join(ROOT, '../node_modules/pkg/lib-es5/bin.js'),
  }
  for (const t of targets) {
    const targetArg = t.win7Arch ? await win7Base(t.win7Arch) : t.target
    const out = path.join(ROOT, '../dist', t.name + (t.exe ? '.exe' : ''))
    execFileSync(
      process.execPath,
      [ENGINES[t.engine], 'build/md2html.cjs', '--target', targetArg, '--output', out],
      { cwd: path.join(ROOT, '..'), stdio: 'inherit' },
    )
    console.error(`✔ ${out}`)
  }
} finally {
  // 还原占位，开发模式继续走运行时打包，避免本地残留过期 bundle
  writeFileSync(EMBEDDED, PLACEHOLDER)
}
