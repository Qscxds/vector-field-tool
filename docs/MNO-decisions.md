# M–O 轮决策记录（2026-09-09）

所有偏离《英文默认 + 文案精简 + 轨线管理 + 解的查询》简报的决定和理由，以及简报没有规定、由编排者或实现智能体拍板的细节。按阶段分组；智能体报告（scratchpad 的 m-agents / n-agents / o-report）是「实际做成了什么」的依据。

## 环境与工作树

- 会话仍落在 `E:\project\demo` 的 worktree 里，任务仓库是 `E:\project\vector-field-tool`，全部命令用绝对路径；demo 仓库一个字节没动。
- **并行用手工 worktree**（与上一轮相同）：M 阶段 MA 在 `E:\project\vft-wt\m1`（分支 `wip/m1`），MB 直接在 main；N 阶段 NB 在 `E:\project\vft-wt\n2`（`wip/n2`），NA 在 main、NC 在 NB 合入之后在 main。做完在 worktree 里 `git rebase main`，再 `git merge --ff-only`，历史直线。MA 的 rebase 只停一次（两个外壳的 `@/lib/labels` import 行：取 MB 的新 import 集合、去掉 MA 删掉的 `localeFromLanguageTag`）；NB 的 rebase 三处冲突都是 `lib/labels.ts` 的 `UiKey` 联合与双语表，取并集。两次都没有 fixup 提交。写本文档时 `git worktree list` 只剩 main，`wip/*` 分支已不存在。
- **MA 开工时工作树不干净**：5 个文件（app/site-locale.ts、app/widget/page.tsx、components/SitePage.tsx、components/VectorFieldApp.tsx、lib/url-state.ts）带着上一次同一任务的未提交改动。MA 逐行审过后保留，在其上完成 M.1 并作为第 1 个提交，没有丢弃。
- **行尾**：NA、NB 的 Python 编辑产生了 CRLF，两组提交都用原提交信息按 LF 重建（`diff --ignore-cr-at-eol` 为空）；NB 重建后的中间提交没有重跑 `npm test`（与 CRLF 版本逐字节相同 modulo CR）。MA 的 CLAUDE.md 提交有约 37 行只差空白（`--ignore-all-space` 只剩 10 处有意的删除），现在 CLAUDE.md 0 行 CRLF；本轮 docs 提交按行编辑。
- 智能体在 worktree 里只跑 typecheck + test，build 只在 main 合入后跑；M、N 各有一次集成验证（生产构建 + curl 头 + smoke）。

## M 阶段

- **M.1 `locale: null` 的含义改了**：`AppState.locale: Locale | null` 从上一轮的「没选过语言 → 跟浏览器」改为「链接里没有 `loc` → 英文」；`navigator.language` 不再读，只在注释里以 "never navigator.language" 出现；派生测试锁定「无 loc ↔ locale null」、encode null → ""、`loc=zh/en` 往返。`<html lang>` 服务端在每个路由都是 `en`，zh 页由 `useDocumentLang` 水合后改成 `zh-CN`（`<main lang="zh-CN">` 同时保留）。
- **`localeFromLanguageTag` 留着**：仍导出、仍有测试，但没有外壳用它。MA 为了不碰 MB 正在大改的 `lib/labels.ts` 而不删，记在 CLAUDE.md；语言 `<option>` 的文字也因此从 `siteText(locale).site.langZh/langEn` 取而不是加新的 labels 键（两张表都带原生名 中文 / English），VectorFieldApp 只改 3 行。
- **H2.9 测试反转**：`locale` 从必填改回可选默认 `en`，理由照简报——漏传的代价是英文摘要，而 isError 会把一个失败的回答送到学生面前。tools.test.ts 的 H2.9 测试改为：description 匹配 /defaults to en/ 且不匹配 /REQUIRED/、schema default "en"、`required` 里没有 locale、五个数学工具不带 locale 调用 isError 为假、`scene.locale` 为 "en"、文字非空且无 CJK。`scripts/smoke.mjs` 本来就总是显式传 locale、从没断言过缺 locale 的报错，所以没改；缺 locale 的行为用一次直接 curl 验证。
- **CJK 扫描改了什么**（一次性 node 脚本在 scratchpad，不入库；排除 labels.ts、site-text.ts、presets.ts 的表、labels-trajectory.ts、detect-form.ts、测试）：`app/vector-field/presets.ts` 的 9 条分节注释改英文（zh/en 预设表不动）；`bilingual()` / `SITE_NAME_BILINGUAL` 改为英文在前（"Vector Field Tool / 向量场教学工具"），页面标题、og:site_name、applicationName、OG 图的 alt 与绘制文字随之；`app/layout.tsx` og:locale `en_US`、alternate `zh_CN`。检查为干净的：lib/export-footer.ts、页面 metadata（都走 bilingual()）、错误提示、帮助页、app/mcp/*。剩余 39 处命中全是 presets.ts 的双语表条目；`components/Info.tsx` 一条 doc 注释里的 "Details" / "详情" 是注释不是字符串，留着。docs/*.md 与 CLAUDE.md 按简报不动。
- **折叠 = 显示，不是数据**：Scene / structuredContent / `app/mcp/tools.ts` 的摘要一个字没动，`app/mcp/tools.test.ts` 未改，这是「传给 AI 的不省」的证据。短句本身诚实：平衡点行是 `(0, 0) center or weak spiral (linearization cannot tell) ⓘ  λ = ±1i · tr = 0, det = 1`，「线性化分不出」在短句里；常数解短句用已有的 `stabilityShort` 标签（如 "domain edge, left"），完整句（含定义侧、分数幂提示、平台 / 探针说明、唯一性）在 ⓘ 后面；非自治用 `ui.timeDependentShort` + 全文；类型识别把结论句放在行上、证据与 caveat 放在后面。**警告不折叠**：possible_continuum、region_of_equilibria、none_found、非等比警告、非唯一预览提示、奇异采样说明全部常显。widget 折叠方式相同（同一份 `Folded` 数据）。
- **特征值缩写**：新的纯函数 `formatEigenvalues`——共轭对写 "±0.9682i" / "-0.25 ± 0.9682i"，其他情况列原样；负号用 `formatNumber` 的 ASCII '-' 而不是简报例子里的 Unicode 减号，与同一行的 tr / det 数字一致。
- **Info 组件**（`components/Info.tsx`）：真按钮（aria-expanded、aria-controls、aria-label = `ui.details`），Escape 关闭，负边距做出 44 px 命中区而不改变行高，面板是 `display: block` 的 span 以便合法地放在 `<p>` / `<li>` 里；`FoldedLine` = 短句 + ⓘ + 展开行。纯状态只是一个布尔开关，没写单元测试，在浏览器里验的。预设说明的 ⓘ 放在说明行内、不在 `.vf-form` 里。
- **布局数字**：`.vf-form` `flex: 0 1 320px; min-width: 280px; max-width: 100%`，子元素 `min-width: 0`；label / span / p 允许换行（`overflow-wrap: anywhere`、`white-space: normal`）；按钮 / 下拉 / 输入 `width: 100%; box-sizing: border-box`，ⓘ 与复选框除外；滑块 margin 0；800 px 以下单列不变。实测后的三处补丁（ⓘ 继承了 width 100% 变成 320 px 宽、滑块 2 px 默认边距溢出、单行预设说明的 nowrap 在 375 / 768 把页面撑到 850 px → 网格分区 `minmax(0, 1fr)`、说明行 `min-width: 0`）作为第五个 `[M] layout` 提交，没有改写三个后续提交下面的历史。
- **文案取舍**（`lib/labels.ts`，双语，键集合一致性测试）：`ui.subtitle` 删除，加 `ui.tagline`（"Slope fields, phase portraits, equilibria."）与 `ui.help` 链接（`/help?loc=<locale>`）；`shownRangeEqual/Filled` = 范围 + "(equal scale)" / "(filled)"，重复的 `ui.shownRange` 删除；**`ui.interactionHint / interactionHintTouch` 保留但只有 widget 显示**——Claude 里没有帮助页可去；`featuresBox` 只剩范围，解释进 `featuresBoxDetail`；语法提示只在编译失败时随错误框显示（`data-syntax-hint`），全文在 /help；`equalScale` 不再取 `{hv}`，`equalScaleDetail` 取；VectorFieldApp 不再用 `useCoarsePointer`。
- **帮助页重组**（`lib/site-text.ts` + `components/HelpContent.tsx`）：Controls（表单：预设、类型、范围、密度、箭头、等比 + 显示范围行、快照 t、清除、复制链接、PNG；鼠标；触屏）/ Notation（记号条目、一阶与二阶的写法及其数值检验 caveat、解析器的函数表、常数 / 分段 / 负底数幂）/ Reading the results（范围行、ⓘ 折叠说明、λ = a ± bi 的平衡点行、标记含灰色圆环、中心说明、类型识别分级、唯一性、快照、定义域边界、截断、最后一条轨线行），之后仍是 limits、embed、Claude。新增 site-text 测试断言每条被删掉的解释都在两种语言的帮助页里。
- **README**：完全英文重写（扫描 0 个 CJK 字符）；许可一节写 "No license file yet"，因为 package.json 是 private、仓库根没有 LICENSE；Cloudflare "DNS-only" 一行陈述的是简报的要求，域名的真实 DNS 配置从仓库里验不了。
- **CLAUDE.md 内核冻结一节**在 M 做了（简报把它列在 M 之前的总则里）：逐文件列出 uniqueness / slope-field / equilibria / jacobian / classify / detect-form / time-dependence / second-order 的常数和一句话作用，写明「未经独立验证的启发式，只有真实课堂失败驱动时才改」，极端盒子的 open-questions 保持现状。
- **M.4 结论**：线上就是最新提交（`/help` 200、`/` 200、widget l-1），没有漏推；「看不到」按缓存 / 构建未完成处理，没有改部署配置。
- **M 完成后单独提交了一次 docs**（05a67e3），让你在 N、O 没做完时就能只部署 M。

## N 阶段

### N.1 轨线管理

- **是 bug，不是缺功能**：NB 在生产构建里复现——「清除」对点击加的轨线有效，但链接 / 预设的 `traj` 种子在改快照时刻 t₀ 后回来，因为 hook 的种子 effect 以含 snapshotT 的 systemKey 为键、每次都重新追踪 `initialTrajectoryStarts`。修法不是补丁而是换结构：固定轨线放进一个纯 store（`lib/trajectory-store.ts`），**起点是唯一真相**，曲线由注入的 trace 派生；systemKey 变或换了种子数组 → 重置为种子；新增 `retraceKey`（网页外壳传 snapshotT）→ 只重追踪当前起点。所以**改快照时刻现在会重追踪所有当前起点**（种子和点击加的都在），而不是丢掉点击加的再重新种：链接的 `traj` 与页面一致，清掉的起点不可能回来。widget 的 systemKey 契约（新的工具结果重置为场景自带曲线）不变。
- **命中判定在屏幕坐标**（简报要求）：`lib/trajectory-hit.ts` 点到线段的最短距离，`HIT_THRESHOLD_PX` = 8，与缩放无关（推导测试覆盖同一世界偏移在不同像素密度下命中 / 不命中）。命中用扁平的轨线列表、每个起点固定 2 条（正向 / 逆向），与 App 的 `trajectories.length / 2` 计数一致；除不尽的列表什么都不命中。
- **一次点击不能既选中又删除**（NC 记录）：NB 交付的手势是「点固定轨线 = 删除」（提示文字和测试都锁定）。查询面板因此不用点击选中，而是：点空白处或 Add solution 加的轨线成为预选，下拉跟随最新加入（纯 `selectedTrajectoryIndex`：有人为选择且该起点仍在、之后没有新增时保持，否则最新）；删除被查询的轨线通过 hook 的 `queryStart` 门把结果连标记一起丢掉。要「点击选中」得先改删除手势（修饰键点击或模式切换），留给你定。
- **撤销深度 20**（简报 ≥ 10，`HISTORY_LIMIT`）；历史在重追踪后保留、在种子重置（改方程 / 载入预设）时丢弃；Clear 是一步可撤销操作。键盘监听放在 VectorFieldApp 的 window keydown 而不是 hook 里，让 widget 不会在宿主里抢 Ctrl+Z——O 阶段 widget 又用同一个 `lib/undo-key` 自己加了监听（只在 iframe 有焦点时生效）。
- **长按删除复用现有路径**：longPress → onClickWorld → clickAction，不加新的手势动作；`lib/gestures.ts` 不动，触屏与鼠标共用一条规则。代价："hold to remove" 提示只在轻点固定轨线（= 悬停预览）后出现，直接长按没有事先提示。
- **初值输入拒绝 |v| > `MAX_ABS_VALUE`（1e6，链接的上限）**并报 outOfRange，而不只是 "finite"：否则一个加进来的起点会从链接里悄悄消失。
- **setPointerCapture 防护**（ec8329a，编排者提交）：验收用 DOM 派发的合成 PointerEvent 时 `setPointerCapture` 对非活动指针抛 NotFoundError；真实点击不受影响。加 try/catch 后 tag 打在这个提交上。

### N.2 查询

- **时间目标是绝对的**：t* 相对于起点的 t0（默认 0；自治系统只关心 t* − t0，调用方可以传 t0 = 0 和相对 t*）。可达当且仅当 |t* − t0| ≤ 该方向**实际积分到**的时间；可达时从起点重新积分到恰好 t*（一个方向，tSpan = |t* − t0|），时间误差 0。**kind time 从不说 not_reached_in_span**：够不到的 t* 一律 stopped_before_target，由该方向的 status / tEnd 说是 span 结束（completed，意思是加大 tSpan）还是运行停了（left_box / blew_up / …）——这正是简报测试单的写法。
- **坐标目标从括号左端的已存状态重新积分**（简报的规定），用 Brent（Numerical Recipes zbrent）而不是二分：每个括号几次重新积分而不是约 40 次；停止条件 括号 < max(1e-12 |t|, 1e-14 tSpan) 或 60 次求值（`MAX_BRACKET_ITERATIONS`），最终括号宽度就是报告的时间误差。后果（NA 记录）：工具里 e² 的命中是 7.3890595（相对误差 4.6e-7，在 ±7.7e-5 的估计内），因为它从 h = 0.05 基础运行的括号左端状态出发；从起点直接重新积分会更准，但简报规定了括号左端。
- **误差模型 10 × 容差尺度**（`TOLERANCE_SAFETY`）：积分器每步接受时嵌入误差 ≤ sc = atol + rtol|p|，N 步以随机符号累加约 √N，10 覆盖 N ≤ 100 且无放大；穿过强扩张区域可能超出，所以处处叫「估计」，不叫上界。坐标命中再加 |dp/dt| × 时间误差。推导在 `lib/core/query.ts` 文件头。
- **note 永远是键**（ok / not_reached_in_span / stopped_before_target / possibly_more_beyond_span / target_is_start），外壳措辞；`possibly_more_beyond_span` 要求命中 ≥ 3 的那个方向状态是 completed（爆破或离盒的方向没有「更远」）。
- **y² 爆破测试的两种断言**：任何有限停止盒都先离盒（maxPosition = 1e6 × 盒子尺度），外壳的盒子给 left_box 于 t = 59/60；「积分器看到的」停止需要巨大盒子 + 长 span，那时步长坍缩（hMin = tSpan × 1e-12）被判 singular（场 1e16 > 1e3 × 参考速度），距 1 在 0.01 内。两种情况都精确断言，没有放松状态。NA 最初对离盒时间的期望（1e-3）是错误推导（最后一步的线性截断差 h²/8 ≈ 0.01），提交前改成 0.02 并把推导写进测试；没有动任何已有测试的容差。
- **一阶方程的 "t" 映射到坐标 kind**：一阶图上学生的 kind t 是横坐标（内核 kind "x"），只有平面图才有真正的 time kind（`lib/query-panel.kernelQueryKind`：ty 模式 t → "x"、y → "y"；xy 模式 t → "time"）。工具里一阶方程传 target.kind "x" 或 x0 都是可读的 isError。
- **工具输入名**：first / diff 用 t0，system / second 用 x0（对模型比简报的「t0 当 x0」清楚）；平面模式没给 x0 时 t0 仍作为 x0 的别名，所以简报的约定也能用。tSpan 默认 20、上限 1000；停止盒 = 视图的 20 倍，与外壳一致。
- **两种命中格式并存**：网页面板用自己的纯格式化（`queryHitText`：按误差的 2 位有效数字四舍五入，如 0.00123 → 0.0012、123 → 120），工具摘要和 widget 用 NA 的 `queryLines`（6 位定点），因为 `app/mcp/tools.test.ts` 锁定了那个格式；note 句与精度句通过 `queryNoteText` 和 `L.tool.queryAccuracy` 共用。
- **面板的积分与固定轨线完全一致**：`integrateAdaptive` h 0.05、rtol 1e-6、atol 1e-9、远盒 `fixedStopBox(输入范围)`、`CLICK_TSPAN` = 50、t0 = snapshotT——查询问的就是屏幕上那条曲线。2 s 墙钟预算从 App 注入 checkpoint（内核无时钟），超时显示 `ui.queryTooLong`。结果以方程 + 输入范围 + 快照时刻为键。
- **两条腿复用 `trajectoryLines`**：内核的 forward / backward（status、tEnd、points）标成 stop "far" 的轨线，带被查询轨线对的 nonUnique 标志，措辞是共享的模式感知版本（显式一阶显示端点的 t、微分形式列两侧）。微分形式图上 "y =" 查询：内核按归约系统的参数化，命中点正确，但腿的句子没有方向词。

### N.3

- **(b) 只改措辞不改状态值**：非自治场景的 `reached_equilibrium` 在数据里还是这个键（积分器冻结），三处显示（trace_trajectory、query_solution、两个外壳的 `labels-trajectory`）改用 `tool.stoppedNonAutonomous`：「速度在该时刻降到接近零后停止；非自治系统，这里不是平衡点：场在这一点随 t 变化」。测试断言状态仍是 reached_equilibrium 且文字不含「平衡点」。
- **(c) 停止规则做了、目标没到**：格子中心的运行已收敛到格子外一个已知根、且格子比它到该根的距离小 → 不再细分。x' = xy, y' = x² − y 的细分格子从 1024（封顶）降到 254、`refineCapped` 变 false，x⁷ 在 [−100, 100]² 的守卫（原点与鞍点共享深度 0 的格子）通过。**时间 ~1.1 s（之前 1.0–1.35 s）**：约 1.48 M 次场求值来自约 254 次 Newton 运行各自爬向原点这个**退化根**（雅可比奇异 → 伪逆步、线性收敛、`EXTENDED_ITERATIONS`），不是四叉树本身。再降需要内核新机制（简报冻结），按简报「做不到就记 open-questions 不硬撑」处理，规则保留因为守卫通过。
- **(d) 无代码改动**：`1e999` 早被解析器白名单拒绝（mathjs 把它解析成非有限的 ConstantNode），四种模式各加一条推导测试。
- **(e)(f) 的调用点留给 O**：`exportFooterText` 的第 5 个参数和 `refineCapped` 的 hook 一行都在 NB 的文件里（并行时的文件所有权），NA 只写清楚改哪一行，O 阶段 643457b 补上。
- **六条修复一个提交**（ece23f4）而不是「一个模块一个提交」：NA 的选择，每条都很小且各带测试。

## O 阶段

- **widget o-1 加了什么**：共享 hook 的 highlight / cursor 传给画布（悬停固定轨线高亮）、`Undo` 按钮 + Ctrl/Cmd+Z（`lib/undo-key`，只在 iframe 有焦点时生效）、`secondOrder` 的纯数据透传（模拟主机发现 live 场景缺降阶行）。**没有加 Clear 按钮**（简报只要求删除与撤销；hook 的 `clearTrajectories` 会连工具自带的 trace_trajectory 曲线一起清掉，而那些曲线没有起点、既不能点击删除也不能撤销——见 open-questions）。M 阶段 widget 保留了操作提示（interactionHint），因为 Claude 里没有帮助页。
- **8e54eef 不再 bump 版本**：o-1 尚未发布，同一版本号内修。
- **交点时间的显示规则**：显示的时间不确定度 = max(error.t, error.position / speed)（`timeUncertainty`，`QueryHit.speed` = 命中处的 |F|）；指定时间目标（error.t === 0）保持精确、不带括号（已有测试不变）；speed 为 0 或非有限时保留括号宽度。编排者给 O 的任务写的是「5 位小数」，共享的 `errorDigits` 规则（误差的 2 位有效数字）对 1.0e-5 给出 6 位（最后一位在 1e-6，与坐标相同）；保留共享规则而不为时间单开一套，测试断言 6 位且「不是 12 位」。
- **description 措辞**：`query_solution` 以 CALL THIS TOOL FIRST 开头，明写「某时刻的值 / 何时到某值」的问题必须调用本工具、"never evaluate that closed form mentally"，然后 WHAT IT COMPUTES 说明再积分与从不插值；tools.test.ts 锁定。其他 6 个工具的 description 只改了 locale 一句（M）。
- **模拟主机的设计与限制**：沿用 L 的两源结构（host 3520 / sandbox 3521，沙箱按 URL 加载、CSP 由 `_meta.ui.csp` 生成），这次用 `BASE_URL=http://localhost:3810` 构建，所以 "widget asset URLs are absolute" 是真 PASS；新增 query_solution 场景与 host.html 的两行。限制：会话浏览器的 find / read_page 看不进跨源沙箱 iframe，文字靠 `mock.readText()` 与截图；面板 455 px 高会切掉 widget，检查时仿真 1000×1500 视口再复位；rAF 这次在面板隐藏时也触发了（与 N 阶段的观察相反，两种情况都如实记录）。
- **回滚**：`git checkout n-features-done`；该 tag 的 widget 是 l-1，回滚也要重连连接器。

## 流程决策

- **两个 worktree 智能体 + 顺序集成**：M（MA / MB）和 N（NA / NB 并行，NC 之后）各一次集成验证（生产构建、curl 头、smoke、缺 locale 的直接调用）；O 一个智能体在 main 上做。
- **浏览器验收由编排者做**（会话自带面板，`next dev`），不派审查智能体：M 验了四个宽度 × 两种语言与 4 个 ⓘ；N 验了初值 / 撤销 / 单条删除 / 查询。面板隐藏时 rAF 不触发，悬停高亮在 N 里验不了，O 在模拟主机里看到了。
- **本轮没有跑大规模对抗式审查**（简报要求）。简报允许的窄审查（`query_solution` 的数值正确性、URL 参数的安全面）**也没有跑**：报告里没有这一项，视为未审。
- **推送留给站长**：`git push` 被会话的权限分类器拦下（与上一轮相同），三个 tag 也只在本地。
- **智能体输出纪律**沿用上一轮：固定小节（summary / commits / done / notDone / decisions / openQuestions / apiChanges），长材料写 scratchpad，单次工具输出 ≤ 约 200 行；本文档同样分块写。
- **提交粒度**：`git add` 显式路径；每个提交 `npm test` 绿（NB 重建行尾后的中间提交除外，见「环境」）；M 完成后单独一个 docs 提交（05a67e3）以便先部署 M。
