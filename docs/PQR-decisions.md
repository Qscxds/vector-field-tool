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

## 2. P2 普查表

（P2 段填写。）

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
