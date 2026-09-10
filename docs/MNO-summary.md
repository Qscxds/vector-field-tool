# M–O 轮总结（2026-09-09）

- **做到哪了**：M（英文默认 + 文案精简 + 排版修复 + /help 重排）→ N（轨线单条删除 / 撤销 / 长按删除 + 初值输入 + 解的查询 + N.3 六条修复）→ O（`query_solution` 描述、widget o-1、模拟主机实测、smoke 更新）三个阶段全部完成，三个 tag 都打了：`m-english-done`（de1665b）、`n-features-done`（ec8329a）、`o-mcp-done`（8e54eef）。按简报要求本轮没有跑大规模对抗式审查：M、N 在会话自带浏览器面板逐条验收，O 用本地模拟主机跑通 widget。最终门禁（8e54eef）：tsc 0 错误、36 个测试文件、883 通过 + 2 预期失败（共 885）、build 通过、本地生产构建 smoke 20/20。main 直线，`l-mcp-done..HEAD` 共 25 个提交（其中 6826d02、bb907f5 是上一轮的 docs 提交；本轮 23 个，加上本文档所在的 docs 提交）。
- **最后一个良好 tag**：`o-mcp-done` = 8e54eef（本文档提交之前的 main HEAD）。往前依次是 `n-features-done`（ec8329a）、`m-english-done`（de1665b）、`l-mcp-done`（1e825bc）。
- **你要手动做的**：(1) **推 origin 就是 Vercel 生产部署**——编排者推不了（`git push` 被会话的权限分类器拦下，与上一轮相同），要你来：`cd E:\project\vector-field-tool && git push origin main && git push origin m-english-done n-features-done o-mcp-done`；(2) widget 版本 l-1 → o-1，**部署后必须在 Claude 里断开并重新连接连接器**（连接器缓存了带 `?v=l-1` 的资源 URI，否则 widget 空白 / "Resource not found"）；(3) 部署后跑 `npm run smoke -- https://tools.studycase.net/mcp`，应 20/20、7 个工具、widget uri `?v=o-1`；(4) Claude 实机：`query_solution` 是否被先调用、「先调工具」规则、widget 里的删除 / 撤销 / 查询标记（验证清单第 9–12 步），今晚没法替你做；(5) 报告里没在真机上验证的：悬停高亮只在模拟主机里看到过（会话面板隐藏时 N 阶段的 rAF 不触发）、真实触屏的长按删除、widget iframe 内的 Ctrl+Z、折叠文案之后 Google Sites 里的 iframe 高度。

**`m-english-done` 可以部署了；`o-mcp-done` 同样通过全部门禁，可整体部署**

---

## 生产站点检查（M.4，本轮开工前 curl）

origin/main 与本地 HEAD 一致（bb907f5，即上一轮结果已推送）。线上各路由：`/` 200（18.5 KB）、`/help` 200（25 KB）、`/vector-field` 200、`/embed?m=first&g=y*(1-y)` 200、`/robots.txt` 200、`/sitemap.xml` 200；`/` 的标题是「向量场教学工具 / Vector Field Tool」（中文在前——正是 M.1 要改的），`/mcp` 的 `resources/list` 返回 `ui://vector-field-tool/widget.html?v=l-1`。结论：线上就是最新提交，没有漏推的提交；「/help 看不到、首页还是旧版」应是缓存或 Vercel 构建尚未完成时的观察。

| 路由 | 状态 | 类型 | 大小 |
|---|---|---|---|
| `/` | 200 | text/html | 18518 B |
| `/help` | 200 | text/html | 25029 B |
| `/vector-field` | 200 | text/html | 22292 B |
| `/embed?m=first&g=y*(1-y)` | 200 | text/html | 19053 B |
| `/robots.txt` | 200 | text/plain | 105 B |
| `/sitemap.xml` | 200 | application/xml | 457 B |

---

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

---

## N 阶段：轨线管理 + 解的查询（tag `n-features-done` = ec8329a）

**怎么做的**：NA（查询内核 + `query_solution` 工具 + N.3 六条）直接在 main 上做；NB（轨线 store / 命中判定 / 删除 / 撤销 / 初值输入）在 worktree `E:\project\vft-wt\n2`（分支 `wip/n2`）并行，rebase 后 `--ff-only` 合入（labels.ts 三处键联合冲突，无 fixup 提交，合入时 867 个测试）；NC（查询面板 + 画布标记）在两者之后于 main 上做；编排者浏览器验收后加一个防护提交并打 tag。

| 项 | 做了什么 | 提交 |
|---|---|---|
| N.1 复现 | NB 在生产构建里复现：「清除」对点击加的轨线本身有效，但链接 / 预设的 `traj` 种子在改快照时刻 t₀ 后会回来——hook 的种子 effect 以含 snapshotT 的 systemKey 为键、每次都重新追踪 `initialTrajectoryStarts`。**是 bug**（清掉又被种回），不是按钮失灵 | 141beed |
| N.1 修复 + 命中判定 | 固定轨线改为纯 store（`lib/trajectory-store.ts`：起点是唯一真相，曲线由注入的 trace 派生，add / delete / clear 的撤销历史 `HISTORY_LIMIT` = 20）；systemKey 变或新种子数组 → 重置为种子；新输入 `retraceKey`（网页外壳传 snapshotT）→ 只重追踪**当前**起点，清掉的不再回来（回归测试）。`lib/trajectory-hit.ts` 在屏幕像素下算点到折线段的最短距离（`HIT_THRESHOLD_PX` = 8，与缩放无关；推导测试：400 px / [−2, 2] 视口里 5 px 命中、12 px 不命中，同一世界偏移在 100 px/单位命中、200 px/单位不命中，端点距离，多条取最近） | 141beed |
| N.1 删除 / 撤销 / 长按 | 点击已固定轨线（8 px 内）→ 删除该条，否则新增；悬停在可删轨线上：预览抑制、覆盖层 4 px 加粗高亮、光标 pointer、提示 "Click to remove this trajectory" / 触屏 "Hold to remove this trajectory"（双语）；`Undo` 按钮 + window 级 Ctrl/Cmd+Z（纯 `lib/undo-key.ts`，焦点在输入框内时忽略）；Clear 是一步可撤销操作；长按走既有 longPress → onClickWorld 路径，固定轨线上删、空白处固定（reduceGesture → longPress → clickAction 流程有测试，`lib/gestures.ts` 未动）；`traj` 参数随三种操作变化 | 58d91d6 |
| N.2 初值输入 | "Initial value" 字段组（一阶 t₀ / y₀，平面 x₀ / y₀）+ `Add solution`（两个输入框里按 Enter 也触发）；纯 `parseInitialValue`（`lib/initial-value.ts`：有限小数、|v| ≤ `MAX_ABS_VALUE` = 1e6，报第一个出错的字段）；加入走同一个 addTrajectory：同样的 trace、撤销条目、`traj` 编码 | 69bf145 |
| N.2 查询内核 | `lib/core/query.ts`（纯）`querySolution(sys, start, target, opts)`：两个方向在调用方的停止盒内积分；kind "time" 从起点重新积分到恰好 t*（时间误差 0）；kind "x" / "y" 对折线每个变号段用 Brent 在**时间**上求根，每次试探从括号左端的已接受状态重新积分，从不线性插值；误差估计 = `TOLERANCE_SAFETY`(10) ×（atol + rtol\|p\|）（坐标命中再加 \|dp/dt\| × 时间误差）；note 永远是键（ok / not_reached_in_span / stopped_before_target / possibly_more_beyond_span / target_is_start）。8 个推导测试：e² 在 1e-5 内且在自身误差估计内、ln 2、ln 9、简谐振子 π/2 + kπ 双向 1e-6 内 + possibly_more_beyond_span、y² 的爆破（外壳的盒子里 left_box 于 t = 59/60；巨大盒子上 singular 于 1 ± 0.01）、e^−t 永远到不了 −1（forward completed / backward left_box）、time kind π → (−1, 0)、超出可达 → stopped_before_target（tEnd 10）、target_is_start、精确命中已存点 | 25d1f9c |
| N.2 MCP 工具 | 第 7 个工具 `query_solution`（mode first / diff / system / second，t0 或 x0 + y0，`target {kind: t\|x\|y, value}`，tSpan 默认 20 上限 1000，范围，locale 可选）；一阶的 kind t 映射到横坐标、kind x 给可读 isError；停止盒 = 视图的 20 倍（与外壳一致）；Scene kind "query_solution" + `Scene.query`；措辞共用 `lib/labels-query.ts`；drawScene 给每个命中画标记；10 个协议级测试（双语 logistic、second、diff、输入错误）；smoke 改为 7 个工具 + 一次 `query_solution` 调用 | 4043f89 |
| N.2 查询面板 + 标记 | 网页外壳 "Query the solution" 字段组：已固定起点的下拉（最新加入的预选，纯 `selectedTrajectoryIndex` 规则）、kind 下拉（一阶 t / y，平面 t / x / y）、值输入、`Query` 按钮；调用与固定轨线**同一套**规则（`fixedStopBox`(输入范围)、`CLICK_TSPAN` = 50、t0 = snapshotT、h 0.05、rtol 1e-6 / atol 1e-9）+ App 侧 2 s 墙钟 checkpoint；命中按误差估计的 2 位有效数字四舍五入（`lib/query-panel.ts`）、note 句、两条积分腿（far-box / 非自治措辞、非唯一句）、精度句 "crossings of the NUMERICAL solution"；结果以方程 + 输入范围 + 快照时刻为键，任一变化即丢弃，被查询的轨线删除 / 清除后标记与文字一起消失（hook 的 `queryStart` 门）；`components/drawScene.ts` 把每个命中画成 #be123c 实心菱形 + 白色光环 + "(h, y)" 坐标标签（会溢出时放左侧）；widget 的 live 场景也带标记；23 个推导测试 | 723d62d |
| N.3 (a) | 删除 `lib/core/slope-field.test.ts` 的 `it.fails`（预期失败 3 → 2） | ece23f4 |
| N.3 (b) | 非自治场景的 `reached_equilibrium` 在 trace_trajectory、query_solution 和 `lib/labels-trajectory`（两个外壳）改用中性措辞 `tool.stoppedNonAutonomous`（"stopped after the speed fell close to zero at that time … for a non-autonomous system this is not an equilibrium"），积分器和状态值不动；测试 x' = 0, y' = cos t 从 (0, 0) 到 π/2：状态仍是 reached_equilibrium，文字不说平衡点 | ece23f4 |
| N.3 (c) | `equilibria.ts` 四叉树停止规则；x' = xy, y' = x² − y：细分格子 1024（封顶）→ 254，`refineCapped` false；x⁷ 在 [−100, 100]² 上的守卫（螺旋 + 两个鞍点）通过。**时间仍 ~1.1 s，没到 300 ms**（见 decisions / open-questions） | ece23f4 |
| N.3 (d) | `decodeState` 对 `1e999`：解析器白名单本来就拒绝 mathjs 的非有限 ConstantNode，四种模式各加一条推导测试（invalidExpression），无代码改动 | ece23f4 |
| N.3 (e) | PNG 页脚：输入范围与当前范围不同时打 "entered … · shown …"（`exportFooterText` 第 5 个参数 `enteredBox`），相同时只打一次；网页外壳的调用点（传 `compiled.box`）在 O 补上 | ece23f4, 643457b |
| N.3 (f) | `Scene.refineCapped` + `equilibriaNotices`：警告是 possible_continuum / region_of_equilibria 时不再打 refineCapped 说明；analyzePlanar 与 computeFeatures 设置；网页外壳 hook 的一行在 O 补上 | ece23f4, 643457b |
| 验收修复 | 画布 `setPointerCapture` 对非活动指针抛 NotFoundError（验收用合成 PointerEvent 触发）→ try/catch 防护 | ec8329a |

测试数：M 结束 818（815 + 3）→ NA 844（842 + 2）→ N 集成 867 → NC 882（880 + 2）。ec8329a 只加了 try/catch，没有单独报测试数。

---

## O 阶段：MCP 与 widget（tag `o-mcp-done` = 8e54eef，885 个测试：883 通过 + 2 预期失败）

| 项 | 做了什么 | 提交 |
|---|---|---|
| N 遗留三条 | (a) `useInteractiveScene` 把 `refineCapped: features.refineCapped` 放进 Scene（网页外壳也显示上限说明）；(b) VectorFieldApp 给 `exportFooterText` 传 `compiled.box`（缩放后 PNG 页脚打两个范围）；(c) `QueryHit.speed`（命中处 \|F\|）+ 导出的 `timeUncertainty(hit)` = max(error.t, error.position / speed)，`lib/query-panel.ts`（网页）和 `lib/labels-query.ts`（工具摘要 / widget）都按它显示 / 四舍五入交点时间（此前打到 12–13 位小数）；推导测试 | 643457b |
| widget o-1 | widget 把共享 hook 的 highlight / cursor 传给画布（悬停固定轨线高亮）、`Undo` 按钮 + Ctrl/Cmd+Z（共用 `lib/undo-key`）；`WIDGET_VERSION` l-1 → o-1（server.ts、server.test.ts、smoke.mjs、README 一行）；模拟主机加 `query_solution` 场景 | 2b2ac8c |
| 描述 | `query_solution` 的 description 明写「某时刻的值 / 何时到某值」的问题一律调用本工具、"never evaluate that closed form mentally"，tools.test.ts 锁定；7 个工具全部 CALL-FIRST 前缀 + locale 可选默认 en；caveat 未动 | c89f24a |
| 模拟主机发现 | hook 的 live Scene 从不带 `secondOrder`，widget 交互路径下 analyze_second_order 的结果缺降阶那一行 → hook 加纯数据的 secondOrder 透传（同 query）；o-1 尚未发布，不再 bump | 8e54eef |

硬限制：`git diff n-features-done -- app/layout.tsx app/mcp/route.ts docs next.config.ts` 为空；`_meta.ui.csp` 三个域名字段与 assetPrefix 不动。O 共改 15 个文件（+151 / −24）。

**回滚**：`git checkout n-features-done`（ec8329a）。该 tag 的 widget 是 l-1，回滚后同样要重连连接器。

---

## 验收结果

### M.2 排版实测（MB，生产构建 `next start -p 3610`，JS 检查：`.vf-form` 内无元素 `scrollWidth > clientWidth + 1`、无标签 / 按钮 / 段落的矩形越出表单左右边界、`document.scrollWidth <= innerWidth`）

| 视口 | 语言 | 表单宽度 | 溢出元素 | 被裁元素 | 页面横向溢出 |
|---|---|---|---|---|---|
| 1280×800 | zh / en | 320 px（43..363） | 无 | 无 | 无 |
| 1440×900 | zh / en | 320 px（130..450） | 无 | 无 | 无 |
| 768×1024（单列） | zh / en | 705 px（24..729） | 无 | 无 | docW 753 ≤ 768 |
| 375×812（移动端仿真） | zh / en | 327 px（24..351 = 375 − 2×24） | 无 | 无 | docW == innerWidth |

修复前（014e9cd 之前）英文页在 375 宽因单行预设说明的 nowrap 被撑到 850 px；ⓘ 按钮继承了 `width: 100%`（320 px 宽）；滑块 2 px 默认边距溢出标签 2 px。每个宽度 × 语言各截了 0.5 倍缩放的截图；视口已复位、服务器已停。另在浏览器里确认：等比 ⓘ 展开（aria-expanded true，44 px 命中高度）、常数解 ⓘ 显示完整句子、范围行 "t ∈ [0, 10], y ∈ [-3.097, 4.097] (equal scale)"、结果行 "Results for t ∈ [0, 10], y ∈ [-0.5, 1.5] ⓘ"、表达式能编译时语法提示不出现、Help 链接为 `/help?loc=en`、`/help` 200。编排者的 M 验收见上文「M 阶段浏览器验收」。

### N 阶段（编排者，`next dev`，会话浏览器面板；面板隐藏时 requestAnimationFrame 不触发，因此悬停高亮无法在此验证）

- 初值输入：x₀=1, y₀=0 → Add solution → "Clear trajectories (1)"；再加 (2, 0) → (2)；地址栏 `?loc=en&traj=1,0;2,0`。
- 撤销：Undo 按钮与 Ctrl+Z 各撤销一步（2 → 1）；Clear 后 0，Undo 后恢复 1；URL 的 traj 随每步变化。
- 单条删除：用面板的真实点击点在简谐振子轨线（世界点 (0, 1)）上 → 计数 1 → 0、URL 的 traj 消失。合成 PointerEvent 因 `setPointerCapture` 对非活动指针抛 NotFoundError 而走不通，已加 try/catch 防护（ec8329a）。
- 查询：选中轨线 (1, 0)，kind x，value 0 → 列出 t = ±(π/2 + kπ) 的全部交点（t 到 ~1e-11 括号宽度，y = ±0.99999… ±1.0e-5），说明句 "Three or more crossings in one direction look periodic: more crossings may exist beyond the integrated span."，精度句说明数值解与再积分；两条积分腿的终止状态各一行。
- NB / NC 各自在生产构建上的 DOM 驱动验证：Clear → 改 t₀ 后仍是清空的；Undo 恢复；点固定轨线的起点删除、URL 的 traj 缩短；初值校验信息；简谐振子 (1, 0) 查 y = 0 → 31 个命中，x = ±1.000000 (±1.0e-5)，note possibly_more_beyond_span，基础画布上 186 个标记色像素；dy/dt = y 从 (0, 1)（中文界面）查 t = 2 → y = 7.389060 (±7.7e-5)（e² = 7.389056）；t = 10 → not_reached_in_span 并列出两条腿（正向在 4.09 离开远盒、逆向完成到 −50）；"abc" → 校验句；Clear → 结果消失、下拉禁用并显示空态选项。
- 遗留交给 O（都已在 643457b 做掉）：hook 的 scene 未带 refineCapped（网页外壳）；PNG 页脚未传输入范围；交点时间显示到 12 位小数（时间误差只是 Brent 括号宽度，应取 max(括号宽度, 位置误差 / 速度)）。

### O 阶段（模拟主机：`BASE_URL=http://localhost:3810` 构建，`next start -p 3810`，`serve.mjs --mcp http://localhost:3810/mcp`，host 3520 / sandbox 3521，`?inspect=1`）

- 握手：initialize → `resources/read` 的 `ui://vector-field-tool/widget.html?v=o-1`（13.3 KB，`<base href="http://localhost:3810/">`，CSP 带 connect / resource / baseUri 三个域名）→ `ui/initialize` → initialized；widget 显示 "Connected, waiting…"。控制台只有已知的 zod eval CSP 探测。
- `analyze_first_order sqrt(y)`（en）：斜率场、140 个灰色圆环、"Constant solution y = 0: domain edge, left. ⓘ"；真实点击 ⓘ 展开定义域边界句和 Lipschitz / 唯一性句；类型识别同样折叠带 ⓘ。
- `analyze_system y / -x + sin(t)`（zh 场景）："非自治系统：t = 1.5 时刻的快照，不做平衡点分析 ⓘ"，无平衡点。
- `analyze_second_order x'' + 0.5x' + x = 0`：稳定螺旋 λ = −0.25 ± 0.9682i、tr / det；降阶那一行在 8e54eef 之前缺失、重建后出现。
- `query_solution`（x' = y, y' = −x 从 (1, 0)，x = 0，tSpan 10）：6 个红色菱形标记带标签、6 行命中、"possibly more beyond the span" 说明、精度句；工具文字现在是 t = 1.570796 (±1e-5)。
- 交互（真实指针）：悬停预览有画（这次 rAF 在面板隐藏时也触发了）、点击固定（t = ±50 两行）、悬停固定轨线变橙色高亮、点击它删除、Undo 恢复、滚轮缩放 → [−3.277, 3.26]×[−2.221, 2.224]、拖动平移 → [−4.014, 2.522]×[−1.801, 2.644]、6 次 size-changed 通知（最后 720×925）。每一步控制台无 error。
- 限制：面板 455 px 高会切掉 widget，检查时仿真了 1000×1500 视口并在之后复位；find / read_page 看不进沙箱 iframe（跨源），文字来自 `mock.readText()` 和截图。
- smoke：`node scripts/smoke.mjs http://localhost:3810/mcp` 在 8e54eef 重建前后都 20/20，含 "tools/list has 7 tools"、"tools/call query_solution"（y(2) ≈ e²）、"widget asset URLs are absolute"（真 PASS，非 SKIP）和 o-1 URI。

---

## 验证输出（main = 8e54eef，2026-09-09 23:38，写本文档前重跑）

```
$ npm run typecheck        （tsc --noEmit）
(无输出) exit 0

$ npm test                 （vitest run，v4.1.11）
 Test Files  36 passed (36)
      Tests  883 passed | 2 expected fail (885)
   Duration  31.92s
exit 0

$ npm run build            （Next.js Turbopack，本地无 BASE_URL）
✓ Generating static pages using 13 workers (11/11) in 3.1s
Route (app)
┌ ƒ /
├ ○ /_not-found
├ ƒ /embed
├ ƒ /help
├ ○ /icon.svg
├ ƒ /mcp
├ ○ /opengraph-image
├ ○ /robots.txt
├ ○ /sitemap.xml
├ ƒ /vector-field
└ ○ /widget
exit 0

$ git log --oneline l-mcp-done..HEAD   （本文档提交之前）
8e54eef [O] widget: keep the second-order reduction line in the live summary
c89f24a [O] tools: query_solution description says such questions must call it, never a closed form
2b2ac8c [O] widget: hover highlight, Undo button, Ctrl+Z; WIDGET_VERSION l-1 -> o-1
643457b [O] fixes: refineCapped in the web shell scene, PNG footer entered range, crossing-time precision
ec8329a [N] canvas: tolerate setPointerCapture failures
723d62d [N] app+widget: solution query panel and markers
69bf145 [N] app: initial-value inputs
58d91d6 [N] trajectories: click to remove, hover feedback, undo stack, long-press delete
141beed [N] trajectories: clear fixed, screen-space hit test
ece23f4 [N] fixes: it.fails removed, non-autonomous status wording, quadtree stop rule, 1e999 rejected, PNG footer ranges, no refineCapped on continua
4043f89 [N] tools: query_solution
25d1f9c [N] query: solution query kernel (time and coordinate targets by re-integration)
05a67e3 [docs] MNO summary: M stage done, m-english-done is deployable; production check
de1665b [M] CLAUDE.md: kernel freeze and the heuristic constants
c4b491e [M] text: no hard-coded Chinese outside the label tables
4059958 [M] README: English rewrite
78ce1a5 [M] tools: locale optional, defaults to en
4f211b9 [M] site: English by default; language only from the URL
014e9cd [M] layout: info toggle keeps its own width, no horizontal overflow at 375 / 768
af9d038 [M] help: controls / notation / reading the results
a05bde8 [M] shells: folded caveats with full text behind an info toggle (data untouched)
b205042 [M] copy: labels trimmed, explanations moved to help, disclosure component
c724f06 [M] layout: left column fits its content in both languages
bb907f5 [docs] IJKL summary: push status (not pushed; the push is the owner's step)
6826d02 [docs] IJKL summary, decisions, open questions; README and CLAUDE.md for the I-L state

$ git tag
a-core-done b-tools-done c-render-done d-webshell-done e-widget-done f-forms-done
g-render-done g-widget-done h1-deploy-ready h2-math-done h2-reviewed i-notation-done
j-math-done k-website-done l-mcp-done m-english-done n-features-done night-final
o-mcp-done p0-verified s-spike-done
```

测试数变化：L 结束 811（808 + 3）→ M 结束 818（815 + 3）→ N 结束 882（880 + 2，N.3 (a) 删掉一个 `it.fails`）→ O 结束 885（883 + 2）。

## 验证清单（按「最快发现问题」排序；每步失败回滚到哪个 tag）

本轮三个 tag 在提交线上是顺序的（M → N → O），没有上一轮那种交错，所以「退掉 O 保留 N」= `n-features-done`，「退掉 N、O 保留 M」= `m-english-done`，「全退」= `l-mcp-done`。任何回滚到 `n-features-done` 或更早的 widget 都是 l-1，同样要在 Claude 里重连连接器。

1. **本地三绿** `npm run typecheck` / `npm test` / `npm run build` —— 1 分钟内知道代码是否完整；`npm test` 应是 883 通过 + 2 expected fail（885）。失败：`git checkout n-features-done`（应 880 + 2）；再不行 `m-english-done`（815 + 3）；再不行 `l-mcp-done`。
2. **打开 `/vector-field`**：不带参数就是英文（`<html lang="en">`，顶部只有一行 "Slope fields, phase portraits, equilibria." + Help 链接，画布下只有 `x ∈ […], y ∈ […] (equal scale)` 一行，结果行 `Results for … ⓘ`）；`?loc=zh` 才是中文（`zh-CN`）；语言下拉切换后 URL 带 `loc`。左栏在 1280 和 375 宽、中英两种语言下没有被截断的标签 / 按钮文字、页面不能横向滚动（375 为单列）。失败：`l-mcp-done`（M 之前，但那是中文默认的旧站）。
3. **ⓘ 开关**：预设说明、Equal scale、Results for、平衡点 caveat 的 ⓘ 点击各展开全文（简谐振子预设应展开「仅凭线性化无法区分真正的中心与极缓慢的螺旋…」那段），Escape 关闭；输入 `xy` 时语法说明出现在错误旁边、改回后消失；取消 Equal scale 时常驻警告仍在。失败：`l-mcp-done`。
4. **初值 + 删除 + 撤销**（简谐振子预设，或 x' = y, y' = −x）：x₀ = 1, y₀ = 0 → Add solution → 按钮变 "Clear trajectories (1)"、URL `traj=1,0`；再加 (2, 0) → (2)；悬停在轨线上应加粗且光标变 pointer（本轮只在模拟主机里看到过，网页版请你看一眼），点击它 → (1)、URL 变短；Undo → (2)；Ctrl+Z → (1)；Clear → (0)；Undo → (1)。换一个非自治预设后改 t₀，清掉的轨线不应回来。失败：`m-english-done`。
5. **查询**：(a) 简谐振子 (1, 0)，kind x，value 0 → 正负两向的 t = ±(π/2 + kπ)，说明句 "Three or more crossings in one direction look periodic…"，画布上每个交点一个红色菱形 + 坐标标签；(b) logistic `y*(1-y)`，t₀ = 0, y₀ = 0.1，kind y，value 0.5 → t ≈ 2.197（ln 9 = 2.197225）；(c) `y^2`，t₀ = 0, y₀ = 1，kind t，value 2 → "stopped before the target" 那一句，正向腿显示在 t ≈ 0.98（= 59/60，y 到达 20 倍盒子的边）离开远盒——**不能是空结果**；(d) 删除被查询的轨线 → 标记和文字一起消失。失败：`m-english-done`。
6. **PNG 下载**：缩放后页脚同时有 "entered … · shown …" 两个范围，复位时只有一个。失败：`n-features-done`（网页外壳的调用点是 O 的 643457b；退到 N 只打一个范围，不会打错的）。
7. **`/embed` 嵌进 Google Sites**：`/help` 嵌入一节的 iframe 片段；应显示画布 + 表单（含新的初值 / 查询字段组）。折叠后页面变短，帮助页写的 1280 / 1260 px 可能偏高，按实际改 `EMBED_HEIGHT_*`。失败：先 `curl -I https://tools.studycase.net/embed` 看 `frame-ancestors *` 且无 `X-Frame-Options`；代码回滚 `l-mcp-done`。
8. **手机 / 触屏**：375 单列；长按空白 = 固定，长按已固定轨线 = 删除（轻点轨线后应出现 "Hold to remove this trajectory"）；Undo 按钮可用。本轮没有真机测试。失败：`m-english-done`。
9. **Claude：断开并重新连接连接器**（widget o-1），「用 ping 发 hello」—— 链路。失败与代码无关（先查部署是否完成、`BASE_URL`）；代码回滚 `n-features-done`（widget 回到 l-1，同样重连）。
10. **Claude：「dy/dt = y, y(0) = 1, y(2) = ?」** —— 模型**必须先调用** `query_solution`（工具调用出现在任何推导之前），答案 ≈ 7.38906（工具给 7.389060 (±7.7e-5)；e² = 7.389056），widget 里一个红色菱形标记；接着问「y 什么时候到 2」→ 再调一次，t = 0.693147 (±1e-5 量级)（ln 2）。失败（模型仍心算闭式解）：这是 description 措辞的问题，回滚没有意义；把模型的原话记进 open-questions。
11. **Claude：「分析 2*t*y dt + (t^2+y^2) dy = 0」** —— 必须先调 `analyze_first_order`；widget 里 caveat 折叠成短句 + ⓘ，展开是全文；对照模型的转述，它读到的摘要应是完整 caveat（屏幕上省字，传给 AI 的不省）。失败：`l-mcp-done`。
12. **Claude：widget 交互**：悬停固定轨线高亮、点击删除、Undo 恢复；`x' = y, y' = −x` 从 (1, 0) 查 x = 0 → 6 个菱形标记。失败：`n-features-done`。
13. **`npm run smoke -- https://tools.studycase.net/mcp`** —— 20/20，7 个工具，`widget asset URLs are absolute` PASS 且指向你的域名，widget uri `?v=o-1`。失败：`n-features-done`（回到 l-1，smoke 期望也随之回到 l-1）；`[base-url]` 警告看 Vercel 构建日志。
