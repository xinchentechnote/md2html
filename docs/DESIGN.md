# md2html 开发设计方案

> Markdown → 微信公众号排版 HTML 的 CLI 工具，主题化、样式全内联、可直接复制粘贴发布；预留 UI 编辑器形态。

---

## 1. 目标与非目标

**目标**

- CLI 一条命令把 `.md` 转成公众号可直接粘贴的 HTML（样式全内联，粘贴不丢格式）；
- 多主题（首发 4 套：摸鱼绿 / 红白色系 / 深海蓝 / 活力橙），`-t` 指定，主题成本低可扩展；
- 生成的预览页自带"复制到公众号"按钮，点击即得富文本，粘贴即发布；
- 未来（二期）支持浏览器 UI：左编辑右预览、主题实时切换，复用同一核心。

**非目标**

- 不做公众号 API 直接**群发/发布**（仅规划到"一行命令进草稿箱"，见 TODO.md M5；群发永远手动）；
- 不做多人协作、云同步、账号体系；
- 不做 Word/PDF 导出；
- 一期不做数学公式（二期以 SVG 图片方案支持）。

**运行时零 LLM**：整条链路是确定性规则转换，不调用任何模型 API。

---

## 2. 语言与技术栈

| 项 | 选型 | 理由 |
|---|---|---|
| 语言 | JavaScript（ESM，无构建链） | 环境已有 Node v24；浏览器/Node 同构，二期 UI 零成本复用 core；无 TS/编译步骤，代码即产物 |
| 解析 | `remark-parse` + `remark-gfm` + `unified` | 标准 mdast；GFM 表格/任务列表/删除线开箱即用；AST 级处理是章节编号、图集分组的前提 |
| 代码高亮 | `lowlight`（highlight.js 底层） | 输出语法树，便于把 token 颜色**内联**进 span（公众号剥 class） |
| CLI | `cac` | 轻量、零配置；参数解析 + `-h` 自动生成 |
| 打开浏览器 | 自写 10 行 `child_process`（darwin `open` / linux `xdg-open`） | 不引 `open` 依赖 |
| 数学公式（二期） | `remark-math` + `katex`（SVG 输出） | 公众号不支持 KaTeX CSS，SVG 图片是唯一保真路径 |
| frontmatter（二期） | `remark-frontmatter` | title/date/theme/footer 元数据 |
| UI（二期） | `esbuild` 打包单文件 `editor.html`，无框架或轻量原生 | 双击即开，本地使用，无服务端 |
| 测试 | Node 内置 `node:test` + 快照断言 | 零依赖；快照对比让验收不依赖 AI |

**依赖清单（一期生产依赖仅 5 个）**：`unified`、`remark-parse`、`remark-gfm`、`lowlight`、`cac`。

**为什么不是 Go / Python**：核心难点是把主题"编译"进每个标签的 `style` 属性并生成公众号白名单内的结构（`<section>` 嵌套、逐行 `<span>` 代码、flex 图集）。Node 生态在该领域先例最多（doocs/md、mdnice、参考站均为此路线），`remark` 的 AST 插件体系让"编号/分组/页脚注入"这类结构性变换天然可做；Go 无等价 inliner 与 AST 生态，Python 的 markdown 插件组合不完整，二者都意味着更多自写代码（开发期 token 更高、公众号还原风险更大）。

**代码规模预估（合计 < 1500 行）**

| 模块 | 预估行数 |
|---|---|
| 渲染器 render.js（全部组件） | 500–700 |
| transform.js（编号/图集/页脚） | ~120 |
| 主题 4 套（每套 ~60） | ~240 |
| CLI 入口 + 预览壳 + 工具函数 | ~200 |
| 测试 + 验收样例 | ~150 |

---

## 3. 总体架构与数据流

```
md 文件 ──CLI──▶ parse ──▶ mdast ──▶ transform ──▶ mdast' ──▶ render ──▶ 内联HTML ──▶ 预览页/剪贴板
                remark      标准树     结构性预处理     增强节点    组件渲染      全 style 内联
```

三条铁律：

1. **core 是纯函数**：`renderMarkdown(mdString, themeId, options) → { articleHtml, meta }`。不读文件、不写文件、无副作用，Node 与浏览器通用。CLI 与二期 UI 都是它的薄壳。
2. **样式 100% 内联**：产出 HTML 中没有 `<style>`/`<script>`（预览壳除外）、没有 class/id，每块样式都在 `style` 属性上。
3. **结构性效果在 AST 层做**：章节编号、图集、金句卡、页脚——CSS 计数器/grid 在公众号全失效，这些必须在渲染时生成真实结构。

---

## 4. 目录结构

```
md2html/
├── package.json            # bin: md2html；type: module
├── bin/md2html.js          # CLI 入口（#!/usr/bin/env node）
├── src/
│   ├── index.js            # 对外 API：renderMarkdown()
│   ├── parse.js            # remark → mdast
│   ├── transform.js        # h1→标题卡、h2 编号、连续图→图集、追加页脚
│   ├── render.js           # 组件分发表 + 全部块级/行内组件
│   ├── preview.js          # 生成带"复制到公众号"按钮的预览页
│   └── utils.js            # style 对象→内联串、HTML 转义、openBrowser
├── themes/
│   ├── index.js            # 主题注册表 { id → theme }
│   └── moyu.js 等 4 套     # designVars + 可选组件覆盖
└── test/
    ├── fixtures/sample.md  # 元素齐全的验收样例
    └── render.test.js      # 各主题快照测试
```

---

## 5. 渲染管线设计

### 5.1 parse

`unified().use(remarkParse).use(remarkGfm)` → mdast。二期在此追加 `remark-math`、`remark-frontmatter`。

### 5.2 transform（AST 预处理，输入输出均为 mdast）

| 步骤 | 规则 |
|---|---|
| 标题卡 | 文档首个 `h1` 从正文摘出，注入自定义节点 `headerCard`（含日期+标题）；无 h1 则用文件名。日期默认今天，格式 `22 SEP 2026` |
| 章节编号 | 一级 `h2` 递增编号（01/02/…）；若标题首个词为纯 ASCII（如 `## WHY 为什么`），拆为「英文小标签 + 中文标题」，否则无标签 |
| 图集分组 | 空行是分组边界：同一段落内连续书写的图片（≥2 张，含换行 text 节点）合并为 `gallery` 节点，2 张一行；单图段落独立为 `imageCard`（alt 即题注） |
| 页脚 | 文末追加 `footerCard`（点赞👍/在看👀/转发🔁 三卡），`--no-footer` 或 frontmatter 可关 |

### 5.3 render（组件渲染）

递归遍历 mdast，按 `node.type` 分发到组件函数；组件签名统一：
`Component(node, ctx) → htmlString`，`ctx = { vars, children(node), inline(nodes) }`。

- 块级容器一律 `<section>`，文本叶节点用 `<span>`；
- 代码块逐行 `<span style="display:block">`（公众号粘贴后行结构不丢）；
- 布局用内联 `display:flex`（mdnice/参考站验证可在粘贴中存活）；
- 工具函数 `s({color:'#111',margin:'0'})` → `'color:#111;margin:0'`，所有文本经 HTML 转义。

---

## 6. 组件规格（验收对照表）

| Markdown 元素 | 输出结构约定（配合 designVars 变量） |
|---|---|
| h1（文首） | 浅色渐变圆角卡：日期小字 + 大号粗体标题 + 主题色短下划线装饰 |
| h2 | 自动编号：主题色特大号数字 `01` + 灰色小字母间距英文标签 + 黑色粗体标题 |
| h3/h4 | 主题色左侧竖条 + 粗体，字号递减 |
| 段落 p | 基础字号 15px，行高 1.75，两端对齐，段间距 10px |
| strong | 主题色加粗 |
| em | 常规斜体（金句卡内：黄色底纹高亮，见 blockquote） |
| 行内代码 | 主题色浅底圆角 `<code style>` |
| 代码块 | 深色圆角卡（codeBg），文件名行（可选），逐行 span；`white-space:pre-wrap;word-break:break-all` 防长行溢出；lowlight 语法着色内联 |
| blockquote（金句卡） | 虚线边框圆角卡、居中粗体；卡内 `**关键词**` 渲染为高亮色"底纹+下划线" |
| 列表 | 有序：浅底圆角卡 + 主题色圆形序号；无序：主题色圆点；任务：☑/☐ + 勾选置灰删除线；嵌套逐级缩进 1.5em |
| 任务列表 | ☑/☐ 字符 + 删除线（GFM checked） |
| 表格 | 真实 `<table>` 内联边框；表头主题色浅底；**列数 ≥4 或表头合计 ≥14 字自动降级为逐行卡片**（公众号不支持横向滚动） |
| 分割线 | 居中短粗主题色横条（非全宽 hr） |
| 单图 | 圆角图卡 + 底部灰色小字题注 |
| 图集（连续≥2 图） | flex 网格，每行 2 张，间距 6px，圆角 |
| 链接 | **降级为主题色文字 + 下划线，不输出 `<a>`**（多数个人号无外链权限，`<a>` 会被剥成纯文本反而丢样式；带 href 的完整链接以括号小字附后可选） |
| 删除线 | 灰色删除线 |
| 页脚 footerCard | 居中"有收获的话，三连支持一下" + 👍点赞/👀在看/🔁转发 三张浅底小卡 |

---

## 7. 主题系统

**原则：共享一套渲染器，主题 = 变量 + 少量组件覆盖。绝不每主题复制一份渲染器。**

```js
// themes/moyu.js
export default {
  id: 'moyu',
  name: '摸鱼绿',
  vars: {
    colors: {
      accent: '#07C160', accentLight: '#E8F8EF',
      heading: '#1A1A1A', text: '#3F3F3F', muted: '#9CA3AF',
      highlight: '#FFE58F',                 // 金句高亮
      cardBg: '#F6F8FA', border: '#E5E7EB',
      codeBg: '#1E1E1E', codeText: '#D4D4D4',
    },
    font: {
      base: '15px', title: '22px', h2: '17px', code: '13px',
      family: "-apple-system,'PingFang SC','Microsoft YaHei',sans-serif",
      mono: "Menlo,Consolas,'Courier New',monospace",
    },
    radius: { card: '12px', tag: '6px' },
    spacing: { paragraph: '10px', block: '24px' },
  },
  // 可选：仅当该主题需要独特结构时覆盖个别组件
  components: { heading2: (node, ctx) => /* … */ },
}
```

- 语法着色映射也走 vars：`codeTokens: { keyword:'#C586C0', string:'#CE9178', … }`（每主题一套配色）。
- 新增一套主题 = 新增一个 ~60 行文件 + 注册一行；目标是"加主题不碰渲染器"。
- `--list-themes` 从注册表生成。

首发 6 套主题色板：摸鱼绿（`#07C160`）、红白色系（`#E34D59`）、深海蓝（`#2A6AE9`）、活力橙（`#F76B1C`）、暗夜紫（`#7C5CFC`）、蜜桃粉（`#EC6E8B`）。字体/圆角/间距/代码配色走 `themes/base.js` 默认值，主题文件只写 `colors`（约 20 行）。组件结构对齐参考站效果，品牌与文案自定。

---

## 8. CLI 设计

```
md2html <input...>        转换一个或多个 md 文件

  -t, --theme <name>      主题 id，默认 moyu
  -o, --out <file>        输出路径（默认与输入同目录同名 .html；多文件时忽略）
      --stdout            仅输出正文 HTML 片段到 stdout（管道友好）
      --open              生成后自动打开预览页
      --no-footer         不追加一键三连页脚
      --list-themes       列出可用主题
  -w, --watch             监听文件变更重新生成（二期）
  -h, --help / -v, --version
```

**配置优先级（二期 frontmatter 落地后）**：frontmatter > CLI 参数 > 默认值。

```bash
md2html article.md                        # → article.html（预览页）
md2html article.md -t deepblue --open     # 深海蓝主题并立即预览
md2html article.md --stdout | pbcopy      # 纯净片段进管道
md2html *.md -t orange                    # 批量
```

安装：仓库内 `npm link` 全局可用；后续可选发布 npm（包名 `md2html` 大概率被占，备选 `md2html-cli` 或 `@<scope>/md2html`，bin 名仍为 `md2html`）。

---

## 9. 预览页与复制机制

预览页 = 极简壳 + 正文：

- 灰底居中白色内容列，宽度 **677px**（公众号正文实际渲染宽度，保证所见即所得）；
- 右下悬浮"复制到公众号"按钮：脚本对正文容器 `Range.selectNodeContents()` + `document.execCommand('copy')`，把**富文本（text/html）**写入剪贴板 → 公众号后台直接 ⌘V；
- 备选路径：页内点击正文 ⌘A/⌘C 同样有效（兜底）；
- 壳内的 `<script>`/按钮属于预览层，永远不会进入复制内容与 `--stdout` 输出。

macOS 附加路径（二期可选）：`textutil -convert rtf -stdout | pbcopy` 直接进系统剪贴板，脱离浏览器。

---

## 10. 二期：UI 编辑器

- `md2html ui`（或直接打开 `dist/editor.html`）：`esbuild` 把 core + 页面打成**单 HTML 文件**，双击即用、离线可用、零服务端；
- 布局：左侧 textarea（等宽字体、字数统计）+ 右侧预览（677px 列）+ 顶部主题下拉 + "复制到公众号"按钮——对齐参考站形态，功能一致即可；
- 渲染 debounce 300ms；core 因纯函数特性**一行不改**地运行在浏览器；
- 后续可选增强：本地草稿 localStorage、自定义主题编辑器（编辑 designVars 即时预览）。

---

## 11. 里程碑与验收

| 阶段 | 内容 | 验收标准 |
|---|---|---|
| M0 | 骨架 + 本方案定稿 + `fixtures/sample.md`（元素齐全样例） | 样例覆盖第 6 节全部元素 |
| M1 | 渲染器全组件 + 摸鱼绿主题 + CLI（-t/-o/--stdout/--open/--list-themes）+ 快照测试 | sample.md 渲染 → 粘贴公众号，10/10 元素视觉符合第 6 节约定 |
| M2 | 其余 3 主题 + `--watch` + 边缘处理（长行换行/宽表格/多级列表/空文档） | 4 主题快照全绿；长行不溢出 |
| M3 | frontmatter（title/date/theme/footer）+ remark-math → KaTeX SVG | 元数据可覆盖 CLI；公式在公众号显示为图片 |
| M4 | UI 编辑器（单文件 editor.html） | 双击可用；实时预览 + 复制成功 |

**人工粘贴 checklist（每主题跑一遍）**：标题层级、段落、粗斜体、行内代码、代码块行结构、金句卡、两种列表、表格、分割线、单图/图集、页脚三连。

---

## 12. 测试策略

- `node:test` + 自研 30 行快照断言：`fixtures/sample.md` × 每主题 → 输出 HTML 快照存 `test/__snapshots__/`，结构变化显式 diff；
- 单测覆盖 transform 规则（编号、图集分组、h1 摘取）与 utils（转义、style 序列化）；
- 快照的意义：回归验证**不需要 AI 参与**，改代码后 `npm test` 即判。

---

## 13. 开发期 Token 消耗控制

1. **一次成型**：按本方案第 5–7 节的输出约定一次性生成渲染器与摸鱼绿主题；SPEC 越精确，返工越少（返工是最大隐性 token 消耗）；
2. **文件小而少**：合计 <1500 行、<15 个源文件；文件越小，后续每次 AI 迭代的上下文开销越小；
3. **无构建链**：普通 ESM JS + JSDoc，不引 TS/打包/lint，代码即产物；
4. **快照验收**：`npm test` 秒级判断对错，验证环节零 token；
5. **加主题不碰渲染器**：扩展点收敛在 themes/，改动面最小。

---

## 14. 风险与公众号白名单附录

**已知限制**

- 外链图片粘贴时常被屏蔽：文档中明确提示使用可公网访问的图床；粘贴时公众号会对可访问图片自动转存；
- `data:` URI、内联 SVG、`position`/`float`、CSS 计数器、外部字体：一律不用；
- `<a>` 对多数个人号无效 → 已按"主题色文字"降级（第 6 节）；
- 公众号编辑器偶尔对粘贴内容二次清洗：首发前每主题人工 checklist 必过。

**白名单要点（实现约束）**

- 允许：`section/p/span/strong/em/img/table/tr/td/blockquote/br/code`，及内联 `style` 中的 `color/background/font-*/margin/padding/border*/display:flex/text-align/line-height/letter-spacing/white-space/word-break/border-radius`；
- 代码块必须逐行 `<span style="display:block">`，整块 `<pre>` 会被编辑器重置；
- 一切布局用 `<section>` 嵌套 + flex，不依赖 `<div>`（部分客户端对 div 嵌套有清洗行为）。
