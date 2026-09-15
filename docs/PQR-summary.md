# PQR 轮总结（2026-09-15）

**做到哪**：P0 勘察、P1 教授两点、P2 同类漏洞普查、Q 时间序列视图、R 运维（上限 / widget Clear / 范围重追踪 / 命中精度 / 计算中 / CI / 报告问题）全部完成并实测；只有 Q.3 共振响应曲线未做（open-questions #7）。
**最后一个良好 tag**：`r-ops-done`（之前的：`p1-secondorder-done`、`p2-audit-done`、`q-timeseries-done`）。
**我需要你手动做的**：`git push origin main --tags`（Vercel 自动部署；GitHub Actions 的 CI 第一次跑）→ `npm run smoke -- https://tools.studycase.net/mcp`（24/24，URI `?v=p-2`）→ 在 Claude 里**删除连接器再重新添加**（只断开重连不够；widget `o-1` → `p-2`）→ 按第 6 节清单逐步验证。

> **P1 完成，可以部署回复教授了。** 部署后教授看到的：类型叫「二阶方程 x'' = F(t, x, x')」，右端可含 t（`x'' = -x + cos(t)` 直接可用），范围框是 `x' min / x' max`，纵轴标 `x'`，平衡点写 `(x, x') = (0, 0)`，输入 `x'' = y` 得到「y 在这里没有含义」的提示。

---

## 1. Codex 勘察结果（P0）

Codex 在 2026-09-10 的改动全部是**未提交的工作树修改**（没有提交、没有 tag、没有推送；`origin/main` = `568eeaa` 是我 MNO 轮的 docs 提交）。18 个已跟踪文件 + 2 个新文件，内容：

1. **内核**：`reached_equilibrium` 只对自治系统触发（`x' = 0, y' = t` 从静止出发曾在 0 步就停，查询 t = 1 得不到 y(1) = 1/2）。用的是既有静态规则 `mentionsTime`，**不改任何数值阈值**，有推导测试。CLAUDE.md/ENGINEERING-RECORD 都写「站长 2026-09-10 明确授权的窄例外」——我无法核实，见 open-questions #1。
2. 实时 Scene 补齐漏传的诊断字段（`singularPoints`、`underflowPlateau`、`resolution`、`zeroPlateaus`）。
3. `query_solution` 一阶场景带 `Scene.firstOrderSpec`，widget 显示 `dy/dt = …` 而不是内部 `x' = 1, y' = g`（恰好是 P2.2 要查的那类漏，Codex 已修 widget 一半）。
4. widget `o-1 → o-2`（未部署）；2054 行的 `docs/ENGINEERING-RECORD.md` 合并记录；新的 hook 真实渲染测试。

门禁：tsc 0；906 测试 = 904 通过 + 2 既有预期失败；build 单独运行通过（与 vitest 并行时曾 `spawn EBUSY`，Windows 瞬时错误）。处理：原样固化为 `[P0]` 提交 `59365b7`。逐项判定表在 `docs/PQR-decisions.md` §1。

## 2. P1：教授的两点

| 教授的话 | 做了什么 |
|---|---|
| 自变量是 t，右端应是 F(t, x, x') | 解析器早已接受 t（J 轮）；本轮把**记号**改成 F(t, x, x')：类型下拉、输入标签、语法提示、帮助页、README、MCP 描述；七个例子（含受迫 `cos(t)`、拍频 `0.5*cos(1.2*t)`）用手推值做了测试；F 含 t → 按 J.3 静态规则只画 t 快照、不报平衡点，说明文案改成「非自治**方程**」而不是「系统」 |
| y 在这里没有含义 | `x'' = y`、`x'' = -x + y'`、`y'' = -y` 都得到专用提示「二阶方程的变量是 t（自变量）、x 和 x'；y 在这里没有含义」（新错误码 `second_order_y_symbol`）；接受教材写法 `v` 作为 `x'` 的别名，显示一律用 `x'`；降阶说明改为「令 v = x'，则 x' = v，v' = F(t, x, v)」（显示串里的 y 在 AST 上改名为 v，内核系统不变） |
| 界面上不许再出现 y | 新模块 `lib/coordinate-names.ts` 给每张图定名（(t, y) / (x, y) / (x, x')）；范围模板加 `{vv}` 占位；改掉的位置：范围标签 `x' min/max`、画布纵轴 `x'`、范围行、等比说明、范围错误、PNG 页脚、平衡点 `(x, x') = (…)`、初值 `x(t₀)/x'(t₀)`、快照输入叫 `t₀`、查询下拉 `t / x / x'`、查询结果 `t, x, x'`、widget 摘要不再打印内核的 `x' = y, y' = g`、两个二阶预设的注释、URL 参数 `xpmin/xpmax`（解码仍静默接受旧的 `ymin/ymax`） |
| MCP 工具 | `analyze_second_order`：参数 `xpMin/xpMax`，描述明写自变量 t、F(t, x, x')、第二坐标是速度 x'、不许对学生说 y、非自治时的说法、教授的例子；摘要第二行「相平面：横轴 x ∈ …，纵轴 x' ∈ …」，受迫方程的采样场写 `(v, F)`。`query_solution` mode second：`x0 = x(t0)`、`xp0 = x'(t0)`（`y0` 仍作兜底读取，两者不一致则拒绝）、`xpMin/xpMax`、表头「方程 …，初值 x(t₀) = …、x'(t₀) = …」、命中 `(x, x')`、目标 kind y 显示为 x'；system/second 的 `t0` 现在是**起始时刻**（默认 0，受迫方程用得上），不再是 x0 的别名（R.1 的一条提前做了） |
| widget | `WIDGET_VERSION` `o-2 → p-1`；mock-host 加 `second_order_forced`、`query_second` 场景 |

提交：`9cf6839`（内核）、`f20cd08`（外壳）、`8465001`（工具 + widget）、`5ad4c69`（文案）。决策细节在 `docs/PQR-decisions.md` §3。

### P1 验证

| 检查 | 结果 |
|---|---|
| `npx tsc --noEmit` | 0 错误 |
| `npm test` | 39 个文件，926 个测试 = 924 通过 + 2 既有预期失败（P0 时 906；新增 20 个推导测试） |
| `npm run build` | 通过（`BASE_URL=http://localhost:3510`） |
| `npm run smoke` | dev 服务器 24/24（1 SKIP：未设 BASE_URL 的资产检查）；生产构建 24/24 无 SKIP，含 p-1 URI、受迫二阶（xpMin/xpMax、无平衡点、无孤立 y）、二阶查询 `(x, x') = (-1, 0)` |
| 浏览器 · 网页 | 阻尼振子（en/zh）、单摆（zh，链接 `xpmin/xpmax`）、受迫 `x'' = -x + cos(t)`（en，`t0=1`）、`/embed?controls=0` 受迫拍频：整页文本无孤立 y；画布纵轴 `x'`；输入 `x'' = y`、`x'' = -x + y'` 得到中/英 y 提示；`x'' = -x - 0.5*v` 被接受且降阶行显示 v；查询面板「经过 (x, x') = (2, 0) 的解，求 x' = 0.5」7 个命中全写 `x' = 0.50000` |
| 浏览器 · widget（mock host，生产构建） | `second_order_damped`（en）、`second_order_forced`（zh，xpMin/xpMax、t = 1 快照）、`query_second`（en，命中 `(x, x') = (±0.866, 0.5)`）：纵轴 `x'`，摘要无 y |
| 帮助页 | 记号一节的二阶行已改为 F(t, x, x')（整节重写在 P2.9） |

## 3. P2 普查（同类漏洞）

原则已写进 `CLAUDE.md` 架构规则第 9 条：**学生看到的每一个符号、坐标、数值、术语，都必须是他自己写下的那个问题里存在的东西。归约是实现细节，不是词汇表。**

做法：我先自己核查 P2.1（微分形式的内部参数），同时派 6 个只读扫描 agent（一阶 / 微分形式 / 平面系统 / 二阶 / 内部枚举名 / structuredContent 六个视角）找清单之外的同类问题，76 条报告由我逐条读代码取舍（采纳 60，拒绝 3，其余重复/已修）；没有跑对抗式复核。完整的逐条表（有漏 / 无漏 / 已修）在 `docs/PQR-decisions.md` §2，这里是摘要：

| 条目 | 结论 |
|---|---|
| P2.1 微分形式的「t」 | **确认是漏，已修。** 查询命中行曾打印内核参数的不确定度当作 t 的不确定度；两条 leg 曾报「Forward (t increasing): reached t = {内核参数}」；四个状态句说「时间」；画布把无向曲线画成两色。现在：命中是点 (t, y)、leg 只报「一侧/另一侧：终点 (t, y)」、状态句改为「沿曲线走完指定跨度」等、单色曲线、摘要先说这种形式无方向、tSpan 描述说明它是曲线参数的跨度。推导测试 `y dt + 2 dy = 0`：y(2) = e⁻¹，内核参数 s = 1、跨度 4 到 t = ±8，摘要里不得出现 1、4、−4 |
| P2.2 一阶的 x 残留 | 错误提示、URL、页脚、标题本来就对；漏在 MCP 参数名（`xMin/xMax` 装 t 范围 → 加 `tMin/tMax`）、`query_solution` 描述套用平面系统的表达式规则、显式一阶 blew_up 说「position」、传给 AI 的 JSON 字段名（→ 每个 Scene 加 `axes`，描述里加 STRUCTURED_CONTENT_RULE；显式一阶的内核时钟改从学生的 t₀ 起，使 `hits[].t` 恒等于 t 坐标） |
| P2.3 术语 | 三种模式的词本来就分开；补上二阶「相平面里的平衡点 (c, 0) 就是常数解 x ≡ c（物体静止）」（工具、网页、widget 三处），二阶状态句不再说「system / position / speed」，微分形式的常数解稳定性加一句「按 t 增大方向、来自 dy/dt = −M/N 的符号」 |
| P2.4 等比说明 | 一句套所有模式是漏；改为三个变体（dy/dt / dy/dx 方向 / dx'/dx），警告也分版 |
| P2.5 轨线 vs 解曲线 | 一阶图的六处「轨线」改「解曲线」，相平面保留「轨线」；共用提示改中性「曲线」；帮助页与 README 同步 |
| P2.6 内部机制名 | 清单里的枚举键都已有整句，无漏；扫描另找到 14 处机制名/参数名/给 Claude 的话混在学生句子里（rtol、tSpan、step budget、cell cap、内部名称、固定方块、-E0/a、步数、参数 t、widget、host、sign pattern、未命名阈值、query），全部改掉 |
| P2.7 初值命名 | 无漏（P1 已改二阶）；自治二阶的图例补「t₀ = 0」 |
| P2.8 预设 | 新「二阶方程」组（x'' = −x、阻尼、单摆、Van der Pol）与「平面系统」组并列；非自治组加拍频（注释附手推解，积分核对） |
| P2.9 帮助页记号 | 整节按四种模式重写，加「术语按模式区分」「等比在各模式下的含义」 |
| 扫描额外发现 | 平面非自治的「starts at t = 0」硬编码、网页查询表头不说起始时刻、featuresBox 详情跨模式、widget 平面方程行硬编码逗号、二阶奇点裸坐标、domainEdge 例子、trace_trajectory 无二阶模式（描述引流到 query_solution）、NEVER_COMPUTE 让 Claude 念 caveat 键、唯一性 bounded 键可能被误读为证明——全部已修 |

提交：`2c5bdde`（P2.1）、`8083d8d`（术语/等比/解曲线/预设）、`0fef027`（扫描批次）、`53b9491`（帮助页）+ docs 提交。

### P2 验证

| 检查 | 结果 |
|---|---|
| `npx tsc --noEmit` | 0 错误 |
| `npm test` | 39 个文件，941 个测试 = 939 通过 + 2 既有预期失败（P1 时 926；新增 15 个推导测试） |
| `npm run build` | 通过（生产构建，BASE_URL 本地） |
| `npm run smoke` | 生产构建 24/24 |
| 浏览器 · 网页 | 微分形式圆族预设（en）：单色曲线、「Solution curve (t₀, y₀)」「Clear solution curves」「Last solution curve: one side: followed for the whole requested span along the curve…」；一阶 y' = y²（zh）：「添加解曲线 / 清除解曲线 / 最近一条解曲线」；帮助页（zh）记号一节的四条 + 术语 + 等比段落可见 |
| MCP | 单元测试覆盖：axes、显式一阶时钟、tMin/tMax、描述规则、微分形式查询摘要、二阶奇点命名、非自治 t₀ |

## 4. Q：时间序列视图

| 要求 | 做了什么 |
|---|---|
| Q.1 时间序列视图 | 平面系统与二阶方程新增「视图：相平面 / 时间序列」切换：横轴 t，纵轴是解的值；二阶画 x(t)，勾选「同时画 x'(t)」叠加，平面画 x(t)、y(t)，图例在左上；「t 起 / t 止」定横轴范围（默认 0..20），纵轴取输入范围；默认自治 → 相平面、非自治 → 时间序列；`view` 与 `tmin/tmax` 进链接；等比自动解除并常驻说明；多条曲线复用同一个 store（初值添加、清除、撤销、链接 traj 全部照常）；PNG 导出画同一张图，页脚写 `t ∈ […], x, x' ∈ […]`；一阶模式不提供切换 |
| Q.2 查询标记 | 查询命中在每条所画分量上标成 (t, 值) 的菱形，颜色同分量 |
| Q.3 共振响应曲线 | **未做**（新数值扫描，触及内核冻结）→ open-questions #7 |
| 帮助/README/CLAUDE.md | 控件一节加「视图」条目，记号一节加「时间序列视图」段落；README 加一条；CLAUDE.md 模块图加 `lib/time-series.ts` 与 url-state 的 view/timeRange |
| 不做 | widget 无时间序列（工具结果不带 times）→ open-questions #8；「同时画 x'(t)」不进 URL → #9；曲线跨度固定 t₀ ± 50，超出常驻说明 → #10 |

提交：`f766bba`（代码）、`6e1741e`（帮助/README/CLAUDE.md）、`e613abd`（docs）。决策细节在 `docs/PQR-decisions.md` §4。

### Q 验证

| 检查 | 结果 |
|---|---|
| `npx tsc --noEmit` | 0 错误 |
| `npm test` | 40 个文件，953 个测试 = 951 通过 + 2 既有预期失败（P2 时 941；新增 12 个推导测试：time-series 8、url-state 3、export-footer 1） |
| `npm run build` | 通过（`BASE_URL=http://localhost:3510`） |
| 浏览器 · 网页 | 拍频预设（en，`traj=0,0`）：打开即时间序列，x(t) 的拍频包络清晰；切「相平面」URL 变 `view=phase`，切回 `view=time`；勾「同时画 x'(t)」出现橙色曲线与图例；「t 止」改 60 → URL `tmax=60`、出现「曲线只算到 t ∈ [-50, 50]」说明；填 `abc` → 红字「t 范围无效…仍用上一个有效范围」；等比复选框置灰未勾选、灰色常驻说明；查询 t = 5 → 结果行 `t = 5.000000, x = -0.768759, x' = 0.708666` 且曲线上出现菱形标记。Van der Pol 平面系统（zh，`view=time&traj=0.1,0;3,3`）：两条曲线各画 x(t)、y(t)，图例 x(t)/y(t)，「t ∈ [0, 20]，x, y ∈ [-4, 4]（时间序列）」，平衡点列表照常。帮助页（zh）：控件「视图」条目与记号「时间序列视图」段落可见 |
| widget / MCP | 未改（`p-1`）；`lib/scene.ts` 只加了可选字段 `times` |

## 5. R：运维

| 要求 | 做了什么 |
|---|---|
| R.1 上限 20 条 + 提示，拒绝第 21 条 | 上限进纯 store（`MAX_TRAJECTORIES`，链接的上限从它读）；满了「添加」置灰、初值框下常驻提示、画布悬停提示「已达上限：点击已有曲线可删除」，点击空白不加；widget 共用 |
| R.1 `/embed` 的 Help 链接 | 顶栏「使用说明」，新标签打开 |
| R.1 widget 的 Clear 只清自己加的 | 「Clear my curves (n)」，工具画的曲线保留；`WIDGET_VERSION` `p-1 → p-2`（**要删除连接器重新添加**） |
| R.1 改输入范围时重追踪 | `retraceKey` 加入输入范围 |
| R.1 最终命中从起点重积分一次 | `lib/core/query.ts`：Brent 定 t*，位置用一次从起点到 t* 的重积分；时间误差不变 |
| R.1 删 `t0` 别名 | P1 已做，确认 |
| R.1 删 `localeFromLanguageTag` | 函数、测试、CLAUDE.md 一句 |
| R.1 「计算中」 | `useDeferredValue(form)`：输入立刻显示，图右上角浮「计算中…」，算完消失；内核未解冻 |
| R.2 CI | `.github/workflows/ci.yml`（Node 24：npm ci → typecheck → test → build，不部署）+ README 徽章 |
| R.3 报告问题 | `lib/report-issue.ts`（GitHub 新 issue，预填链接、浏览器、三行提示；只有 title/body 两个参数）+ 页面底部与 `/embed` 的链接 + 帮助页一条 |

提交：`11798ec`（store + hook + widget p-2）、`6bc9a23`（query 内核）、`d50c4df`（report-issue）、`341c473`（网页壳 + 帮助）、`c830845`（CI + README）+ docs 提交。决策细节在 `docs/PQR-decisions.md` §5。

### R 验证

| 检查 | 结果 |
|---|---|
| `npx tsc --noEmit` | 0 错误 |
| `npm test` | 41 个文件，956 个测试 = 954 通过 + 2 既有预期失败（Q 时 953；新增 store 上限 2、report-issue 2，历史上限测试改为不超上限的写法） |
| `npm run build` | 通过（`BASE_URL=http://localhost:3510`） |
| `npm run smoke` | 生产构建 24/24，URI `?v=p-2` |
| 浏览器 · 网页 | 20 个起点的链接：提示「20 curves kept (the limit)…」、「Add」置灰、下拉 20 项；输入 `x' = xy, y' = x² − y` 时「Computing…」在 input 事件后立即出现、第一帧（rAF 12 ms）仍可见（已绘制）、算完消失；「Report a problem」点击时 href 变为 `https://github.com/Qscxds/vector-field-tool/issues/new?title=Problem+report&body=Page: …/vector-field?f=x*y&g=…\nBrowser: Mozilla/5.0 …\n\nWhat I did:\n\nWhat I expected:\n\nWhat I saw instead:`；`/embed`（zh）：顶栏「使用说明」`/help?loc=zh` 新标签、底部「报告问题」 |
| 浏览器 · widget（mock host，生产构建） | `trajectory` 场景：工具画的橙色曲线 + 「Undo」「Clear my curves (0)」置灰；点画布加一条 → 「Clear my curves (1)」；点它 → 自己加的没了，工具的曲线还在 |

## 6. 验证清单（按「最快发现问题」排序）

回滚方法：还没推送时 `git reset --hard <tag>`（tag 之后的提交全退）；已推送就 `git revert` 对应提交再推。每步注明失败时退到哪个 tag。

1. **本地三绿（1 分钟）**：`npm ci && npm run typecheck && npm test && npm run build`。失败 → `git reset --hard q-timeseries-done`（退掉 R）；仍失败 → `p2-audit-done`。
2. **推送 + CI（3 分钟）**：`git push origin main --tags` → GitHub 仓库 Actions 页 CI 变绿，README 徽章 passing。失败 → 看日志；Node/Linux 差异改 `.github/workflows/ci.yml` 即可，不影响线上。
3. **线上 smoke（1 分钟）**：Vercel 部署完成后 `npm run smoke -- https://tools.studycase.net/mcp` → 24/24，URI `?v=p-2`。失败 → Vercel 里回滚到上一个部署，本地 `git revert` R 段提交（或 `reset --hard q-timeseries-done` 后强推——不推荐）。
4. **拍频链接（1 分钟）**：打开 `https://tools.studycase.net/vector-field?m=second&eq=x''+%3D+-x+%2B+0.5*cos(1.2*t)&traj=0,0` → 直接是时间序列视图，x(t) 拍频包络可见；切「相平面」再切回；勾「同时画 x'(t)」出现橙线；「t 止」改 60 出现「曲线只算到 t ∈ [-50, 50]」说明。失败 → `p2-audit-done`（退掉 Q + R）。
5. **教授的例子（1 分钟）**：类型「二阶方程」输入 `x'' = y` → 「y 在这里没有含义」；`x'' = -x + cos(t)` → 非自治说明、范围框 `x' min/max`、纵轴 `x'`。失败 → `p0-verified`（退掉 P1）。
6. **一阶回归（1 分钟）**：Logistic 预设：没有视图切换；添加解曲线、查询 `t = 3`；帮助页记号一节四条 + 时间序列段落。失败 → `p2-audit-done`。
7. **报告问题（1 分钟）**：页面底部「报告问题」→ GitHub 新 issue 表单预填「页面：…」「浏览器：…」三行提示（不必真的提交）。失败 → `q-timeseries-done`。
8. **上限（2 分钟）**：打开带 20 个起点的链接（`…&traj=0.1,0;0.2,0;…;2,0`）→ 「添加」置灰、提示「已保留 20 条曲线（上限）」，悬停画布提示上限，点击空白不加；删一条后能再加。失败 → `q-timeseries-done`。
9. **计算中（1 分钟）**：平面系统输入 `f = x*y`，`g = x^2 - y` → 输入时右上角「计算中…」随后消失，平衡点列表更新。失败 → `q-timeseries-done`。
10. **重连连接器 + widget（5 分钟）**：Claude 里删除连接器再重新添加（只断开重连不够） → 「use trace_trajectory on x' = y, y' = -x from (1, 0)」→ widget 出现工具画的曲线，点画布加一条 → 「Clear my curves (1)」→ 点它只清自己加的。失败 → `q-timeseries-done`（widget 回到 p-1，需再删除重加）。
11. **查询精度（2 分钟）**：Claude 里「dy/dt = y, y(0) = 1, when does y reach 2?」→ t = 0.693147 (ln 2)，y = 2.000000；网页里简谐振子查询 `x = 0` 命中在 ±1e-5 内。失败 → `q-timeseries-done`（撤销 query.ts 的从起点重积分）。
12. **`/embed`（1 分钟）**：Google Sites 里的嵌入页顶栏有「使用说明」（新标签）、底部「报告问题」；`controls=0` 时仍显示方程与结果。失败 → `q-timeseries-done`。

## 7. 完整验证输出（R 段末的最终代码状态；git log 截至 docs 提交）

### `npx tsc --noEmit`

```
tsc exit 0
```

### `npm test`

```

 Test Files  41 passed (41)
      Tests  954 passed | 2 expected fail (956)
   Start at  02:31:43
   Duration  32.07s (transform 8.76s, setup 0ms, import 67.69s, tests 40.28s, environment 7ms)

```

### `npm run build`（尾部）

```
✓ Generating static pages using 13 workers (11/11) in 3.1s
  Finalizing page optimization ...

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


○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

build exit 0
```

### `git log --oneline o-mcp-done..HEAD`

```
9ae2bfb [R] docs: decisions (cap, widget Clear, retrace, hit position, computing, CI, report), summary with the ordered verification checklist, open questions, CLAUDE.md module map
c830845 [R] CI: GitHub Actions (typecheck, test, build on Node 24) and the README badge
341c473 [R] web shell: computing note (deferred form), retrace on range change, cap notice, /embed Help link, Report a problem; help text
d50c4df [R] report-issue: the prefilled GitHub issue link (pure, tested)
6bc9a23 [R] query kernel: a coordinate hit's position from one re-integration from the start
11798ec [R] store and hook: at most 20 kept curves (notice + hover hint), the widget's own Clear (widget p-2)
e613abd [Q] docs: decisions (data source, span rule, default view, no widget, Q.3 skipped), summary and open questions
6e1741e [Q] help, README, CLAUDE.md: the time-series view explained (controls entry, notation paragraph, module map)
f766bba [Q] time-series view: x(t), y(t) / x'(t) against t for planar systems and second-order equations
4c903a0 [P2] docs: the student's-vocabulary rule in CLAUDE.md, the audit table, summary and open questions
53b9491 [P2] help: the notation section rewritten per mode; terms and equal scale explained; README follows
0fef027 [P2] sweep: what Claude reads, per-picture statuses, tool-only advice, no mechanism names in copy
8083d8d [P2] terms by picture: solution curves vs trajectories, equal scale per mode, equilibrium = constant solution, second-order presets
2c5bdde [P2] first-order pictures: the kernel's integration parameter is never printed as t
1ffc777 [P1] docs: PQR summary (P1 deployable), open questions, decisions section 3
5ad4c69 [P1] copy: help, home, README and the second-order preset notes say F(t, x, x'), v = x' and (x, x'); web shell maps the y refusal
8465001 [P1] tools: analyze_second_order and query_solution speak (t, x, x'); xpMin/xpMax, xp0, t0 = start time; widget p-1
f20cd08 [P1] shells: x' replaces the kernel's y everywhere a second-order picture is shown
9cf6839 [P1] second-order kernel: x'' = F(t, x, x'), v alias, y refused by name, reduction shown with v
59365b7 [P0] Codex 2026-09-10 working-tree changes committed as found; PQR decisions section 1
568eeaa [docs] MNO summary, decisions, open questions; README and CLAUDE.md for the M-O state
```

### `git tag`（本轮新增：p0-verified、p1-secondorder-done、p2-audit-done、q-timeseries-done、r-ops-done；r-ops-done 打在本节之后的提交上）

```
a-core-done
b-tools-done
c-render-done
d-webshell-done
e-widget-done
f-forms-done
g-render-done
g-widget-done
h1-deploy-ready
h2-math-done
h2-reviewed
i-notation-done
j-math-done
k-website-done
l-mcp-done
m-english-done
n-features-done
night-final
o-mcp-done
p0-verified
p1-secondorder-done
p2-audit-done
q-timeseries-done
s-spike-done
r-ops-done  (added after this commit)
```
