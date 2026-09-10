# M–O 轮总结（2026-09-09，进行中）

- **做到哪了**：M 阶段（英文默认 + 文案精简 + 排版修复 + /help 重排）完成，tag `m-english-done` = de1665b；N（轨线管理 + 解的查询）、O（MCP/widget）正在进行，完成后本文件会整体重写。
- **最后一个良好 tag**：`m-english-done`（de1665b）。
- **你要手动做的**：**`m-english-done` 可以部署了**（`git push origin main` 或先只推到这个 tag：`git push origin m-english-done:main`）。MCP 的 `locale` 已改为可选默认 `en`；widget 版本仍是 l-1（O 阶段才 bump，那时需重连连接器）。

## 生产站点检查（M.4，本轮开工前 curl）

origin/main 与本地 HEAD 一致（bb907f5，即上一轮结果已推送）。线上各路由：`/` 200（18.5 KB）、`/help` 200（25 KB）、`/vector-field` 200、`/embed?m=first&g=y*(1-y)` 200、`/robots.txt` 200、`/sitemap.xml` 200；`/` 的标题是「向量场教学工具 / Vector Field Tool」（中文在前——正是 M.1 要改的），`/mcp` 的 `resources/list` 返回 `ui://vector-field-tool/widget.html?v=l-1`。结论：线上就是最新提交，没有漏推的提交；「/help 看不到、首页还是旧版」应是缓存或 Vercel 构建尚未完成时的观察。

## M 阶段（tag `m-english-done` = de1665b，818 个测试：815 通过 + 3 预期失败）

| 项 | 做了什么 | 提交 |
|---|---|---|
| M.1 英文默认 | 站点默认 `en`，不再读 `navigator.language`，只有 `?loc=zh` 才中文；`<html lang>` 随页面语言；MCP `locale` 改为可选、默认 `en`（description 规则保留；H2.9 的"漏传即报错"测试改为"漏传得英文摘要"）；README 全英文重写（docs/*.md 与 CLAUDE.md 注明为内部中文工作笔记）；扫描 app/、components/、lib/ 的硬编码中文并入表或改英文（页面标题、meta、OG 图改为英文在前）；CLAUDE.md 新增"内核冻结"一节，列出 J 轮各启发式常数及其作用 | 4f211b9, 78ce1a5, 4059958, c4b491e, de1665b |
| M.2 排版 | 左栏 `flex: 0 1 320px; min-width: 280px`，标签/复选框文字允许换行，按钮/下拉/输入满栏宽；ⓘ 按钮保持自身宽度、滑块边距、单行预设说明不再撑宽页面 | c724f06, 014e9cd |
| M.3 文案 | 顶部长句删除，改为一行短说明 + Help 链接；画布下只留 `x ∈ […], y ∈ […] (equal scale)`，操作提示串删除；「以下结果按范围…」缩成 `Results for …` + ⓘ；语法说明默认不显示、只在解析出错时随错误显示；箭头标签 `Arrows` / `Uniform` / `Scaled`；等比复选框只叫 `Equal scale` + ⓘ（取消勾选的常驻警告保留）；预设说明压到一行 + ⓘ；平衡点 caveat 折叠成短句 + ⓘ（`(0, 0) center or weak spiral (linearization cannot tell) ⓘ λ = ±i tr = 0, det = 1`），常数解/唯一性/非自治/类型 caveat 同样折叠；**MCP 摘要与 structuredContent 一字未删**（tools 测试未改） | b205042, a05bde8 |
| M.4 帮助页 | 删掉的解释全部收进 `/help`，按「操作 / 记号 / 怎么读结果」重排（嵌入、Claude 两节仍在后面） | af9d038 |

### M 阶段浏览器验收（编排者，`next dev`，会话浏览器面板）

- 1280×800、1440×900、768×1024、375×812 × 中/英各一遍：`.vf-form` 内无元素 `scrollWidth > clientWidth`，无标签/按钮/段落越出表单边界，无页面横向滚动；768 与 375 为单列（表单在上）。
- 英文页：无顶部长句，Help 链接存在，画布下只有 `x ∈ [-4.17, 4.17], y ∈ [-3, 3] (equal scale)`，结果行 `Results for x ∈ [-3, 3], y ∈ [-3, 3] ⓘ`，语法说明默认隐藏、输入 `xy` 出错时随错误显示（"Unknown symbol "xy". Did you mean "x*y"? …"），`Arrows` / `Equal scale` 标签，4 个 ⓘ（预设说明、等比、结果范围、平衡点 caveat）点击均展开对应全文。
- 中文页（`?loc=zh`）同样无截断；默认页 `<html lang="en">`，中文页 `zh-CN`。
- 集成代理另用生产构建验证：默认页正文前 2 KB 无中文（只剩语言切换器的"中文"字样）、`?loc=zh` 为中文；`/embed` 有 `frame-ancestors *`、`/widget` 无 frame 头；smoke 19/19；不带 `locale` 的 `analyze_system` 调用返回英文摘要而非 isError。
