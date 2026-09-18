# TUVW 轮总结（2026-09-18）：参数与滑块 · 相平面自解释 · 讲课模式

**做到哪**：T、U、V、W 四段全部做完，每段都在浏览器里实测过，三道门禁全绿，没有触发停止条件。
**最后一个良好 tag**：`w-lecture-done`（依次是 `t-params-done` → `u-slider-done` → `v-phaseplane-done` → `w-lecture-done`，每个 tag 处 tsc / test / build 都是绿的）。
**你需要手动做的**：① widget 版本从 `p-2` 升到了 `t-1`（摘要现在写明参数取值），所以 Claude 里的连接器要**删除后重新添加** `https://tools.studycase.net/mcp`（只断开重连不够）；② 照第 7 节的清单验证，第 3 步（亲手拖滑块）是我替不了你的；③ 看一眼 `docs/TUVW-open-questions.md` 的第 1、8、9 条，那三条需要教授的意见。

---

## 1. 做了什么

### T 段：网页上的符号参数（tag `t-params-done`）

| 项 | 做法 |
|---|---|
| T.2 参数区 | 表达式下面的「参数」区，每行「名字 = 值」。表达式里出现的自由符号**自动列出**（值 1、橙色高亮「待赋值」）；表达式改动时行跟着增删，**值和滑块被记住**，名字再出现就原样恢复；学生自己加的行不会被自动删。值非法时上一次的合法值继续生效并在该行说明，不白屏。名字与 `t x y v pi e` / 函数名冲突时给一句可读的话。**删除仍在使用的参数被拒绝**，该行保留并提示「方程仍在使用 k」。四种模式共用一组（M 和 N、f 和 g 用同一个 k）。 |
| 两条护栏 | `sin(ty)` 里的 `ty` 不会被当成参数（保留内核原有的「是不是想写 t*y」报错）；`ky` 会列出，但该行写明「被当作一个参数；想写乘积请写 k*y」。 |
| T.3 链接 | `&p=k:0.8,L:2`。教授要的直达链接：`/vector-field?m=first&g=k*y*(1+-+y/L)&p=k:0.8,L:2`。非法条目整条丢弃并在页面上以 `p:名字` 报告；方程用了参数而链接没给值不算错（页面列为待赋值）。 |
| T.4 摘要带参数（现存 bug） | MCP 摘要、网页结果区、PNG 页脚、widget 摘要都写明「… with k = 0.8, L = 2」（中文「…，其中 k = 0.8、L = 2」）；只列方程真正用到的名字；无参数时逐字不变，没有空的 with。 |
| T.5 四种模式 | 一阶显式、微分形式、平面系统、二阶方程都支持，推导测试覆盖每一种（`k*y` 在 k = 2、y = 3 处为 6；`x'' = -k*x` 在 x = 3 处为 −6；M = k·y = 6、N = m + t = 1.5）。 |
| T.6 预设 | Logistic `k*y*(1 - y/L)`（0.8, 2）、**新增**牛顿冷却 `-k*(y - Ta)`（0.3, 20；y 范围 0..40）、阻尼振子 `x'' + 2*b*x' + w^2*x = 0`（0.25, 1）、受迫 / 拍频 `x'' = -x + F*cos(g*t)`（0.5, 1.2）、Lotka–Volterra 四个参数（1, 0.5, 0.75, 0.25；第二个平衡点 (3, 2)）。说明全部按新取值重新手推，并写了「改这个参数会怎样」。首页两张例子卡片的标题跟着改了。 |
| T.7 帮助 | 语法一节加「参数」一段。 |
| 内核 | 只加了三个**静态**辅助（导出参数名规则、`freeSymbols`、`freeSymbolsSecondOrder`）：只 parse 不求值，没有阈值，没有数值机械。 |
| widget | 摘要文字变了 → `WIDGET_VERSION` = **`t-1`**，smoke 脚本和测试同步。 |

### U 段：参数滑块（tag `u-slider-done`）

| 项 | 做法 |
|---|---|
| U.1 滑块 | 每行一个「显示滑块」开关 → 滑块 + 最小 / 最大 / 步长。默认范围 0..2×\|当前值\|（负值镜像，0 处 −1..1），约 100 个整齐的步长。状态进链接：`&sl=b:0:2:0.01`。预设「阻尼振子」打开就有 b 的滑块，「受迫 / 拍频」打开就有 g 的滑块。 |
| U.2 性能 | 场和固定曲线每个值都重算；features（平衡点、分类、方程类型）**按实测耗时自适应**：上一次 ≤ 25 ms 就每个值都同步重算（分类连续跟手），否则沿用既有的 250 ms 防抖，上一次结果留在屏幕上、变淡、显示「Computing…」。旧图始终留到新图算完。没有做「拖动时降网格密度」：采样场只要 0.3 ms，省不出时间（见 decisions）。 |
| 生产构建上修掉的一个问题 | 页面第一次 features 计算是冷的，超预算后把整个第一次拖动锁进了防抖（dev 下看不到）。现在前 3 次测量按 150 ms 的宽松预算判断。 |
| U.4 共振 | 固定曲线的跨度改为跟随时间序列视图的 t 范围（上限 500），关闭了上一轮 open-questions #10。拍频预设 t 范围 0..70，能看到一整个包络。推导测试：从静止出发，t∈[0,70] 内 x(t) 的峰值略低于包络最大值 2F/\|g²−1\|：g = 1.2 时 2.27，g = 1.05 时 9.76。 |
| U.5 测试 | 滑块的 URL 往返；分类序列在推导出的临界值处切换；防抖与「计算中」的状态机。 |

### V 段：相平面自己讲课（tag `v-phaseplane-done`）

| 项 | 做法 |
|---|---|
| V.1 零斜线 | `f = 0` 实线、`g = 0` 虚线，两种颜色 + 两种线型；复用 marching squares。一阶方程是 `dy/dt = 0` 一族，微分形式是 `N = 0` / `M = 0`。**符号翻转但不为零的地方（`1/x` 的极点、跳变）不会被画成零斜线。** |
| V.2 特征方向 | 双曲且特征值为实数的平衡点处，屏幕上定长的短线；稳定方向实线 + 箭头朝里，不稳定方向虚线 + 箭头朝外。退化结点只画一条，ⓘ 里写明「这正是退化结点的定义特征」；星形结点、复特征值、非双曲点不画，前两者说明原因。打开这个开关后，平衡点那行的 ⓘ 会说哪条是哪条。 |
| V.3 分界线 | 每个鞍点四支：不稳定流形正时间积分（虚线）、稳定流形逆时间积分（实线），粗黑。偏移量 = 范围对角线的 1e-3（约 1 像素），随缩放正确。只对鞍点画。 |
| 开关与图例 | 「在图上显示」三个复选框，默认全关，进链接 `&aids=n,e,s`；一阶图只有零斜线。图例在画布右上角，名字用学生自己的记号（二阶是 `x' = 0` / `x'' = 0`，没有 y）。PNG 里也有。 |
| V.5 帮助 | 「图上的标记」补三项。 |
| 内核 | 没碰。全部在 `lib/phase-aids.ts`，用的是现成的等值线、Jacobian 和积分器。 |

### W 段：讲课模式（tag `w-lecture-done`）

| 项 | 做法 |
|---|---|
| W.1 取舍 | 照你的表：隐藏特征值、tr / det、平衡点坐标、常数解的数值、偏差与阈值、范围行、扫描分辨率、查询数值、最后一条轨线那行；保留分类名、标记、「与可分离方程一致」、坐标轴刻度、**方程 + 参数取值那一行**，以及短句形式的 caveat。 |
| 红线（都有测试） | 「中心或弱螺旋（线性化无法区分）」逐字不变，绝不是「中心」；临界阻尼保留「重根或近重根」短句；唯一性失效的「!」在结论行、画布标签、徽章上都在；收尾时我自己查出「经过唯一性失效点的固定曲线」那句话跟着「最后一条轨线」一起被藏了，已补回短句。 |
| W.2 交互 | 右上角按钮（嵌入页顶栏也有）；链接 `&lecture=1`，`/embed` 同样支持；切换不重算；每一行仍有 ⓘ，第一项就是普通模式下完整的那一行。 |
| W.3 | 结果区 19 px、标题 23 px，画布刻度 / 轴名 / 图例放大，时间序列画布也放大；PNG 跟随模式，页脚仍是方程 + 参数取值 + 范围。 |
| 传给 Claude 的数据 | 完全不受影响。有一条源码检查：`app/mcp/*`、`lib/scene.ts`、widget 页、`lib/core/*` 里不出现 “lecture”。 |

---

## 2. U.3 分岔实测（单独列出）

**对象**：预设「阻尼振子」`x'' + 2*b*x' + w^2*x = 0`，w = 1，滑块 b ∈ [0, 2]，步长 0.01。
**手推**：J = [[0, 1], [−w², −2b]]，判别式 tr² − 4 det = 4(b² − w²)。b < w 复根、实部 −b < 0 → 稳定螺旋；b = w 重根 −w，J 不是单位阵的倍数 → 退化结点；b > w 两个相异负实根 → 稳定结点。**临界值 b = w = 1。**

**实测（生产构建 `next start`，浏览器里在滑块上按下指针后逐值拖动，b 从 0.20 到 1.50，共 131 个值）：**

| b | 结论行 |
|---|---|
| 0.20 … **0.99** | stable spiral (stable focus)（例：b = 0.20 时 λ = −0.2 ± 0.9798i，手算 √(1 − 0.04) = 0.9798 ✓） |
| **1.00** | degenerate node ⓘ，λ = −1, −1，带 `repeatedRoot` caveat（没有压掉） |
| **1.01** … 1.50 | stable node（例：b = 1.01 时 λ = −0.8682, −1.1518，手算 −1.01 ± √0.0201 ✓） |

**切换点与手推的 b = w = 1 完全一致**（精确到滑块步长 0.01）。分类行**每个值都更新**，整个拖动过程没有落进防抖。每个值从 input 事件到新分类出现在屏幕上：中位 **33.5 ms**，p90 43 ms，最大 51 ms。dev 构建下切换点相同，中位 66 ms。

同一结论的纯函数测试在 `lib/slider-bifurcation.test.ts`（还验了 w = 2 时临界值跟着移到 b = 2、b = 0 是「中心或弱螺旋」、负阻尼不稳定）。

补充实测：贵的系统 `x' = k x y, y' = x² − y`（features 约 1 s）拖动时每个值 30–40 ms，结果区变淡并显示「Computing…」，停手后更新——防抖路径也是好的。

说明：内置浏览器窗口在后台时截图会超时，所以这次拖动是脚本逐值派发事件、读 DOM 完成的，不是人手拖的（见 open-questions #2）。

---

## 3. 其他浏览器实测

| 检查 | 结果 |
|---|---|
| Logistic 直达链接 `p=k:0.8,L:2` | 常数解 y = 0 不稳定、y = 2 稳定；结果行「dy/dt = k*y*(1 - y/L) with k = 0.8, L = 2」 |
| 方程后面加 `- h` | 出现待赋值的 h = 1，k、L 的值保留；h 改成 0.3 → 常数解 y = 0.5（不稳定）/ 1.5（稳定），与手算 (0.8 ± 0.4)/0.8 一致 |
| 删除仍在使用的 k | 被拒绝，提示「The equation still uses k, so this row stays…」 |
| 手动加一行名字 `t`、k 的值打成 `abc` | 两条可读提示，图还在，仍用 k = 0.3 |
| 阻尼 / LV / 微分形式链接 | λ = −0.25 ± 0.9682i；(0,0) 鞍点 λ = 1, −0.75，(3,2) 中心或弱螺旋 ±0.866i；微分形式链接里的坏条目 `t:3`、`k:abc` 在页面上被点名报告 |
| 拍频预设 | 打开即时间序列、t∈[0,70]、曲线跟到 t = 70（以前停在 50）；拖 g 重算 |
| 单摆 `aids=n,e,s` | 分界线的「眼睛」形、x 轴上的 `x' = 0`、x = kπ 处的 `x'' = 0`、鞍点处的特征方向、图例，都在；鞍点的 ⓘ 写明哪条稳定哪条不稳定 |
| 一阶 `dy/dt = y − t` 零斜线 | 只有 `dy/dt = 0` 一族（直线 y = t），只提供零斜线一个开关 |
| 讲课模式链接 | 「stable spiral (stable focus) ⓘ」，无任何数字；ⓘ 展开完整一行；退出后所有数字立刻回来；h2 23 px、行 19 px |
| `/embed?lecture=1&controls=0`（单摆） | 「center or weak spiral (linearization cannot tell) ⓘ」×3、「saddle ⓘ」×2 |
| `dy/dt = sqrt(y)` 讲课模式 | 「Constant solution: domain edge, left · ! uniqueness fails here…」，画布标签「domain edge, left !」，徽章在 |
| 生产构建，中文，LV + 滑块 + 三种辅助线 + 讲课模式同开 | 正常：「鞍点 ⓘ」「中心或弱螺旋（线性化无法区分）ⓘ」 |

---

## 4. 完整验证

```
$ npx tsc --noEmit
tsc exit: 0

$ npm test
 Test Files  47 passed (47)
      Tests  1076 passed | 2 expected fail (1078)

$ npm run build
✓ Generating static pages using 13 workers (11/11)
Route (app): / · /_not-found · /embed · /help · /icon.svg · /mcp · /opengraph-image · /robots.txt · /sitemap.xml · /vector-field · /widget
build exit: 0

$ npm run smoke        （对本机生产构建 next start）
24/24 passed          widget uri: ui://vector-field-tool/widget.html?v=t-1
```

```
推送之后（2026-09-18，`git push origin main --tags` 由我执行，四个新 tag 一并推上）
GitHub Actions run 35396534765（typecheck / test / build）           ✓ success，1m37s
Vercel 部署（commit ae6a8bf）                                        ✓ Deployment has completed
$ npm run smoke -- https://tools.studycase.net/mcp                    24/24 passed，widget uri …?v=t-1
线上首页                          data-news-entry="2026-09-18" 已在最前
线上 /help                        语法一节已有「参数」一段
线上 logistic + 讲课模式链接      服务端渲染出 k、L 两行参数，data-lecture="true"
```

一个观察：这次 Vercel 从 “deploying” 到完成用了约 **20 分钟**（21:24 → 21:44 UTC），以往是 40 秒左右。期间线上一直是旧版 `p-2`，冒烟 23/24（唯一不过的就是版本号那条），完成后才变 24/24。构建本身本机只要 30 秒，多半是 Vercel 那边排队；如果以后还这样，值得看一眼 Vercel 控制台（我没有登录权限，看不到构建日志）。

测试数：958 + 2 → **1076 + 2**（新增 118 个；2 个预期失败是既有的，这一轮没有新增 `it.fails()`，没有改任何容差）。

```
$ git log --oneline s-changelog-done..HEAD      （本文档的提交在其后）
5124b72 [W] lecture: a kept curve through a point where uniqueness fails is still said in lecture mode
f954a72 [W] docs: README and CLAUDE.md for rounds T-W (parameters, sliders, overlays, lecture mode, widget t-1)
594cf1c [W] changelog: parameters and sliders, the three overlays, lecture mode; widget t-1 means remove and re-add the connector
06e1b73 [W] help: parameters, sliders, the overlays and lecture mode in the controls list
539f09e [W] web shell: the Lecture mode switch (page, /embed, link lecture=1, PNG)
ea4bcee [W] lecture: what each result line prints in lecture mode (pure presentation)
c3567e3 [V] help: nullclines, eigen-directions and separatrices in the markers list
f2e3b17 [V] web shell: the three overlays on the picture, their legend, their switches, the link (aids=n,e,s)
69fa738 [V] phase-aids: nullclines, eigen-directions, separatrices (pure, from existing machinery)
27c4718 [U] feature-schedule: a page's first three measurements are cold and get a lenient budget
9368835 [U] test: the classification along a slider on b switches exactly at b = w (derived from 4(b² - w²))
4f240b0 [U] presets: the damped oscillator opens with a slider on b, the beats with one on g and t in [0, 70]
6acec03 [U] web shell: parameter sliders, live recomputation, the sliders in the link (sl=)
854d392 [U] time series: a kept curve follows the view's t range (traceSpans, capped at 500)
c14a904 [U] feature-schedule: when the expensive results are recomputed during a slider drag
06472f3 [U] params: a slider per parameter row (range, snapping, what travels in a link)
b91cc80 [T] web shell: the pending value field sets the whole border (React warned about border + borderColor on rerender)
f986d6b [T] help and home: the parameters paragraph in the syntax section, example cards follow the presets
8b61bc5 [T] presets: five presets written with symbolic parameters
68f8c20 [T] web shell: the parameter area (auto-discovered rows, values in force, link sync)
ce71ce8 [T] url-state: the parameters in the link (p=k:0.8,L:2)
0a0d3b3 [T] summaries: the equation line names the parameter values (tools, PNG footer, widget t-1)
c2132af [T] params: the pure state of the parameter area (discovery, rows, values, text)
0bbe367 [T] parse: parameterNameProblem and freeSymbols (static), freeSymbolsSecondOrder
8998eca [S] docs: S summary table order          （以下 4 个是开工前就在的 S 段收尾提交）
5a1d61a [S] docs: production smoke and the green CI runs in the S summary
77f63bd [S] CI: checkout / setup-node v5 (Node 20 deprecation notice); docs: the first CI run and its fix
00de271 [S] CI: vitest testTimeout 20 s (...)

$ git tag        （本轮新增的四个在最后）
… r-ops-done  s-changelog-done  s-spike-done  t-params-done  u-slider-done  v-phaseplane-done  w-lecture-done
```

---

## 5. 给教授的三个链接（可以直接放进讲义）

- k = 0.8、L = 2 的 logistic：`https://tools.studycase.net/vector-field?m=first&g=k*y*(1+-+y/L)&tmin=0&tmax=10&ymin=-0.5&p=k:0.8,L:2`
- 打开就有阻尼滑块、讲课模式的阻尼振子：`https://tools.studycase.net/vector-field?m=second&eq=x''+%2B+2*b*x'+%2B+w^2*x+%3D+0&traj=2,0&p=b:0.25,w:1&lecture=1&sl=b:0:2:0.01`
- 共振 / 拍频，时间序列，g 的滑块：`https://tools.studycase.net/vector-field?m=second&eq=x''+%3D+-x+%2B+F*cos(g*t)&tmax=70&traj=0,0&p=F:0.5,g:1.2&sl=g:0.5:1.5:0.01`

（也可以直接选预设再点「复制链接」；嵌入课程网站时把 `/vector-field` 换成 `/embed`。）

---

## 6. 本轮新增 / 改动的文件

新增：`lib/params.ts`、`lib/feature-schedule.ts`、`lib/phase-aids.ts`、`lib/lecture.ts`、`lib/slider-bifurcation.test.ts` 及各自的测试；`docs/TUVW-*.md`。
改动：`lib/core/parse.ts`、`lib/core/second-order.ts`（仅静态辅助）；`lib/url-state.ts`、`lib/labels.ts`、`lib/scene.ts`、`lib/interactive.ts`、`lib/time-series.ts`、`lib/export-footer.ts`、`lib/site-text.ts`、`lib/changelog.ts`；`components/VectorFieldApp.tsx`、`useInteractiveScene.ts`、`drawScene.ts`、`drawTimeSeries.ts`、`VectorFieldCanvas.tsx`、`TimeSeriesCanvas.tsx`、`exportScenePng.ts`、`HelpContent.tsx`；`app/mcp/tools.ts`（摘要带参数）、`app/mcp/server.ts`（t-1）、`app/widget/page.tsx`（摘要带参数）、`app/vector-field/presets.ts`；`scripts/smoke.mjs`；`README.md`、`CLAUDE.md`。
**没动**：`app/layout.tsx`、`app/mcp/route.ts`、J 轮的全部启发式常数、`lib/core` 的所有数值模块、`lib/render`。

---

## 7. 验证清单（按「最快发现问题」排序）

每一步失败时回滚到括号里的 tag（`git reset --hard <tag> && git push --force-with-lease origin main` 前请先确认；更稳妥的做法是 `git revert` 对应段的提交）。

1. **线上冒烟，30 秒**：`npm run smoke -- https://tools.studycase.net/mcp` 应为 24/24 且 URI 是 `?v=t-1`。失败说明部署或 widget 有问题 → 回滚到 **`s-changelog-done`**（整轮撤回）。
2. **老链接没坏，1 分钟**：打开一个上课用过的旧链接（例如 `…/vector-field?m=first&g=y*(1-y)&tmin=0&tmax=10&ymin=-0.5&ymax=1.5`）和首页四张例子卡片。图、结论应与以前一致，页面上没有黄色的「链接参数无效」条。失败 → **`s-changelog-done`**。
3. **亲手拖一次滑块，2 分钟（我替不了你的一步）**：预设「阻尼振子」，拖 b 从左到右。应看到：图不闪；分类行在 b = 1 附近从 stable spiral 变成 stable node，b = 1 那一格是 degenerate node 加 ⓘ；不卡。若分类要停手才更新，说明这台机器慢（open-questions #1），不算坏。严重卡顿 → **`t-params-done`**（保留参数，撤掉滑块及之后的全部）。
4. **参数区，2 分钟**：一阶模式输入 `k*y*(1 - y/L)`，应自动出现 k、L 两行（橙色）；填 0.8 和 2；把方程里的 `/L` 删掉再打回来，L 的值应还是 2；点 k 那行的 ×，应被拒绝并说明。点「复制链接」，在新标签页打开，应是同一张图。失败 → **`s-changelog-done`**。
5. **Claude 里的摘要，3 分钟**：**先删除连接器再重新添加**，然后问「画 dy/dt = k*y*(1 - y/L)，k = 0.8，L = 2」。摘要第一行应以 `… with k = 0.8, L = 2` 结尾，widget 正常渲染且它的摘要也带这句。widget 空白 = 连接器没有重新添加。摘要不对 → **`s-changelog-done`**。
6. **讲课模式，2 分钟**：第 3 步的页面点右上角「Lecture mode」。数字应全部消失、字变大；点结论行的 ⓘ 应展开完整一行；再点一次按钮，所有数字立刻回来（不应出现「Computing…」）。再开预设「Harmonic oscillator」，讲课模式下必须仍是 “center or weak spiral (linearization cannot tell)”。失败 → **`v-phaseplane-done`**。
7. **辅助线，2 分钟**：预设「Pendulum」，勾上「Show on the picture」的三个开关。应看到分界线的眼睛形、图例、鞍点处的短线；点鞍点那行的 ⓘ 应写明稳定 / 不稳定方向。再开「Saddle」预设：四支分界线应正好压在坐标轴上。失败 → **`u-slider-done`**。
8. **共振，1 分钟**：预设「Forced oscillator / beats」，应直接打开时间序列、t 到 70、能看到一整个拍；把 g 往 1 拖，振幅变大（超出画面是正常的，把 x 范围调大即可）。失败 → **`t-params-done`**。
9. **嵌入页，1 分钟**：把第 5 节第二个链接的 `/vector-field` 换成 `/embed`，应直接是讲课模式，顶栏里有讲课模式按钮。失败 → **`v-phaseplane-done`**。
10. **PNG，1 分钟**：讲课模式下点「Download PNG」：图上没有命中点坐标之类的数字，页脚仍有方程、参数取值和范围。失败 → **`v-phaseplane-done`**。
11. **首页与帮助，1 分钟**：首页「What's new」第一条是 2026-09-18，带琥珀色的「删除连接器后重新添加」；`/help` 的控件一节有参数、滑块、在图上显示、讲课模式四条，语法一节有「参数」一段，标记列表末尾有零斜线 / 特征方向 / 分界线三条。失败只影响文案，不必回滚。
