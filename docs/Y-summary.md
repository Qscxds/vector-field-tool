# Y 段总结（2026-09-18）：TUVW 遗留小修

**做到哪**：9 项全部完成，验收清单逐条在生产构建上实测通过；tag `y-polish-done`。
**你需要做的**：widget 版本 `t-1` → **`y-1`**（英文的定义域边界标签也画在 widget 的图上），连接器要**删除后重新添加** `https://tools.studycase.net/mcp`。今天的两次更新（t-1、y-1）只需要重新添加一次。
**回滚**：出问题回到 `w-lecture-done`。

## 开工前勘察

`git log w-lecture-done..HEAD` 只有一个提交 `fc17864`，是我上一轮补线上验证结果的文档提交；没有别人的改动，工作区干净、与 origin 同步。基线门禁三绿（tsc 0，1076 + 2）。

## 做了什么

| # | 项 | 做法 |
|---|---|---|
| 1 | 第三条护栏（`siny`） | 内核新增静态函数 `gluedFunctionCall(name, letters)`：名字 = 「单参数白名单函数名 + 只由变量字母组成的后缀」时返回它想写的调用；函数名按长度从长到短匹配（`sinhx` = `sinh(x)`，不是 `sin(hx)`），多个字母视为乘积（`sqrtty` → `sqrt(t*y)`）；`min / max / pow / atan2` 不参与。`discoverParams` 遇到这种名字不列为参数，交给编译器；编译器的未知符号报错（普通解析器和二阶降阶两处）加上 `Did you mean "sin(y)"?`，网页二阶模式的双语句子末尾也加同样的提示。四种模式都生效。 |
| 1′ | 顺带修掉的一处不一致 | 护栏只决定「自动列出什么」，不该拦住学生**手动**加的行。以前 `resolveParams` 只把「被发现的」名字交给编译器，所以手动加一行 `cost`（或者链接 `p=cost:2`）会被悄悄漏掉（T 轮的 `ty` 已经有这个问题）。现在分成两个列表：`discoverParams`（带护栏，决定自动列出）和 `freeParamNames`（不带护栏，决定哪些行能交给编译器、哪些行删不掉）。 |
| 2 | `ln` | 白名单加 `ln`（单参数，= `log` 的自然对数；mathjs 自己没有 `ln`）。值与 `log` 逐位相同，负数 NaN、0 处 −∞；`ln(x, 2)` 报参数个数错误（带底数请用 `log(x, b)`）；`ln` 成为保留名；舍入误差界与 `log` 相同（否则会退化成「未知函数 → ∞」，影响平衡点的判定）。帮助页函数表下加一句；三个工具描述里的函数列表同步。 |
| 3 | 英文 stabilityShort | `domain edge, left` → `domain edge, solutions leave`；`domain edge, approached` → `domain edge, solutions approach`；测试里锁的字符串同步。这个标签画在 widget 的画布上 → `WIDGET_VERSION` **`y-1`**（本轮唯一一次），smoke 脚本、`server.test.ts` 同步，changelog 带重连提示。 |
| 4 | 讲课模式 | 「位置保留，证据隐藏」：平衡点坐标和常数解的值重新显示，最多 3 位有效数字（`(3, 2)`、`y = 2`、`(3.14, 0)`；`lecturePoint`、`formatShort(v, 3)`）；画布上常数解的标签同样带值。特征值、tr / det、偏差、阈值、分辨率、范围行、查询数值照旧隐藏；ⓘ 照旧展开完整一行。红线测试实质不变，原来断言「这一行没有任何数字」的地方改成「这一行没有 λ、tr、det」。 |
| 5 | 预算 | `FEATURE_SYNC_BUDGET_MS` 25 → 50。 |
| 6 | 拍频预设 | 范围 ±3 → ±20（x 和 x' 都是）。推导：从静止出发 \|x\| ≤ min(2F/\|g²−1\|, F·t/(1+g))，在 g ∈ [0.5, 1.5]、t ≤ 70 上的上确界 < 17.76；g = 1 时 x = (F/2)·t·sin t，在 t = 3π/2 + 20π = 67.54 处取到 **16.89**；x' 最大约 17.3。测试沿整个滑块范围用页面自己的追踪函数跑了一遍。预设说明补了一句。 |
| 7 | 帮助页两句 | 零斜线靠符号变化，相切型零点（x' = (y − x²)²）画不出来；单摆两鞍点之间稳定 / 不稳定流形重合所以只见一条，这种连接结构不稳定，工具不做数值判定。 |
| 8 | CLAUDE.md | `NULLCLINE_RESIDUAL_FRACTION` 列入冻结常数清单（注明它在 `lib/core` 之外但同样冻结）；两条新规则：性能结论以生产构建为准；widget 改动攒着批量做、非必要不升版本。模块说明同步本轮改动。 |
| 9 | changelog | 追加一条（同为 2026-09-18，按数组靠后者优先排在最前），带「删除后重新添加」的 action，并注明今天两次更新只需重新添加一次。 |

## 一处超出字面规则的决定

你给的规则是「后缀只由**本模式**变量字母组成」。我把后缀字母取成了**每种模式都是 x、y、t**（二阶再加别名 v），原因：一阶模式下 `sinx` 的 `x` 不是本模式的变量，按字面规则它仍会被列成参数 `sinx = 1`，正是这条护栏要消灭的静默错图；二阶模式下的 `sqrty` 同理。现在这两个都会被拒绝并提示 `sin(x)` / `sqrt(y)`；一阶模式下提示里带 x 时还会接上既有的那句「自变量是 t，请把 x 写成 t」，二阶里学生改成 `sqrt(y)` 后会得到既有的「二阶方程里没有 y」。你列的四个测试名（sinx、cost、sqrty、sinhx）在四种模式下因此都被拒绝。代价：`cost`、`sint`、`expt` 这类名字不能再自动成为参数（手动加一行仍然可以）。

## 验收

生产构建（`npm run build` + `next start`）：

| 检查 | 结果 |
|---|---|
| `npx tsc --noEmit` | 0 错误 |
| `npm test` | 47 个文件，1095 个测试 = **1093 通过 + 2 既有预期失败**（本轮新增 17 个；没有新的 `it.fails()`，没有改容差） |
| `npm run build` | 通过 |
| `npm run smoke` | 24/24，URI `?v=y-1` |
| 浏览器 · `siny` | 参数区为空；报错 `Unknown symbol "siny". Did you mean "sin(y)"?` |
| 浏览器 · `y*cost` | 参数区为空；`Did you mean "cos(t)"?` |
| 浏览器 · `-y*ln(y)` | 正常出图；常数解 y = 0「domain edge, solutions leave」（新标签）、y = 1 稳定（手算：y < 1 时 ln y < 0 → dy/dt > 0，y > 1 时相反 ✓） |
| 浏览器 · 讲课模式 LV | `(0, 0) saddle`、`(3, 2) center or weak spiral (linearization cannot tell)`；没有 λ / tr / det；范围行隐藏 |
| 浏览器 · 拍频预设 g 拖到 1 | 显示范围 x ∈ [−20, 20]；曲线最低点在画布第 477 行（共 518 行），手推 −16.89 对应第 477.7 行 ✓，没有出框 |

推送之后（`git push origin main --tags` 由我执行，tag `y-polish-done` 一并推上）：

| 检查 | 结果 |
|---|---|
| GitHub Actions run 35409774716（typecheck / test / build） | ✓ success |
| Vercel 部署（commit 86d8c5c） | ✓ Deployment has completed（这次几分钟内完成，没有重现上一轮 20 分钟的排队） |
| `npm run smoke -- https://tools.studycase.net/mcp` | **24/24**，widget uri `?v=y-1` |
| 线上首页 | 「What's new」最前面是本轮这一条（2026-09-18，排在同日的 TUVW 条目之前） |
| 线上 `/help` | 函数表下已有「ln = log = 自然对数」一句 |
| 线上 `/vector-field?m=first&g=siny` | 页面顶部报告 g 是无效的链接参数（不会再悄悄画成 dy/dt = 1） |

## 提交

```
ff30719 [Y] CLAUDE.md and changelog: the frozen nullcline constant, two working rules, the round's entry
1cbd1a4 [Y] help: lecture mode keeps positions; tangential zeros have no nullcline; coinciding separatrices ...
169a63c [Y] presets: the beats preset's box is ±20, so dragging g to 1 keeps the curve in the picture
bee1e80 [Y] feature-schedule: the sync budget 25 -> 50 ms (...)
8bf01c9 [Y] lecture mode keeps positions and hides evidence; English domain-edge tags; widget y-1
86ed598 [Y] help and tool descriptions: ln = log = the natural logarithm; a function's argument goes in parentheses
5f1a839 [Y] params: the third guardrail (siny is a call missing its parentheses, not a parameter)
266e66f [Y] parse: ln as an alias of log, and the hint for a function glued to its argument (siny)
```

内核改动仅限你列出的两类静态改动（白名单别名 `ln`、报错文案里的提示）；没有碰数值机械和任何阈值。`app/layout.tsx`、`app/mcp/route.ts` 没动。

`docs/TUVW-open-questions.md` 里因此关闭的条目：#1（预算已放宽到 50 ms）、#3（帮助与预设按数学写，拍频范围已改）、#4 与 #6（帮助页已写明）、#8（英文标签已改）、#9（讲课模式显示位置）。#5（零斜线残差常数）已列入冻结清单。其余照旧。
