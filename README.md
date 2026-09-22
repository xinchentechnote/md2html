# md2html

Markdown → 微信公众号排版 HTML 的 CLI 工具：主题化、样式全内联、粘贴不丢格式。设计与方案见 [docs/DESIGN.md](docs/DESIGN.md)，执行进度见 [TODO.md](TODO.md)。

## 使用

```bash
npm install
npm link            # 全局命令 md2html

md2html article.md                  # → article.html（带「复制到公众号」按钮的预览页）
md2html article.md -t moyu --open   # 指定主题并自动打开预览
md2html article.md -w --open        # 监听变更实时重新生成
md2html article.md --stdout         # 仅输出正文 HTML 片段
md2html article.md --no-footer      # 不追加一键三连页脚
md2html --list-themes               # 查看可用主题
```

可用主题（6 套）：`moyu` 摸鱼绿 / `redwhite` 红白色系 / `deepblue` 深海蓝 / `orange` 活力橙 / `grape` 暗夜紫 / `peach` 蜜桃粉。

发布流程：打开预览页 → 点「复制到公众号」→ 公众号后台 ⌘V。

## 开发

```bash
npm test                      # 快照 + 单测
npm run update-snapshots      # 结构有意变更后更新快照
```

结构：`src/`（parse → transform → render 纯函数管线）、`themes/`（designVars 色板 + 可选组件覆盖）、`bin/`（CLI 薄壳）。
