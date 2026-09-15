# PQR 轮总结（2026-09-15）

**做到哪**：P0 勘察、P1 教授两点全部完成并实测；P2 普查、Q 时间序列、R 运维进行中（本文件随段落推进更新）。
**最后一个良好 tag**：`p1-secondorder-done`。
**我需要你手动做的**：`git push origin main --tags`（Vercel 自动部署）→ `npm run smoke -- https://tools.studycase.net/mcp` → 在 Claude 里**断开并重新连接**连接器（widget `o-1` → `p-1`；Codex 的 `o-2` 从未部署，直接跳过）。

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

## 3. P2 普查表

（P2 段填写；完整表在 `docs/PQR-decisions.md` §2。）

## 4. 验证清单（按「最快发现问题」排序）

（全部段落结束后给出，每步注明失败回滚到哪个 tag。）
