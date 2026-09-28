# 第 11 轮总结（2026-09-28）：那个 y 是谁 · 相平面与解的图像并排 · widget 也有解的图像

> 第 11 轮的交付物（原代号 Z；tag 和提交前缀仍用代号）。轮次对照表：[ROUNDS.md](ROUNDS.md)。

**做到哪**：Z0 勘察、Z1 预设文案、Z2 两张图并排 + 联动、Z3 文档、Z4 widget 五段全部做完，每段都在浏览器里实测过（网页在生产构建上，widget 在本地模拟主机里），三道门禁全绿，没有触发停止条件。另外按你的要求把 24 份历史交付物改名为 `round-01` … `round-10`（本轮是 `round-11`，对照表 `docs/ROUNDS.md`）。
**最后一个良好 tag**：`z4-widget-done`（依次是 `z1-presets-done` → `z2-dualview-done` → `z3-docs-done` → `z4-widget-done`；每个 tag 处 tsc / test / build 都是绿的）。
**你需要手动做的**：① widget 版本从 `y-1` 升到了 **`z-1`**（widget 里有了解的图像），Claude 里的连接器要**删除后重新添加** `https://tools.studycase.net/mcp`（只断开重连不够）；② 照第 6 节的清单验证，第 2 条（点开预设里的 Harmonic oscillator）是教授那句话的直接检验；③ 看一眼 `docs/round-11-open-questions.md` 的第 1、3 条，那两条需要教授的意见。

---

## 1. Z0 勘察结论：一个人能看到裸 y 的所有路径

线上 = HEAD（GitHub 上 `1fe1b4e` 的 Vercel status 是 success，线上 smoke 24/24、URI `?v=y-1`）；`y-polish-done..HEAD` 没有别人的改动；基线三绿。二阶模式在线上走了一遍（5 个预设 + 2 个手输，中英，讲课模式，`/embed`），脚本扫 `innerText`：

| # | 路径 | 状态 |
|---|---|---|
| 1 | 二阶模式：范围框标签、初值 `x(t₀), x'(t₀)`、查询条件、结果区每一行、显示范围行 | 已确认干净 |
| 2 | 二阶模式的画布轴名 | 已确认干净（测试锁着） |
| 3 | 二阶模式的 PNG 页脚 | 已确认干净（测试锁着） |
| 4 | 讲课模式、`/embed?controls=0&lecture=1` | 已确认干净 |
| 5 | `analyze_second_order` 与 `query_solution` mode second 的摘要（en / zh） | 已确认干净（协议级测试 + 线上 smoke 的正则） |
| 6 | widget 的二阶渲染 | 已确认干净（只用共享标签键；Z4 在模拟主机里实测） |
| 7 | **预设库里把二阶方程写成系统的四条**（`harmonic`、`damped`、`vdp`、`resonance`）：名字里没有原方程，说明第一句「x' = y, y' = −x……」，从没说 y 是速度 | **就是这个问题 → Z1 已修** |
| 8 | 预设下拉框在任何模式下都列出全部预设，二阶模式下也看得见 `resonance` 的旧名字 `x' = y, y' = −x + sin t` | 同上，Z1 已修 |
| 9 | 参数区为空时的提示「例如 k*y 里的 k」在二阶模式下也显示 | **勘察新发现的小漏 → Z1 已修**（二阶写 `k*x`） |
| 10 | Claude 手工降阶后调 `analyze_system` | 描述层已堵（第 7 轮），本轮不改工具；第 7 轮 open-questions #4 仍开 |

任务书的判断是对的：二阶模式本身早就干净，y 来自预设库自己写出来的 `x' = y`。

## 2. 做了什么

### 交付物改名（你的附加要求）

`docs/P0-handoff.md` → `round-01-handoff.md`，`NIGHT-*` → `round-02-*`，`FG-*` → 03，`H-*` → 04，`IJKL-*` → 05，`MNO-*` → 06，`PQR-*` → 07，`S-summary` → 08，`TUVW-*` → 09，`Y-summary` → 10，本轮 → 11。`git mv` 保留历史；每份文件标题下加一行「第 N 轮的交付物（原代号 X）」；文件内交叉引用、CLAUDE.md、README、`ENGINEERING-RECORD.md` 的索引表同步（哈希表标明是改名前的原文件哈希）。新增 `docs/ROUNDS.md`：轮次 ↔ 代号 ↔ 日期 ↔ 收尾 tag ↔ 一句话。

### Z1：工具自己写出来的符号，必须自己解释（tag `z1-presets-done`）

| 项 | 做法 |
|---|---|
| 四个预设的名字 | `Harmonic oscillator x'' = −x (as a system, y = x')` / 「简谐振子 x'' = −x（写成系统，y = x'）」；damped、vdp、resonance 同样（中英两套）。撇号用 ASCII `x'`，和工具其他地方一致 |
| 说明的第一句 | 「x'' = −x 写成系统：令 y = x'（速度），得 x' = y、y' = −x。」再接原来的相图内容 |
| 孪生链接 | 说明下面一行链接样式的按钮：系统 → 二阶「同一个方程的二阶写法 x'' = −x」，二阶 → 系统「同一个方程写成系统 x' = y, y' = −x（y = x'）」；四对都连了。**resonance ↔ beats 不是同一个方程**（sin t 对 F·cos(g·t)），标签写「相关预设：……」并说明区别 |
| 没动的 | Lotka–Volterra、鞍点、星形结点（x、y 是两个独立未知函数） |
| 规则 | 写进 CLAUDE.md 架构规则 9；`presets.test.ts` 强制：任何 f 恰好是 `y` 的平面预设，名字和说明第一句都必须定义 y = x'，孪生互指且存在，「同一个方程」只允许出现在内核系统逐点一致的那三对上（推导测试） |
| 顺手 | 参数区空提示在二阶模式下写 `k*x`（新标签，进无裸 y 测试） |

### Z2：两张图一起看（tag `z2-dualview-done`）

| 项 | 做法 |
|---|---|
| 三选一 | `ViewKind` 加 `both`；链接 `view=both`，旧链接的 `phase` / `time` 照常解码。默认：二阶方程 → 两张一起；自治平面系统 → 相平面；非自治平面系统 → 解的图像；一阶不提供切换（六种情况有测试）。四个力学预设自带 `view: "both"` |
| 控件搬到图的正上方 | 一排分段按钮「相平面 / 解的图像 / 两张一起」（`data-view-switch`），任何模式和 `/embed` 都有；左栏原来的单选钮去掉。「t 起 / t 止」和「同时画 x'(t)」留在左栏，两张一起时也显示 |
| 并排 / 堆叠 | 两张 340 px 能放下就并排，否则堆叠，800 px 以下必堆叠；每张图各自量槽位宽度算画布，谁也不压扁谁。实测 1300 px 视口并排各 410×295，1024 px 堆叠各 617 宽，700 px 单列各 652 宽 |
| 说明行 | 每张图上方一行小字：「相平面 — 横轴 x，纵轴 x'（速度）」/「相平面 — 横轴 x，纵轴 y」/「解的图像 — 横轴 t，纵轴 x」（画了 x'(t) 时「纵轴 x 与 x'」），中英两套，讲课模式保留并放大 |
| 联动 | 同一条曲线在两张图里同一个颜色（7 色调色板，前两个就是原来的蓝、橙；初值点画成同色小圆点；两个方向不再分色）；悬停任一张图的曲线 → 两张图同时加粗；相平面空白处悬停 → 预览曲线两张图同时出现；点击固定、删除、撤销、清除两张图同步；查询命中点两张图都标（深红菱形） |
| 解的图像不吃点击 | 光标一直是箭头；说明行写明「添加曲线请用左栏的初值，或在相平面上点击；在这张图上点一下定不了初值（还缺 x'）」。`lib/linked-views.ts` 的指针状态机只有 hover 一种动作（测试：任何点击都是 `actions: []`） |
| 其余 | 等比只作用于相平面，「永远不等比」的说明只挂在解的图像下面；PNG 两张一起导出（实测 1672×634，页脚 = 方程、范围、t 范围、来源）；`/embed` 支持 `view=both`；「时间序列」改称「解的图像」/ "Solution graph" |
| 测试 | `defaultView` 六种情况；URL 往返 `view=both` + 旧值；`nearestSeriesCurve` / `reduceGraphPointer`（推导的屏幕距离；点击无动作）；组号 i = 相平面第 i 对 = 图里第 i 条 = `curveColor(i)`；调色板不撞标记色；`exportDualFooterText`；预设的 view；`timeSeriesBox` 的并集规则没动 |

### Z3：文档（tag `z3-docs-done`）

帮助「操作 → 视图」重写（三选一、控件在图上方、联动、为什么解的图像点不出曲线）；「记号」加一句「平面系统里的 x 和 y 是你自己选的两个未知函数；二阶方程里第二个坐标永远是 x'（速度）……预设把二阶方程写成系统时会在名字和说明里写明 y = x'」；鼠标 / 标记列表按新颜色写；嵌入高度在生产构建上重新量过（Logistic 例子 960 px 框：带表单 1191 → 常数 1200，不带 895 → 900；二阶两张一起在框里堆叠：1483 / 1348；733 px 框 3139 / 1678，写进帮助）。`lib/changelog.ts` 追加 2026-09-28 一条；CLAUDE.md 模块表 + 「LINKED PICTURES」工作规则；README。

### Z4：widget 里的解的图像（tag `z4-widget-done`，widget **`z-1`**）

| 项 | 做法 |
|---|---|
| 工具返回的曲线带 `times` | `trace_trajectory`、`query_solution` 的每条 leg 加 `times`，与 `points` 用同一个 `thin(…, 1000)` 抽稀（只按长度选索引，两个数组逐项对齐；每条 leg 最多多约 18 KB）。`analyze_*` 不返回曲线。测试：x' = y, y' = −x 的点落在圆上 `times[i]` 处；rk4 上限 1000 的 leg 对齐且末时刻 = `tEnd`；查询从 t₀ = 2 起；一阶显式的 times 就是 t 坐标；微分形式从 0 起（自身参数） |
| widget | 平面 / 二阶场景有同样的三选一（新结果按默认规则打开：二阶 → 两张一起）；解的图像**堆叠**在相平面下面（widget 窄）；每张图上方说明行；每条曲线一色（工具自己的曲线是第 0 组）、初值点圆点；悬停联动、预览联动、查询命中点；二阶场景有「同时画 x'(t)」；两句提示是 widget 版本（「在相平面上点击添加曲线」）。t 范围 = 工具自己曲线的时刻范围，没有曲线时从快照时刻起 20 个单位 |
| 版本 | `WIDGET_VERSION` `y-1` → **`z-1`**（本轮唯一一次；Z2 特意没动 widget）；`server.test.ts`、`smoke.mjs` 同步；changelog 带「删除后重新添加」的 action |
| 模拟主机实测 | 加了两个诊断钩子（`mock.click`、`mock.pointer`）驱动 widget；见第 4 节 |

## 3. 完整验证（`z4-widget-done`，生产构建）

| 检查 | 结果 |
|---|---|
| `npx tsc --noEmit` | 0 错误 |
| `npm test` | 48 个文件，1110 个测试 = **1108 通过 + 2 既有预期失败**（本轮新增 13 个测试文件级用例，其中 `lib/linked-views.test.ts` 是新文件；没有新的 `it.fails()`，没有改容差） |
| `npm run build` | 通过 |
| `npm run smoke`（本地生产构建） | 24/24，URI `?v=z-1`，`trace_trajectory` 的 leg 带 `times` |

### 浏览器实测（生产构建 `next start`，内置浏览器；面板隐藏时 rAF / ResizeObserver 不送达，联动用 `requestAnimationFrame` 打桩 + 像素分类读出）

| 场景 | 结果 |
|---|---|
| Z1 · 预设 harmonic / damped / vdp / resonance | 名字含 `x''` 和 `y = x'`；说明第一句「… written as a system: let y = x' (the velocity), so x' = y, y' = …」；孪生链接文本正确；点链接切到 `harmonic2`（URL `m=second&eq=x''+%3D+-x`），再点回来切回 `harmonic`；lotka 没有链接；二阶模式参数区提示是 `k*x` |
| Z2 · 二阶 `x'' = -x` 默认视图 | 三个按钮，`both` 按下；两张图、两条说明行；左栏没有单选钮，有「t 起 / t 止」「同时画 x'(t)」，网格密度 / 箭头 / 辅助线可见，等比可用 |
| Z2 · 切到 time / both / phase | 图的数量与左栏控件随之变化（time：只有图、密度和辅助线隐藏、等比禁用）；URL 带 `view=…` |
| Z2 · 布局 | 1300 px 视口并排各 410×295；1024 px 堆叠各 617 宽；700 px 单列、表单在上、两张图各 652 宽 |
| Z2 · 联动（像素分类计数） | 悬停解的图像上曲线 1 → `data-hovered-curve="1"`，相平面覆盖层出现橙色高亮 + 白色光晕，图里曲线 1 加粗；移开 → 全部清空；悬停相平面上曲线 0 → 光标手型、两张图蓝色加粗；悬停空白 (3, 2.5) → 青色预览两张图都有；点击 → 第 3 条曲线两张图都出现（URL `traj=…;3.00035,2.5`），撤销 → 回到 2 条；解的图像上点曲线、点空白 → 曲线数不变，光标 `default` |
| Z2 · PNG 两张一起 | 生成 1672×634 的 PNG（= (410+16+410)×2 × (295+22)×2），没有失败提示 |
| Z2 · 中文 + 讲课模式 | 说明行「相平面 — 横轴 x，纵轴 x'（速度）」「解的图像 — 横轴 t，纵轴 x …」16 px；显示范围行隐藏；按钮「相平面 / 解的图像 / 两张一起」 |
| Z2 · `/embed?controls=0&view=both` | 有切换、两张图、没有表单 |
| Z2 · 预设自带视图 | harmonic → both（URL `view=both`）；lotka 保留当前选择；resonance → both；先选相平面再开 beats → 仍是相平面（预设不带 view 时保留选择） |
| Z2 · 一阶方程 | 没有切换按钮、没有说明行，一张图 |
| Z3 · `/help` en / zh | 「视图」条目、`yLine`、鼠标 / 标记条目、高度段落（1200 / 900 …）都在；首页「What's new」第一条 2026-09-28 |
| Z4 · 模拟主机（`--mcp` 本地生产构建） | 握手 `vector-field-tool-widget 0.4.0`，URI `?v=z-1`；`second_order_damped`：三个按钮、说明行、两张图（3 个 canvas），「No curve yet」；点 Solution graph → 只剩 1 个 canvas；点 Both → 3 个；在相平面上 pointerdown/up → 「Clear my curves (1)」，「No curve yet」消失；悬停解的图像上曲线起点 → 相平面覆盖层 27086 个已画像素（高亮），移开 → 0；在解的图像上点击 → 仍是 1 条；勾「Also draw x'(t)」→ 说明行「vertical x and x'」；Undo → 0 条；`trajectory`（自治系统）默认相平面、切 Both 后说明行「vertical x and y」，legs 的 `times` 与 `points` 等长（33 / 33）；`query_second` 默认两张一起（22 / 22）；`first_order_sqrt_en` 没有切换；探针只有第 5 轮记录过的 zod eval CSP 探测，无 error / rejection；size-changed 最高 1272 px |

## 4. 提交与 tag

```
0be5d47 [Z4] docs: changelog action (widget z-1 means remove and re-add the connector), help, README, CLAUDE.md
fdd19b9 [Z4] widget z-1: the solution graph under the phase plane, the three-way view switch, the linkage
062322b [Z4] tools: trace_trajectory and query_solution legs carry their clock (`times`, thinned with the points)
d2d8525 [Z3] docs: help (three-way view, the switch above the pictures, the linkage, why the graph takes no click, x and y vs x'), changelog, CLAUDE.md, README; embed heights measured again
3bbaef1 [Z2] web shell: the view switch above the pictures, both pictures side by side with captions, linked, PNG of both
fa8f49a [Z2] components: one color per kept curve in both pictures, linked highlight and preview, the graph's hover, PNG of both
d91b3d0 [Z2] lib: the "both" view (phase plane + solution graph), defaultView, view=both in the link, captions, linked-view pointer machine, curve palette, dual footer; presets carry a view
509d042 [Z1] params hint says k*x in second-order mode; CLAUDE.md: symbols the tool writes itself, the tool explains
4274684 [Z1] presets: a second-order equation written as a system names the equation and y = x'; twins linked
3c36e9f [Z] docs: deliverables numbered by round (round-01 ... round-10), ROUNDS.md maps numbers to the letter codes
```

tag：`z1-presets-done`（509d042）→ `z2-dualview-done`（3bbaef1）→ `z3-docs-done`（d2d8525）→ `z4-widget-done`（0be5d47）。本文档所在的 `[Z] docs` 提交在 `z4-widget-done` 之后。

内核 `lib/core` 一个字没动；`app/layout.tsx`、`app/mcp/route.ts` 没动；`lib/core`、`lib/render` 纯度守卫照常通过（`lib/render/color.ts` 只加了一个常量数组和一个纯函数）。

## 5. 线上状态（2026-09-28）

推送（`git push origin main --tags`，由我执行：`1fe1b4e..bd21e26`，四个 tag 一并推上）之后：

| 检查 | 结果 |
|---|---|
| GitHub Actions run 36398768060（typecheck / test / build） | ✓ success |
| Vercel 部署（commit bd21e26） | ✓ success（commit status） |
| `npm run smoke -- https://tools.studycase.net/mcp` | **24/24**，widget uri `?v=z-1`，`trace_trajectory` 的 leg 带 `times` |
| 线上 `/vector-field` 预设「Harmonic oscillator x'' = −x (as a system, y = x')」 | 名字定义 y；说明第一句「x'' = −x written as a system: let y = x' (the velocity), so x' = y, y' = −x」；孪生链接「The same equation written as a second-order equation: x'' = −x」；默认 `both`（URL `view=both`）；两张图 + 两行说明 |
| 线上首页 | 「What's new」第一条 2026-09-28，琥珀色 action「MCP users must remove and re-add the connector…」 |

## 6. 验证清单（按「最快发现问题」排序）

每一步失败时回滚到括号里的 tag（`git revert` 对应段的提交更稳妥；`git reset --hard <tag> && git push --force-with-lease origin main` 前请先确认）。

1. **线上冒烟，30 秒**：`npm run smoke -- https://tools.studycase.net/mcp` 应为 24/24 且 URI 是 `?v=z-1`。失败说明部署或 widget 有问题 → 回滚到 **`y-polish-done`**（整轮撤回）。
2. **点开预设里的 Harmonic oscillator，1 分钟（教授那句话的直接检验）**：`https://tools.studycase.net/vector-field`，预设下拉框「Planar systems」组里选 **「Harmonic oscillator x'' = −x (as a system, y = x')」**。页面上任何地方都要说清楚 y 是 x'：下拉框里选中的名字本身；说明第一句「x'' = −x written as a system: let y = x' (the velocity), so x' = y, y' = −x.」（点 ⓘ 看全文）；说明下面一行「The same equation written as a second-order equation: x'' = −x」，点它应切到二阶写法，那边的说明下面又有「… written as a system: x' = y, y' = −x (y = x')」指回来。中文界面（右上角 Language）同样：「简谐振子 x'' = −x（写成系统，y = x'）」。同组的「Damped oscillator …」「Van der Pol …」和「Non-autonomous」组的「Forced oscillator x'' = −x + sin t (as a system, y = x')」也应如此。失败 → **`y-polish-done`**。
3. **二阶方程默认两张图，1 分钟**：预设「Harmonic oscillator x'' = −x」（Second-order equations 组）。图的正上方应有「View: Phase plane | Solution graph | Both」，Both 按下；两张图并排（窗口够宽）或上下；相平面上方写「Phase plane — horizontal x, vertical x' (velocity)」，解的图像上方写「Solution graph — horizontal t, vertical x …」。点三个按钮，图和左栏的控件跟着变；地址栏出现 `view=…`。失败 → **`z1-presets-done`**。
4. **联动，1 分钟**：同一页面，把鼠标放到解的图像里的一条曲线上——相平面里同一条（同色）应加粗；放到相平面的曲线上——解的图像里同色那条加粗；在相平面空白处悬停，青色预览曲线两张图都出现；点一下，新曲线两张图都有、颜色相同、相平面上初值点是同色小圆点；Undo 两张图都退回。**在解的图像上点击不应有任何反应，鼠标也不变手型。** 失败 → **`z1-presets-done`**。
5. **老链接没坏，1 分钟**：打开一个上课用过的旧链接（例如带 `view=time` 或 `view=phase` 的），图和结论应与以前一致，页面上没有黄色的「链接参数无效」条；首页四张例子卡片正常。失败 → **`z1-presets-done`**。
6. **Claude 里的 widget，3 分钟**：**先删除连接器再重新添加**，然后问「分析 x'' + 0.5*x' + x = 0」。widget 里应有「View: Phase plane | Solution graph | Both」，默认两张图（解的图像在相平面下面），说明行同网页；在相平面上点一处，解的图像里出现同色曲线。再问「画 x' = y, y' = -x 过 (1, 0) 的轨线」（trace_trajectory）：默认相平面，点 Both 后解的图像里有 cos t 的曲线。widget 空白 = 连接器没有重新添加。失败 → **`z3-docs-done`**（只撤 widget 那一段，网页保留）。
7. **PNG，1 分钟**：Both 视图下点「Download PNG」，应得到一张两图并排的图片，底部一行写方程、范围、t 范围。失败 → **`z1-presets-done`**。
8. **嵌入页，1 分钟**：把第 3 步的链接 `/vector-field` 换成 `/embed`，加 `&controls=0`：应有切换按钮和两张图，没有表单。失败 → **`z1-presets-done`**。
9. **讲课模式，1 分钟**：第 3 步页面点「Lecture mode」：两张图上方的说明行仍在且变大，数字行隐藏。失败 → **`z1-presets-done`**。
10. **首页与帮助，1 分钟**：首页「What's new」第一条是 2026-09-28，带琥珀色的「删除连接器后重新添加」；`/help` 的「View」条目讲三选一和联动，「Notation」里有「In a planar system x and y are the two unknown functions you chose; in a second-order equation the second coordinate is always x'…」，嵌入一节的高度是 1200 / 900。失败只影响文案，不必回滚。
