# H 轮决策记录（2026-09-03）

所有偏离《H 阶段：上线 + 按数学优先拍板》文档的决定和理由，以及文档没有规定、由我拍板的细节。按条目顺序。

## H1：上线准备

- **H1.1 `base-url.ts`**：显式 `BASE_URL` 本来就在最前面，这次把解析改成纯函数 `resolveConfiguredBaseUrl(env)` 并加 7 个测试锁定优先级。没有 scheme 的 `BASE_URL` 补 `https://` 并警告，而不是拒绝。自检警告在模块加载时用 `console.warn` 打一次，所以构建日志和函数日志里都能看到（next.config.ts 和 route.ts 都 import 它）。
- **H1.2 成本上限**：没有做分布式限流（按文档）。核心的三个长循环（积分器每次尝试、平衡点搜索每个种子、势函数每个路径检验点、等值线每条）接受一个 `checkpoint` 回调，由工具层注入「过了截止时间就抛 `BudgetExceeded`」；内核自己不读时钟，保持纯函数和确定性。预算 2000 毫秒。限流器是进程内滑动窗口 240 次/60 秒，`tryAcquire(now)` 显式传时间以便测试；注释和 README 都写明它在 serverless 上只是尽力而为。表达式上限：zod 层 200 字符对 f/g/expr/M/N 一致，解析器另有 500 硬上限；测试覆盖五个字段。
- **H1.3 首页**：中英双语一句说明 + 交互页面链接，MCP 说明退到第二段。

## H2：按数学优先重新拍板

### H2.1 爆破判据

- `maxSpeed` 删除；新增 `maxPosition`，默认 1e6 × max(1, |起点|, 盒子范围)。只有位置非有限或超出该界才报 `blew_up`。
- **新增两个状态**（文档没有要求，但不加就要说谎）：`singular`——位置有限但向量场在此无定义/无穷大/不连续（起点在奇点上、RK4 某级非有限、自适应步长被压到 hMin 以下）；`arc_length`——按弧长停止（H2.2 用）。文案表两种语言都补了。
- **`x' = e^x` 越过爆破时刻的状态是 `singular` 而不是 `blew_up`**：位置到 709 时 `exp` 就溢出成 Infinity，而位置本身远小于界。按「只看位置」的规则这是「场无穷大」，不是「位置发散」。测试里明确记录了这一点。
- **默认 `atol = 1e-9` 下刚性衰减的终态是 `max_steps`**：`x' = -1e7 x` 的平衡判据要求 x < 1e-15，但绝对容差让控制器分辨不了 1e-9 以下的位置，于是在那里抖动到步数上限。这是有界解撞步数上限，按文档说实话。`atol = 0`（纯相对控制）时精确到达平衡点。是否改默认值见 open-questions。
- **通过工具调用永远看不到 `blew_up`**：位置界 ≥ 观察范围，所以总是先 `left_box`。`trace_trajectory` 的测试期望相应改为 `left_box`（x² 的解在 t = 1 − 1e-5 离开 [−1e5, 1e5]）。

### H2.2 hover 预算

- `HOVER_DIAGONALS = 2` 条画布对角线的**屏幕**弧长，度量用当前 viewport 的 `worldToScreen`（仿射，所以最后一段可以精确线性插值切到限长，时间一并插值）。步数只作兜底 `HOVER_STEP_CAP = 4000`。
- **预览停止盒改为可见范围的 7 倍**（每边扩 3 倍）：3 倍时直线解在 1.5 个半宽处就撞盒，比两条对角线短，测试抓出来了。
- 测试：快场（×100）与慢场同一屏幕长度（精确到 1e-6）；4 倍缩放后屏幕长度不变而世界长度变为 1/4；到达平衡点的预览按自身规则更短。

### H2.3 固定轨线

- 停止盒 = 输入范围每边扩 9.5 倍（整体 20 倍），`fixedStopBox(homeBox)`；`tSpan = 50` 仍然是时间上限。hook 里点击用 `traceFixed`（依赖 home box），悬停用 `tracePreview`（依赖 viewport）。
- 网页外壳与 widget 不再用「可见范围三倍」。

### H2.4 类型识别三档

- 判定：`consistent` 偏差 < 阈值/10；`borderline` 在 [阈值/10, 阈值×10]；`inconsistent` > 阈值×10。**加了第四档 `untestable`**（有效采样点 < 5：值无定义，或舍入误差大到分辨不了阈值）——文档只说三档，但「没测到」和「不通过」必须区分。
- **始终返回全部 8 种形式**，每种带 `verdict`、`maxRelDeviation`（untestable 时为 null）、`threshold`、`samples`、`dropped`。工具摘要：通过的形式逐条列出，临界的用单独模板并附临界 caveat，不通过的压成一行（带偏差），不可检验的压成一行。恰当时积分因子两条自动成立（μ = 1），返回但标 `details.trivial`，摘要不列。
- **偏差相对于被比较两项的量级**（`relDev(a, b)` 除以 max(|a|,|b|)，低于 1e3·eps·g 的量级视为零）。自治检验以前除以 max(|ref|, 1)，那是绝对量，改掉了。
- **线性检验改法**：原来的「小步长二阶中心差分」看不到 y + 1e-3 y²（截断误差比一阶项小得多）；改为在三个相距很远的 y 处检验线性插值恒等式，偏差 = ε(y₂−y₁)(y₃−y₂)/max|g|，测试按此推导。
- **导数类检验（恰当、积分因子）带误差估计**：四阶中心差分在 h 与 h/2 做 Richardson 外推，误差估计 = 两者之差/15 + 舍入下界 8·eps·(Σ|f|)/(12h)；在 h、10h、100h（不超过盒子的 15%）里取误差估计最小的。某点的不确定度超过阈值/10 × 量级就丢弃该点并计数（exp(10x) + y 在 x ≳ 1.65 处全部丢弃，剩 6 个可用点仍能判定）；两边都在自身不确定度内为零时视为恒等式成立。
- 采样点从 7 个增加到 13 个无理分数位置。
- **测试推导中的两处更正**（不是容差改动）：(1) 显式形式只缩放 g 不是等价方程（M 变 N 不变），所以恰当性的缩放不变性用微分形式 M、N 同乘常数来验证；(2) 线性方程 g = xy + sin x 恰好满足 Bernoulli 模板 n = 0（g/y = x + sin(x)/y），数学上是对的，但课本定义要求 n ≠ 0, 1，所以 n ∈ {0, 1} 报为「线性方程，不算 Bernoulli」（verdict inconsistent，证据里说明）。

### H2.5 Bernoulli

- 搜索区间 [−12, 12]，步长 0.05 + 二分。找到 n 后尝试贴到分母 ≤ 6 的既约分数（|p/q − n| ≤ 1e-7），**贴合后用贴合的指数重新拟合并要求偏差 < 阈值/10** 才采用，`exponent` 字段给 "1/2"、"-1"、"7" 这样的字符串，证据里写明是贴合的；贴不上就报 `n ≈ 1.414214（数值近似…）`。
- 测试：y + x√y → 1/2；y + y^1.5 → 3/2；x/y + y → −1；y + y⁷ → 7（旧区间找不到）；y + x·y^1.41421356 → 不贴合。

### H2.6 恰当方程路径自检失败

- `FirstOrderView.implicitCheck = { pathDeviation, tol, passed }` 在检测到恰当（consistent 或 borderline）时总是给出；`passed` 为假时不画等值线，摘要、网页外壳、widget 都显式说明并报出实测偏差与阈值（新增文案 `exactPathCheckFailed`，两种语言）。
- `exactPotential` 的基点若落在奇点上（例如 (x dy − y dx)/(x²+y²) 在含原点的盒子上，中心就是原点），退到一个无理分数位置的基点，否则所有路径积分都是 NaN、偏差是 Infinity、学生看不到数字。
- 测试用的正是 dθ：局部恰当性判据通过（∂M/∂y = ∂N/∂x 处处成立，除原点），但在含原点的盒子上没有单值势函数，两条路径绕原点的圈数不同——这是「闭形式但不恰当」的经典例子，本身就值得教。

### H2.7 连续解集

- 几何判据两条，满足其一即可：非双曲点的协方差矩阵特征值比 ≤ 1e-6（共线），或 ≥ 6 个点且 ≥ 80% 的点与其 4 个最近邻局部共线（比值 < 0.02，即落在一条光滑曲线上——直线判据抓不住圆）。计数判据（≥ 3 个点、≥ 60% 非双曲）**与**几何判据同时满足才报 `possible_continuum`；只满足计数报新增的 `multiple_non_hyperbolic`，文案说明「孤立的退化平衡点，需逐个做非线性分析」。几何证据放在 `EquilibriaResult.geometry`。
- **顺带修了一个真问题**：`classify` 原来是纯相对的（按最大元素归一化），于是 f = (x²−1)², g = (y²−1)² 的四个二重根处，Newton 停在离根 4e-13 的地方，差分雅可比是 3e-12·I，被判成漂亮的星形结点。现在 `findEquilibria` 把问题自身的雅可比尺度（典型场强 / 盒子尺寸）传给 `classify`，最大元素低于 1e-9 × 该尺度的雅可比视为零 → `non_hyperbolic`。不传该参数时行为不变（纯相对），「慢但双曲的系统保持类型」的旧测试仍通过。
- 测试：x 轴（共线）、单位圆平衡集（曲线判据，共线性 > 0.1）、四个孤立二重根（不报连续集，报 multiple_non_hyperbolic）。

### H2.8 星形结点容差带

- 重根分支里判别式**不精确为零**时挂 `repeatedRoot` caveat（两种语言的完整句子）；精确为零（diag(2,2)、Jordan 块）不挂。注意 [[1, −1e-12],[1e-12, 1]] 的判别式在双精度下就是精确的 0（1e-24 对 1 消失），所以它不带 caveat；测试改用 ±1e-6。

### H2.9 `locale` 必填

- 去掉 `.default("en")`，description 写 REQUIRED。测试 helper 在测试没给 locale 时自动补 `en`，另有专门测试对四个工具验证漏传即报错并点名 `locale`。`scripts/smoke.mjs` 补上 locale。

### H2.10 美式拼写

- 正则整词替换：centre(s)→center(s)、linearisation→linearization、colour→color、behaviour→behavior、normalised→normalized、recognised→recognized、analyse→analyze、grey→gray、neighbour→neighbor、honour→honor 等，作用于 labels、detect-form、tools（含 description）、server、presets、首页和相关测试。`lib/core` 内部注释里的英式拼写没有全部动（不面向用户）。

### 「不改的」里要求的一条

- 平衡点 / 一阶特征列表跟随可见范围保持不变，但网页外壳和 widget 的列表上方现在有一行 `featuresBox`：「以下结果按当前可见范围 x∈[…], y∈[…] 计算；缩放或平移后会重新计算，结论依赖于所考察的范围」。

## 提交粒度上的偏离

- `[H2] forms` 一个提交里同时有 H2.4、H2.5、H2.6：三条都改 `detect-form.ts` 的返回结构和 `labels.ts`、`tools.ts` 的同一段摘要代码，拆开会出现编不过的中间提交。
- `[H2] equilibria … classify` 一个提交里同时有 H2.7 和 H2.8：两条都往 `labels.ts` 的表里加键，同一文件不好拆。
- `[H2] locale required; American spelling; results state their range` 一个提交：同上，都改 `labels.ts`。
