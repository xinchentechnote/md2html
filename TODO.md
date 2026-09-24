# md2html TODO

> 执行跟踪清单；技术方案与组件规格见 [docs/DESIGN.md](docs/DESIGN.md)。
> 已完成：M0 骨架与验收样例 / M1 核心渲染器 + 摸鱼绿 + CLI / M2 六套主题 + --watch + 边缘处理（17/17 测试绿）。

## 近期（M3 · 元数据与公式）

- [ ] frontmatter 支持：`title` / `date` / `theme` / `footer`（`remark-frontmatter`；优先级 frontmatter > CLI > 默认）
- [ ] 数学公式：`remark-math` + KaTeX 渲染 SVG 图片
  - [ ] 先调研公众号对 `data:` URI 与外链图片的实际处理，确定图片落地方式
- [ ] CLI：`--theme` 与 frontmatter theme 的冲突提示

## 之后（M4 · 浏览器编辑器，实时预览）

选型结论（2026-09）：不做原生桌面 App（Tauri/Electron 成本在包装不在功能）；
主路线 = **CLI 起超小本地服务 + 浏览器标签当编辑器**（文件保存闭环、零新依赖）；
纯静态单文件版作为绿色补充（Safari 无 File System Access API，保存受限）；
未来要桌面窗口用 Tauri 包静态页，逻辑零重写。

- [x] M4a `md2html ui [file]`：`node:http` 本地服务（零依赖框架）：`GET /` 编辑器页 / `GET|PUT /api/file` 读写文件（已完成并浏览器端到端验证：实时预览/保存回写/复制反馈）
- [x] 页面：左 textarea 编辑 + 右实时预览（debounce 300ms，core 浏览器端直跑）+ 主题下拉（localStorage 记忆）+ 复制按钮（Range+execCommand）+ ⌘S 保存 + Tab 缩进
- [x] 预览塞 div（输出全内联样式，无污染）
- [ ] M4b（可选）`--static`：esbuild 打包单文件 editor.html 绿色版（File System Access API，Chrome/Edge 可保存）
- [ ] 编辑器升级（可选）：CodeMirror 6 语法高亮（+~300KB）
- [ ] 可选增强：多文件/最近文件列表、localStorage 草稿、自定义主题即时预览

## 远期（M5 · 一行命令进公众号草稿箱）✅ 已实现（2026-09-24）

- [x] 凭据：环境变量 `MD2HTML_APPID/SECRET` 或 `~/.md2html/config.json`（环境变量优先；未配置给出可操作报错 + 复制粘贴兜底提示）
- [x] `src/wechat.js`：stable_token（缓存 + 40001/42001 强刷重试一次）、`media/uploadimg` 正文图转存、`material/add_material` 封面、`draft/add`；常见错误码中文映射（含 48001 无权限、40164 IP 白名单）
- [x] `src/publish.js`：渲染 → 正文图转存替换（外链/本地/data URI，已是 mmbiz 跳过，>10MB 跳过并报告）→ 封面（--cover/frontmatter > 文内首图，无图报错）→ 草稿
- [x] `md2html publish <file>`：--title/--author/--digest/--cover/-t/--no-footer
- [x] frontmatter（M3 的一半）：title/date/theme/footer/author/digest/cover，优先级 参数 > frontmatter > 兜底；默认主题收敛到 index（deepblue）
- [x] 测试：frontmatter 优先级、假 transport 的 token 缓存/强刷重试/错误映射、publish 全链路（data URI 转存替换、封面、字段、digest 兜底）共 28 项
- [ ] 真实账号联调（需用户提供凭据；确认账号有草稿接口权限——未认证个人号报 48001）

## 主题扩充（P2，每套约 20 行色板）

- [ ] **莫兰迪雾蓝**（`#7A8B99` 灰蓝 + 低饱和）— ⭐ 歆晨技术笔记首选差异化主题，高级感、不抢内容、适合长文深度阅读
- [ ] 黑金商务（近黑标题 + `#B8862B` 金点缀）— 财经、投资、商业分析
- [ ] 复古报刊（米色纸张底 `#F5F0E6` + 衬线标题 + 深棕）— 人物故事、长篇叙事，差异化最强；技术号可作年终总结风格
- [ ] 克莱因蓝（`#002FA7` 高饱和）— 设计、艺术、创意；正文需配低饱和灰
- [ ] 薄荷青（`#14B8A6`）— 健康、运动、效率工具

## 验收欠账

- [ ] 6 套主题 × 公众号真实粘贴人工 checklist（DESIGN §11 十项清单，需公众号后台）

## 可执行程序打包（GitHub Actions）

- [x] `scripts/build-bin.mjs`：编辑器 bundle 内嵌（摆脱运行时 esbuild 原生依赖）→ CJS bundle → pkg 交叉编译（支持目标过滤参数）
- [x] `scripts/smoke-test.mjs`：二进制冒烟测试（version/主题/转换/ui 服务含内嵌 bundle 与保存闭环）
- [x] `.github/workflows/build.yml`：矩阵（macos-arm64 原生验证+交叉 x64 / linux-x64 / linux-arm64 / win-x64），测试→打包→冒烟→上传 artifact；`v*` tag 自动挂 GitHub Release
- [x] CI 踩坑修复记录：`--no-bytecode` 移除（pkg 报错）、`.gitattributes` LF + 快照行尾归一化（Windows CRLF）、`createRequire(import.meta.url)` 改 JSON 导入（pkg CJS 沙箱 import.meta.url 为 undefined）、`fileURLToPath`（Windows 路径盘符翻倍）
- [x] 本地 macos-arm64：打包 + 全项冒烟通过（--version/主题/转换/ui 内嵌 bundle 与保存闭环）
- [x] CentOS 7 兼容：linux-x64 改用 `node22-linuxstatic-x64`（musl 全静态，摆脱 glibc≥2.28 限制；Node18+ 官方基座在 glibc 2.17 报 GLIBC not found）
- [x] Windows 恢复：`win-x64`（node22 基座，**仅 Win10+**）
- [x] **Win7 支持已放弃**（2026-09 决策）：Node 18+ 官方构建要求 Win10+；干净支持 Win7 的 node14 旧基座依赖已停维护的 vercel/pkg 5.8.1，工具链验证成本高且产物无安全更新。确有 Win7 场景的备选：Win7 上装 Node 14 + 以 npm 包方式运行
- [ ] Windows Defender 误报观察（pkg 产物常见，必要时加签名或改用 Node SEA/自编译）

## 可选（不阻塞）

- [ ] npm 发布（包名 `md2html` 大概率被占，备选 `md2html-cli`，bin 仍叫 `md2html`）
- [ ] macOS `textutil -convert rtf | pbcopy` 直接进系统剪贴板，脱离浏览器
- [ ] 长链接渲染策略选项（当前统一降级为主题色文字）
