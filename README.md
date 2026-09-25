# md2html

Markdown → 微信公众号排版 HTML 的 CLI 工具：主题化、样式全内联、粘贴不丢格式。设计与方案见 [docs/DESIGN.md](docs/DESIGN.md)，执行进度见 [TODO.md](TODO.md)。

## 使用

```bash
npm install
npm link            # 全局命令 md2html

md2html article.md                  # → article.html（完整排版：头卡+页脚都在）
md2html article.md -t moyu --open   # 指定主题并自动打开预览
md2html article.md -w --open        # 监听变更实时重新生成
md2html ui article.md -t deepblue   # 浏览器编辑器：编辑+实时预览+⌘S保存+一键复制
md2html article.md --stdout         # 仅输出正文 HTML 片段（完整含头尾）
md2html article.md --no-header --no-footer  # 连 HTML 也不渲染头尾
md2html --list-themes               # 查看可用主题
```

「复制到公众号」按钮复制的内容**自动剔除头卡与页脚**（公众号标题走后台标题栏）——预览页所见是完整排版，粘贴到后台的只有正文。`publish` 草稿同理。

浏览器编辑器（`md2html ui`）：左编辑右预览、主题即时切换（记忆在浏览器）、⌘S 保存回原文件、"复制到公众号"一键富文本复制；服务仅绑定 127.0.0.1，只读写启动时指定的那个文件。

可用主题（6 套）：`moyu` 摸鱼绿 / `redwhite` 红白色系 / `deepblue` 深海蓝 / `orange` 活力橙 / `grape` 暗夜紫 / `peach` 蜜桃粉。

发布流程：打开预览页 → 点「复制到公众号」→ 公众号后台 ⌘V。

## 发布到公众号草稿箱（一行命令）

```bash
# 首次配置凭据（公众号后台「设置与开发 → 基本配置」获取，IP 白名单需包含本机出口 IP）
echo '{ "appid": "你的AppID", "secret": "你的AppSecret" }' > ~/.md2html/config.json
# 或环境变量：export MD2HTML_APPID=xxx MD2HTML_SECRET=xxx

md2html publish article.md -t deepblue             # 渲染 → 图片转存 → 写入草稿箱（不群发）
md2html publish article.md --cover ./cover.png     # 指定封面（默认取文内第一张图）
md2html publish article.md --author 歆晨 --digest "摘要"
```

- 正文图片自动转存微信（支持外链 URL、本地相对路径、data URI）；草稿不允许外链图，这是必须步骤；
- 元数据支持 frontmatter：`title / author / digest / cover / theme / date / header / footer`，优先级 CLI 参数 > frontmatter > 自动兜底（标题取 h1/文件名，摘要取首段前 120 字）；
- **草稿正文自动剥离头卡与页脚**（与复制按钮一致）；`--no-header` / `--no-footer` 可连 HTML 渲染一并去掉；
- 需要**已认证**账号（未认证个人订阅号一般没有草稿/素材接口权限，报 48001 就是这个原因）；群发永远手动，在后台完成。

## 开发

```bash
npm test                      # 快照 + 单测
npm run update-snapshots      # 结构有意变更后更新快照
npm run build:bin             # 本机打包全部 5 个平台二进制到 dist/
npm run build:bin -- macos-arm64 win-x64   # 只打指定目标
node scripts/smoke-test.mjs macos-arm64    # 二进制冒烟测试
```

结构：`src/`（parse → transform → render 纯函数管线）、`themes/`（designVars 色板 + 可选组件覆盖）、`bin/`（CLI 薄壳）、`scripts/`（打包与冒烟测试）。

CI（`.github/workflows/build.yml`）：推送后自动在 macOS / Linux(x64,arm64) / Windows 原生 runner 上跑测试、打包并冒烟验证，产物上传 artifact；打 `v*` tag 自动发布 GitHub Release。
