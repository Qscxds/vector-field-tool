# PQR 轮决策记录（2026-09-15）

任务书：`vfield-pqr-prompt-v2.md`（教授反馈修复 + 同类漏洞普查）。段落顺序 P0 → P1 → P2 → Q → R。

## 1. P0 勘察：Codex 在交接之后改了什么

### 1.1 仓库状态

- `origin/main` = 本地 `HEAD` = `568eeaa`（MNO 轮的 docs 提交；站长已推送，线上 widget 为 `o-1`）。
- `git log --oneline o-mcp-done..HEAD` 只有一个提交（`568eeaa`，我打的 docs），**没有 Codex 的提交**。
- Codex 的全部改动是**未提交的工作树修改**：18 个已跟踪文件（+289/−51）和 2 个新文件
  （`docs/ENGINEERING-RECORD.md` 2054 行，`lib/interactive-scene.test.ts` 83 行）。没有 tag，没有推送。
- 另有 `AGENTS.md`（Next.js 16 的 `next dev` 自动生成的 agent 规则文件）被 `CLAUDE.md` 首行 `@AGENTS.md` 引用；内容只是「读 node_modules/next/dist/docs」，无害。

### 1.2 逐项判定

| 文件 | Codex 做了什么 | 与既有设计的关系 | 判定 |
|---|---|---|---|
| `lib/core/integrate.ts`（**内核**） | `reached_equilibrium` 只对自治系统触发：`Run` 构造时用既有静态规则 `mentionsTime(sys.spec)` 判一次；含 t 的 xy 系统在瞬时零速度处继续积分；ty 模式与自治系统不变 | 修的是可推导的真错误（`x' = 0, y' = t` 从 (0,0) 出发两方向 0 步即停，查询 t = 1 得 `stopped_before_target`，而 y(1) = 1/2）。**不改任何数值阈值**，规则与 J.3「t 出现即非自治」一致。CLAUDE.md 与 ENGINEERING-RECORD 都写明「2026-09-10 站长明确授权的窄例外」——我无法核实这句话，但改动本身符合内核冻结的字面（无新数值机械、无阈值调整） | 保留；授权真伪列入 open-questions 请站长确认 |
| `lib/core/integrate.test.ts` `lib/core/query.test.ts` | 7 项推导回归（RK4/自适应 × 正反向 × 非零起始时刻 × t 在任一分量 × 中途零速度）+ 2 项自治/ty 保护 | 期望值全部手推（(t−t₀)²/2） | 保留 |
| `lib/scene.ts` | 新增可选 `firstOrderSpec`（查询场景没有 FirstOrderView 时仍带原式） | 与既有 `firstOrder.spec` 并存；widget 优先读 `firstOrderSpec ?? firstOrder.spec` | 保留（P2 会用到它：一阶查询场景不再漏出 `x' = 1`） |
| `app/mcp/tools.ts` | `query_solution` first/diff 场景带 `firstOrderSpec`，并用 `markNonUnique` 的曲线探测标非唯一 | 与 J 轮「标记跟曲线不跟盒子」一致；非自治分支不变 | 保留 |
| `lib/interactive.ts` | `NonUniqueProbe.checkpoint`：预算中断向外抛，不被「不显示诊断」的 catch 吞掉；一阶 features 补 `resolution`/`zeroPlateaus` | 修的是 hook 装 Scene 时漏字段 | 保留 |
| `components/useInteractiveScene.ts` | 实时 Scene 补 `singularPoints`/`underflowPlateau`/`firstOrderSpec` | 同上 | 保留 |
| `app/widget/page.tsx` `lib/export-footer.ts` | 一阶查询场景显示 `dy/dt = …` 而不是内部 `x' = 1, y' = g` | 正是 P2.2 要查的那类漏（Codex 已修了 widget 一半） | 保留 |
| `app/mcp/server.ts` + 测试 + smoke + README | `WIDGET_VERSION` o-1 → o-2 | 未部署（线上仍 o-1） | P1 直接升到 **p-1**，o-2 不单独发布 |
| `scripts/smoke.mjs` `scripts/mock-host/host.html` | 新增 3 个查询场景（sqrt 非唯一 first/diff、零初速非自治） | 与实现配套 | 保留 |
| `lib/interactive-scene.test.ts`（新） | 用 react-dom/server 真实渲染 hook 验证最终 Scene | 覆盖了「两个外壳实际消费的数据」这一空档 | 保留 |
| `docs/ENGINEERING-RECORD.md`（新） | 16 份阶段记录全文合并 + 2026-09-10 修复记录 + SHA-256 来源索引 | 原文件未删；与本轮 PQR 文档并列 | 保留，不再维护它的「当前」节（本轮记录在 PQR-*.md） |
| `CLAUDE.md` | 模块图补 o-2 / firstOrderSpec / 内核例外说明；首行 `@AGENTS.md` | 与代码一致 | 保留；P2 末尾再按本轮修订 |

### 1.3 门禁（P0，在 Codex 改动之上）

| 检查 | 结果 |
|---|---|
| `npx tsc --noEmit` | 0 错误 |
| `npm test` | 37 个文件，906 个测试 = 904 通过 + 2 个既有 `it.fails`（51 s） |
| `npm run build` | 第一次与 vitest 并行运行时在 "Collecting page data" 处 `spawn EBUSY`（Windows 进程句柄被占用的瞬时错误，与代码无关）；单独重跑通过，11 个路由生成正常 |

### 1.4 处理

Codex 的改动以一个 `[P0]` 提交原样固化（作者标注为 Codex 的工作树改动，由我提交），不改内容，让 P1 之后的每个提交都只含本轮的差异。

## 2. P2 普查表（见文末）

（已追加在文末，因为 P0/P1 先写入。）

## 3. P1 决策

| # | 决策 | 理由 |
|---|---|---|
| 3.1 | 速度坐标在界面上一律写 `x'`；降阶说明引入 `v = x'`（教材写法）并把降阶后的 g 显示成含 v 的串（`reduced.f = "v"`，`reduced.g` 在 AST 上把内核的 y 改名为 v）；内核系统 `spec` 不动，仍是 `x' = y, y' = F(t, x, y)` | 学生的问题里只有 t、x、x'；v 是降阶时自己定义的量，可以出现在降阶行里；y 是实现细节，不进任何可见文本。改名在 AST 上做（`SymbolNode` y → v），不用文本替换，所以只碰变量 y |
| 3.2 | 输入接受 `v` 作为 `x'` 的别名（只匹配独立符号，`vx`、`v_1` 不算），`v'` 仍按「非 x 的撇号」拒绝，参数不许叫 v | 任务书要求；`v'` 若静默当成 x'' 会让 `v' = -x` 这种降阶后的写法混进二阶模式 |
| 3.3 | `y`、`y'`、`y''` 用专用错误码 `second_order_y_symbol` 和一句话「变量是 t、x 和 x'；y 在这里没有含义」，检查在撇号检查之前 | 教授的原话就是这句；`y'` 若先撞上撇号检查会得到无关的提示 |
| 3.4 | MCP 参数名用 `xp`：`xpMin/xpMax`（analyze_second_order 必带；query_solution second 可选，覆盖 yMin/yMax）、`xp0`；URL 用 `xpmin/xpmax`，解码时旧链接的 `ymin/ymax` 在 second 模式静默接受、新名优先，其他模式下 `xpmin/xpmax` 报 unusedInMode | 任务书二选一（xpMin 或 vMin），选 xp 与显示符号 x' 一致；旧链接不能坏 |
| 3.5 | `query_solution` 的 `t0` 在 system/second 模式 = 起始时刻（默认 0），传给内核 `querySolution({ t0 })`，`timeDependent.snapshotT = t0`；不再是 x0 的别名 | 受迫二阶方程的初值 x(t₀)、x'(t₀) 必须能指定时刻；网页端早已用快照时刻当 t₀，工具端对齐；R.1「删掉 t0 别名」顺手完成 |
| 3.6 | `analyzePlanar` 增加可选 `second` 参数，二阶时换表头（`secondOrderHeader`）、换非自治说明（`timeDependentSecond`，说「方程」不说「系统」）、采样场写 `(v, F)`、点写 `(x, x') = (…)`；`scene.secondOrder` 在 analyzePlanar 内部就设好 | 共享主体不复制；所有二阶专用措辞集中在标签表 |
| 3.7 | 范围类模板统一加 `{vv}` 占位（`yRangeError`、`featuresBox`、`equalScaleDetail`、`shownRange*`、`exportRange`），两个外壳和 PNG 页脚都通过 `lib/coordinate-names` 取名 | 一处定义，杜绝再漏 |
| 3.8 | 网页端把 `compiled.secondOrder` 传进 hook（`Scene.secondOrder`） | 之前网页 Scene 没有这个字段，PNG 页脚在二阶模式下打印的是内核的 `x' = y, y' = …`（P2 类漏洞，顺手修） |
| 3.9 | widget 版本直接 `o-1 → p-1`，跳过 Codex 的 `o-2` | o-2 从未部署 |
| 3.10 | 非自治二阶的网页说明（`timeDependentNoteSecond`）明写「平衡点（即常数解 x ≡ c，物体静止）」 | P2.3 要求把相平面平衡点与常数解的对应说出来，二阶文案先带上 |

（§2 的普查表见下文「2. P2 普查表」——追加在本文件末尾，因为 P0/P1 已先写入。）

## 2. P2 普查表

原则（已写入 CLAUDE.md 架构规则第 9 条）：**学生看到的每一个符号、坐标、数值、术语，都必须是他自己写下的那个问题里存在的东西。归约是实现细节，不是词汇表。**

方法：我先自己核查 P2.1（最可疑），同时派了 6 个只读扫描 agent（按一阶/微分形式/平面系统/二阶/内部枚举名/structuredContent 六个视角）找清单之外的同类漏洞，结果由我逐条读代码核实后取舍；没有跑对抗式复核（任务书要求）。扫描共报 76 条，采纳 60 条，拒绝 3 条（见表末），合并/已修 13 条。

| # | 位置 | 判定 | 漏在哪 / 怎么修 |
|---|---|---|---|
| P2.1 | 微分形式：`query_solution` 命中行 `t = … (±tError)` | **有漏 → 已修** | `tError` 是内核参数 s 的不确定度（dt = N ds，与 t 的不确定度差 |N| 倍）。一阶命中是图上一点 (t, y)，两坐标都只到位置误差：命中行改为 `t = …, y = … (±error)`，不再打印参数不确定度（`9cf6839`…`2c5bdde`） |
| P2.1 | 微分形式：`query_solution` 两条 leg「Forward (t increasing): reached t = {tEnd}」 | **有漏 → 已修** | tEnd 是 s，方向词也不成立。改为「一侧 / 另一侧：终点 (t, y) = …，状态」，不报方向、不报 t；显式一阶改报终点的 t 坐标。推导测试：`y dt + 2 dy = 0` 从 (0, 1) 出发，y(2) = e⁻¹，内核参数 s = 1、跨度 4 到 t = ±8，摘要里不得出现 1、4、−4 作为 t |
| P2.1 | 微分形式：状态句「integrated to the requested time」「stopped before the requested time」「reached an equilibrium」「diverges in finite time」 | **有漏 → 已修** | 四句改为微分形式专用：沿曲线走完指定跨度（没有时间）、在跨度用完前停止、趋近 M = N = 0 的点（方向场奇点，不是平衡点）、曲线跑向无穷远。两个外壳和工具共用 `statusSentence(…, picture)` |
| P2.1 | 微分形式：`possibly_more_beyond_span`「in one direction」、`not_reached_in_span`「neither direction」「时间范围」 | **有漏 → 已修** | 微分形式变体：「起点的同一侧」「沿曲线走过的跨度」 |
| P2.1 | 微分形式：`tSpan` 描述「Time span」 | **有漏 → 已修** | 描述明写 mode diff 的 tSpan 是曲线自身参数的跨度，不是 t 区间 |
| P2.1 | 微分形式：画布把固定曲线画成蓝/橙两色（正/反向），帮助页说蓝 = t 增大 | **有漏 → 已修** | 无向形式改单色；帮助页标记说明加一句 |
| P2.1 | 微分形式：structuredContent 的 `hits[].t`、`error.t`、`tEnd` 是 s | **有漏 → 已修（标注法）** | 不改 Vec2 字段名；每个 Scene 加 `axes: { x, y, t }`（微分形式 `t: "parameter"`），描述里的 STRUCTURED_CONTENT_RULE 要求 Claude 只转述文本、按 axes 读名字、不引用 `system`。显式一阶改为把内核时钟起点设为学生的 t₀，使 `hits[].t` 恒等于 t 坐标（推导测试：t₀ = 1，dy/dt = y，t = 3 处 hit.t = hit.x = 3） |
| P2.1 | 微分形式：常数解的「稳定」措辞 | **无漏，加说明** | 内核按 dy/dt = −M/N 的符号（t 增大方向）判定，数学上成立；加一句「微分形式没有方向：趋向/离开按 t 增大读，来自两侧 dy/dt = −M/N 的符号」，工具与两个外壳同出 |
| P2.1 | 微分形式：查询摘要没说这种形式无方向 | **有漏 → 已修** | 表头后加既有的 `differentialUndirected` 句 |
| P2.2 | 一阶：`ty` 解析错误提示「Did you mean x*y」 | **无漏** | `unknownSymbolMessage` 早已按模式用 `t*y`；`describeForbiddenNode` 也说 "t and y only" |
| P2.2 | 一阶：URL 参数 | **无漏** | I 轮起 `tmin/tmax` 已是一阶模式的名字（解码兼容 xmin）；本轮补：一阶链接里的 `t0` 报 unusedInMode、编码时不再输出 |
| P2.2 | 一阶：PNG 页脚 / OG 图 / 页面标题 / 范围说明行 | **无漏** | 页脚经 `coordinateNames` 用 t；范围行 `{hv}` = t；OG/标题为静态站名 |
| P2.2 | 一阶：MCP 参数 `xMin/xMax` 表示 t 范围 | **有漏 → 已修** | `analyze_first_order` 与 `query_solution`（first/diff）接受并文档化 `tMin/tMax`，旧的 `xMin/xMax` 静默读取；错误信息按给出的名字报「tMin (5) must be smaller than tMax (0)」 |
| P2.2 | 一阶：`query_solution` 描述把平面系统的 EXPRESSION_RULES（"state variables are x and y"）套给一阶 | **有漏 → 已修** | 描述按模式分段；`NEVER_COMPUTE` 一阶版不再说 eigenvalues/trajectories |
| P2.2 | 一阶：传给 AI 的字段名 `x` 装 t | **有漏 → 已修（标注法）** | 同上 `axes` + STRUCTURED_CONTENT_RULE；`system.f = "1"` 明确禁止引用 |
| P2.2 | 一阶：显式形式的 `blew_up`「the position diverges」 | **有漏 → 已修** | 显式一阶变体「y 在有限的 t 处发散」 |
| P2.3 | 平面系统：平衡点 | **无漏** | equilibrium / 平衡点 + 分类 |
| P2.3 | 一阶：常数解 | **无漏** | constant solution / 常数解 y = c，稳定性为两侧解走向 |
| P2.3 | 微分形式：方向场奇点 | **无漏** | `singularHeading`「方向场奇点（M = N = 0）」，无稳定性词；查询 leg 的 `reached_equilibrium` 现在也说「M = N = 0 的点」 |
| P2.3 | 二阶：平衡点 ↔ 常数解 x ≡ c | **有漏 → 已修** | 新句 `equilibriaSecondNote`「相平面里的平衡点都在横轴上 (x, x') = (c, 0)：每一个就是常数解 x ≡ c，物体停在 x = c 不动」进工具摘要、网页平衡点标题下、widget；非自治说明与预设注释也带这层对应 |
| P2.3 | 二阶：`stoppedNonAutonomous`「非自治系统」、`reached_equilibrium`「speed」、`blew_up`「position」 | **有漏 → 已修** | 二阶变体：说方程、说 x 和 x' |
| P2.3 | 二阶：`timeDependent` 摘要「t appears in F」（整条方程输入时学生没写 F） | **有漏 → 已修** | 「方程含 t（上面 v' = … 的右端含 t）」 |
| P2.4 | 等比说明：一句套所有模式 | **有漏 → 已修** | 三个变体：一阶 = 斜率 dy/dt；平面 = 箭头/轨线的真实方向（沿轨线斜率 dy/dx，不是时间变化率）；二阶 = dx'/dx。警告也分两版。时间序列在 Q 段自动解除 |
| P2.5 | 轨线 vs 解曲线 | **有漏 → 已修** | 一阶图的「最近一条轨线 / 清除轨线 / 轨线（t₀, y₀）/ 点击删除这条轨线 / 添加解曲线」改为「解曲线」系列，相平面保留「轨线」并把「添加解曲线」改成「添加轨线」；共用的交互提示改成中性的「曲线」；平面非自治说明里的「解曲线」改「轨线」；帮助页与 README 同步 |
| P2.6 | 内部机制名 | **有漏 → 已修** | `refineCapped`「变号搜索…单元数上限…f 和 g」→「平衡点搜索达到它能细分的区域数上限」；`rtol 1e-6` → 「每步相对误差约 1e-6」；`max_steps`「步数或步长耗尽」→ 说明数值方法在这里需要的步数超过上限（解变化快）；`xd/xdd 是内部名称` → 「不是这个问题里的符号」；「一个固定方块」→「原点附近几个固定点」；二阶降阶自检失败的 "Internal check failed: … -E0/a" → 新错误码 + 双语句；`trajectoryLine` 的「共 {steps} 步」删掉；摘要里「请用参数 t 指定快照时刻」「图像已交给 widget 绘制」删掉/中性化；widget 状态栏 "connected to host / MCP host / rendered by Claude"（中文表里竟是英文）改为学生话；`stability.varies` 英文「sign pattern」改为学生话；唯一性 borderline「near the threshold」现在打印两个冻结常数 0.25 / 0.1；`detect-form` caveat 里对 Claude 说的「向学生转述时请说…」删掉（描述里已有）；`queryStoppedBefore` 的「请加大 tSpan」拆成工具专用附加句（网页没有 tSpan）；`(±0)` 时间括号在时间目标时不再打印；链接过长时的 "query (…)" 改成整句 |
| P2.6 | `region_of_equilibria` / `possible_continuum` / `arc_length` / `domain_edge` / `singular` / `stopped_before_target` / `hit_limit` / `left_box` 等键 | **无漏** | 全部有双语整句，无键名直译；`leftFarBox` 的「20 倍」是解释过的数字，保留（扫描建议删，我拒绝：它告诉学生曲线停在哪） |
| P2.7 | 初值命名 | **无漏 / 已修** | 一阶 t₀, y₀；平面 x₀, y₀（`t0` 别名已在 P1 删）；二阶 x(t₀), x'(t₀)，自治时图例写「初值（t₀ = 0）」以免 t₀ 没定义；微分形式初值是曲线上一点 (t₀, y₀)，标签正确 |
| P2.8 | 预设 | **有漏 → 已修** | 新组「二阶方程」：x'' = −x、阻尼振子、单摆、Van der Pol（二阶写法）；「平面系统」组保留同名系统；非自治组加拍频 x'' = −x + 0.5cos(1.2t)（注释附手推解 2.27 sin(0.1t) sin(1.1t)，用积分核对）；两个旧二阶预设注释里的「令 y = x'」改为 v |
| P2.9 | 帮助页记号一节 | **有漏 → 已修** | 整节重写为四种模式各一条（变量、自变量、坐标轴、画的是什么、用哪个词、非自治怎么办、微分形式为何不报 t），加「术语按模式区分」「等比在各模式下的含义」两段；控件一节的范围/等比/快照/清除说明改对；标记说明加微分形式单色 |
| 扫描 | 平面 `tracedBoth` 硬编码 "starts at t = 0"，与 t₀ ≠ 0 的表头矛盾 | **有漏 → 已修** | 加 `{t0}` 占位；query_solution 填起始时刻，trace_trajectory 填 0；二阶另有「非自治方程」版 |
| 扫描 | 网页查询表头在非自治图上不说起始时刻 | **有漏 → 已修** | `queryHeaderAt`「从 t = {t0} 时刻经过 {start} 的解」 |
| 扫描 | `queryHeaderSystem`「(at t = 0)」括号附注 | **有漏 → 已修** | 写成初值「满足 (x({t0}), y({t0})) = {start}」 |
| 扫描 | `featuresBoxDetail` 对一阶图说「平衡点」、对平面图说「常数解和方程类型」 | **有漏 → 已修** | 三个变体 |
| 扫描 | widget 平面场景的方程行硬编码英文逗号 | **有漏 → 已修** | 统一走 `sceneEquationText` |
| 扫描 | 二阶奇点行 `singularPoint` 打印裸坐标 | **有漏 → 已修** | `equilibriaNotices` 读 `scene.secondOrder` 用 `(x, x') = …` |
| 扫描 | `caveat.domainEdge` 例子「x' = sqrt(x)」在二阶图上读成另一条方程 | **有漏 → 已修** | 例子改中性「右端含 sqrt(x) 时的 x = 0 处」 |
| 扫描 | `trace_trajectory` 没有二阶/一阶模式，Claude 可能手工降阶后调用它 | **有漏 → 已修（描述）** | 描述明写 PLANAR SYSTEMS ONLY，方程一律走 `query_solution`（远目标即画整条曲线）；是否给 trace_trajectory 加 mode second 记入 open-questions |
| 扫描 | NEVER_COMPUTE 让 Claude 读 "caveat" 字段（可能念出键名 repeatedRoot） | **有漏 → 已修** | 改为读文本里「Note:」引出的那句 |
| 扫描 | 唯一性 `bounded_at_tested_scales` 只在 JSON 里，Claude 可能说「唯一性成立」 | **有漏 → 已修** | STRUCTURED_CONTENT_RULE 明写它是测试尺度上的测量，不是证明 |
| 扫描 | `leftFarBox`「20 倍」 | **拒绝** | 解释过的数字，对学生有用（曲线停在哪） |
| 扫描 | 建议把一阶场景的 `hits[].t`/`tEnd` 从 Scene 删掉 | **拒绝（改用标注）** | 改字段形状会波及 widget 与测试；`axes` + 描述规则 + 显式一阶时钟对齐达到同样效果，微分形式的 s 明确标为 parameter |
| 扫描 | 建议一阶模式所有状态句都改写（completed/singular…） | **拒绝** | 显式一阶的时钟就是 t，「integrated to the requested time」成立；只改了 blew_up 的「position」 |

## 4. Q 决策：时间序列视图

### 4.1 数据来源

- `TrajectoryView.times`（内核每一步的时钟，与 `points` 等长）随 `traceBoth` 进入 Scene；时间序列只是把已有的曲线换个坐标画（横轴 t，纵轴某个分量），**不新增任何数值机制**。没有 `times` 的曲线（旧的工具结果）不画。
- 前后两条 leg 合成一条按 t 单调的折线：逆向 leg 反转后接正向 leg，起点只出现一次（`lib/time-series.ts` `seriesCurves`，用 x'' = −x 的闭式解 cos t 做了推导测试）。

### 4.2 曲线跨度不随 t 范围延长

- 曲线仍按相平面的规则算到 t₀ ± 50（`CLICK_TSPAN`），停止规则也一样（20 倍远框等）。两个视图画的是**同一组曲线**：同一个 store、同一个清除/撤销/链接。
- t 范围超出 [t₀ − 50, t₀ + 50] 时图中空白并常驻说明「曲线只算到 t ∈ […]…空白不是解为零」。
- 拒绝的备选：按 t 范围延长 tSpan。那会让相平面里曲线的长度随时间序列的设置变化（同一条链接两个视图对不上），长跨度还会拖慢每次重算。

### 4.3 默认视图与链接

- 默认规则：自治 → 相平面；非自治（`scene.timeDependent`，J.3 静态规则）→ 时间序列。学生或链接没选时按规则走，方程从自治改成非自治会自动切换；选过一次就固定（`view=phase|time` 进 URL）。
- 平面/二阶模式下 `tmin/tmax` 复用为时间序列的 t 范围（默认 0..20 时省略）；一阶模式下它们仍是横轴范围，`view` 报 `unusedInMode`。旧链接不受影响（以前平面模式带 tmin/tmax 会报 unusedInMode，现在被读成 t 范围——只有手写链接会遇到）。
- 「同时画 x'(t)」是显示选项，不进 URL（记 open-questions）。

### 4.4 等比

- 时间序列下「等比」复选框置灰且不勾选，图下常驻说明（灰色，不是警告色：这不是问题，是这张图的性质）；相平面的等比设置原样保留，切回即恢复。

### 4.5 纵轴范围

- 取**输入范围**（所画分量范围的并集），不按曲线幅度自动缩放：学生输入的范围就是他要看的窗口，共振的线性增长冲出窗口是应该看见的事。

### 4.6 查询标记（Q.2）

- 查询命中在每条所画分量上标成 (t, 值) 的菱形，颜色同分量（x 蓝、x'/y 橙）；查询面板与结果文字不变。

### 4.7 Q.3 共振响应曲线：未做

- 需要对每个驱动频率做一次稳态振幅扫描，这是新的数值机制，触及内核冻结；本轮不做，记 open-questions。

### 4.8 widget

- 不做时间序列：工具结果不带 `times`，加上会显著增大 structuredContent。widget 版本保持 `p-1`。

### 4.9 时间序列视图下的交互

- 画布无交互（点击定不了初速度；缩放/平移不做，t 范围由输入框定）。曲线用「初值」添加；空图时提示这一点。
