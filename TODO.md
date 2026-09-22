# md2html TODO

> 执行跟踪清单；技术方案与组件规格见 [docs/DESIGN.md](docs/DESIGN.md)。
> 已完成：M0 骨架与验收样例 / M1 核心渲染器 + 摸鱼绿 + CLI / M2 六套主题 + --watch + 边缘处理（17/17 测试绿）。

## 近期（M3 · 元数据与公式）

- [ ] frontmatter 支持：`title` / `date` / `theme` / `footer`（`remark-frontmatter`；优先级 frontmatter > CLI > 默认）
- [ ] 数学公式：`remark-math` + KaTeX 渲染 SVG 图片
  - [ ] 先调研公众号对 `data:` URI 与外链图片的实际处理，确定图片落地方式
- [ ] CLI：`--theme` 与 frontmatter theme 的冲突提示

## 之后（M4 · UI 编辑器）

- [ ] esbuild 打包单文件 `editor.html`：左编辑右预览 + 主题下拉 + 复制按钮
- [ ] 双击即用、离线可用、无服务端（core 纯函数零改动复用）
- [ ] 渲染 debounce 300ms；可选 localStorage 草稿

## 远期（M5 · 一行命令进公众号草稿箱）

目标形态：`md2html publish article.md -t deepblue` → 直接出现在公众号草稿箱（不自动群发）。

- [ ] 前置确认：账号是否有草稿箱 API 权限（未认证个人订阅号通常无素材/草稿接口，需认证）
- [ ] 凭据管理：AppID/AppSecret 走环境变量或 `~/.md2html/config`（绝不入库；公众号后台需配置 IP 白名单）
- [ ] 链路实现（微信官方 API）：
  - [ ] `stable_token`（或 access_token）获取与缓存刷新
  - [ ] 正文图片转存：解析 HTML 内全部 `<img>` → 下载 → `/cgi-bin/media/uploadimg` → 替换为微信 URL（草稿不允许外链图）
  - [ ] 封面图：`/cgi-bin/material/add_material` 取 `thumb_media_id`（取文内首图或 frontmatter 指定）
  - [ ] `POST /cgi-bin/draft/add` 写入草稿（title/author/content/digest/cover）
- [ ] frontmatter 扩展：`author` / `digest` / `cover` / `account`
- [ ] 失败兜底：API 不可用/未配置时回落到预览页复制粘贴流程

## 主题扩充（P2，每套约 20 行色板）

- [ ] **莫兰迪雾蓝**（`#7A8B99` 灰蓝 + 低饱和）— ⭐ 歆晨技术笔记首选差异化主题，高级感、不抢内容、适合长文深度阅读
- [ ] 黑金商务（近黑标题 + `#B8862B` 金点缀）— 财经、投资、商业分析
- [ ] 复古报刊（米色纸张底 `#F5F0E6` + 衬线标题 + 深棕）— 人物故事、长篇叙事，差异化最强；技术号可作年终总结风格
- [ ] 克莱因蓝（`#002FA7` 高饱和）— 设计、艺术、创意；正文需配低饱和灰
- [ ] 薄荷青（`#14B8A6`）— 健康、运动、效率工具

## 验收欠账

- [ ] 6 套主题 × 公众号真实粘贴人工 checklist（DESIGN §11 十项清单，需公众号后台）

## 可选（不阻塞）

- [ ] npm 发布（包名 `md2html` 大概率被占，备选 `md2html-cli`，bin 仍叫 `md2html`）
- [ ] macOS `textutil -convert rtf | pbcopy` 直接进系统剪贴板，脱离浏览器
- [ ] 长链接渲染策略选项（当前统一降级为主题色文字）
