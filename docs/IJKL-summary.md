# I–L 轮总结（2026-09-08/09 夜跑）

- **做到哪了**：I（记号改为 dy/dt）→ J（数学正确性）→ K（网站完整化）→ L（MCP 收尾）四个阶段全部完成，四个 tag 都打了：`i-notation-done`（f562d39）、`j-math-done`（3dd4f27）、`k-website-done`（f7ab5ca）、`l-mcp-done`（1e825bc）。J 阶段跑了三轮对抗式审查（39 + 41 + 21 条发现）和三轮修复；K 阶段在会话自带浏览器面板逐条验收；L 阶段用本地模拟主机跑通 widget。最终门禁：tsc 0 错误、808 个测试通过 + 3 个标记为预期失败（共 811）、build 通过、本地生产构建 smoke 19/19。main 直线，`h2-reviewed..HEAD` 共 85 个提交。
- **最后一个良好 tag**：`l-mcp-done` = 1e825bc（main HEAD）。往前依次是 `k-website-done`（f7ab5ca）、`j-math-done`（3dd4f27）、`i-notation-done`（f562d39）、`h2-reviewed`。
- **你要手动做的**：(1) **推 origin 就是 Vercel 生产部署**（`git push origin main`）——编排者只在被告知时才会在会话末尾推，推没推看本文件末尾编排者追加的那一行，没有那行就是没推；(2) widget 版本 h-2 → l-1，**Claude 里必须断开并重新连接连接器**（否则旧的 URI 缓存会导致 widget 空白 / Resource not found）；(3) `BASE_URL` 已在 Vercel 设好，不用改；(4) 第一次部署后打开 `https://tools.studycase.net/opengraph-image`，看中文那行有没有变成方块（构建时 next/og 要联网取字体，见 open-questions）；(5) 部署后跑 `npm run smoke -- https://tools.studycase.net/mcp`；(6) 帮助页给的 iframe 高度（带控件 1280 px / 只读 1260 px）是代理在窄视口量的，嵌进 Google Sites 后按实际调；(7) Claude 实机测 widget 交互和「先调工具」规则（验证清单第 9–12 步），今晚没法替你做。

---

## I 阶段：一阶方程的自变量改为 t（tag `i-notation-done` = f562d39）

| 项 | 做了什么 | 提交 |
|---|---|---|
| I.2 解析器 | `compileScalar(expr, params, { variables: "ty" })`：一阶模式下只认 `t`、`y`，`t` 绑定到内核横坐标 `p.x`；写 `x` 报 `ParseError.code = "x_in_first_order"`（"一阶方程的自变量是 t，请把 x 写成 t"）；以 `dy/dx =`、`dy/dt =`、`y' =`、`x' =` 开头的输入报 `lhs_in_expression`（"只需输入右端"），措辞按模式区分（一阶说 dy/dt，系统说 x'/y'）；`y = 0 ? 1 : -1` 这类比较号打错的情况提示"写 =="。`SystemSpec.variables?: "xy" \| "ty"`，`toSystem()` 产出的归约系统带 `"ty"`，Scene 随之携带，widget 本地编译零改动 | 502e737, d1f13ad, 2e1d9a6, f383b1a |
| I.2 内核文案 | detect-form 八种形式的名称、检验描述、证据、caveat 全部改为 t 记号（可分离 `dy/dt = f(t)·h(y)`、齐次 `g(kt, ky) = g(t, y)`（缩放参数改叫 k）、线性 `P(t)·y + Q(t)`、恰当 `∂M/∂y = ∂N/∂t`、积分因子 `μ(t)`）；自治 = "右端与 t 无关"；`FirstOrderView.expr` 为 `dy/dt = g` / `(M) dt + (N) dy = 0`；`firstOrderEquilibria` 选项 `tRange`（`xRange` 保留为弃用别名）；英文冠词修正（an exact equation） | e2145ed, 35307f5 |
| I.2 外壳与工具 | labels 双语：`tMin/tMax`、范围模板加 `{hv}` 占位（x 或 t）、`xInFirstOrder`、`lhsInExpression(+System)`、一阶语法提示；网页外壳按模式显示 `dy/dt = g(t, y)`、`M(t, y)`、`N(t, y)`、t 最小/最大；画布画坐标轴名（`lib/render/axis-names.ts`，横轴名放在轴线下方避免与常数解标签重叠）；预设改 t 记号；`analyze_first_order` 标题/描述/参数说明改 dy/dt（参数名 `xMin/xMax` 不改，描述说明是 t 的范围）；摘要 `t ∈ [..]`；README / CLAUDE.md / 首页改记号；"最近一条轨线"一行按模式区分（显式一阶报到达的 t 坐标而不是积分参数，微分形式不说方向） | 8a5a30d, c77ed95, a12a3c4, dbb61f2, 560bcb1, d80b86f, f562d39 |
| I.3 等比开关 | `fitViewport(box, w, h, { equalScale })`（默认等比；关闭时精确填满输入范围）；非等比时箭头按各向异性映射画（与画出的解曲线相切，`arrows.ts` 改用 `pixelScale(viewport)`）；hook 接 `equalScale`，切换即复位视图；网页外壳复选框（默认勾选）+ 常驻警告行"横纵比例不同，图上的角度不代表真实斜率。"+ 显示范围一行注明"等比缩放后 / 填满输入范围"；widget 本阶段保持等比（L.3 才加开关） | f02a2df, 85d8ca3, d232e2a |
| 复位时的特征盒 | 复位视图（未缩放/平移）时平衡点、常数解、类型识别按**输入范围**算，与等比与否、画布长宽比（手机/桌面）无关；缩放或平移后按可见范围算；说明文字相应改写 | 6a2faf1 |
| smoke | 本地无 `BASE_URL` 的构建对"资源地址是绝对的"这一项报 SKIP 而不是 FAIL | dd285d7 |
| docs | 等比开关、`{hv}` 约定、特征盒规则、测试数写进 README / CLAUDE.md | 5b48c50 |

测试 337 → 409，全部按推导给期望值。对抗式审查（5 视角，13 条发现 × 3 反驳者）13 条全部确认并修复（`[I-fix]` 提交）。

### I 阶段浏览器验收（会话自带浏览器面板，`next dev`）

- 10 个预设逐个点击：画布非白像素 8–15%，平衡点/常数解/类型列表正确（阻尼振子 −0.25 ± 0.96825i、Lotka–Volterra 鞍点 + 中心或弱螺旋、单摆 kπ、logistic y=0 不稳定 / y=1 稳定、恰当方程 y=0 稳定性随 t 变化 + 奇点 (0,0) + 恰当/齐次一致）；无 `role=alert`。
- 输入 `dy/dx = y` → "只需输入方程的右端，「dy/dt =」这一部分是默认的。一阶方程的自变量是 t（dy/dt = g(t, y)），请把 x 写成 t。"；`x*y`、`xy` → 请把 x 写成 t；`y = 0 ? 1 : -1` → 提示写 `==`；系统模式 `x' = y` → 「x' =」「y' =」措辞。
- 等比复选框取消 → 警告行常驻、显示范围改为"填满输入范围"、特征盒一行仍是输入范围；重新勾选 → 警告消失。
- 英文界面恰当预设：`an exact equation`、`∂N/∂t`，无冠词错误。
- 控制台：修掉 `border`/`borderColor` 混用的 React 警告后无 error。

---

## J 阶段：数学正确性（tag `j-math-done` = 3dd4f27）

**怎么做的**：J.1–J.5 分四个 worktree 并行实现（j1 平衡点 / j2 唯一性 / j3 非自治 / j4 二阶），rebase 后 `--ff-only` 合入，集成提交 90989ed。然后在冻结的 90989ed 上跑对抗式审查，修一轮（`[J-fix]`，35c6bbc）；再审（`[J-fix2]`，80559da）；K2/K3 合入后再审一轮并按课堂可能性分级（`[fix]`，3dd4f27）。**所以 `j-math-done` 在提交线上排在 K 的多数提交之后**：K1 是在 90989ed 上并行做的，先合入（61ee1e7）；J 的第二、三轮修复在它之后。tag 对应的是「J 的数学修完了」这个状态，不是「K 之前」。

### J.1–J.5 首轮实现（集成于 90989ed，测试 409 → 538）

| 项 | 做了什么 | 提交 |
|---|---|---|
| J.1 平衡点会漏 | 种子密度按沿扫描线 f、g 的变号次数自适应（12..32/轴，尺度无关）；64×64 细网格上 \|F\| 的局部极小值作为独立自检，不靠近已找到平衡点且明显低于邻居的再跑一次 Newton；定义域边界上的根用单侧差分雅可比 + 回溯（步进入未定义区就折半）；`seeding: SeedingReport` 报出种子数和是否封顶。x' = y, y' = −x − y + x⁷ 在 [−10,10] 上找回原点 | 2dccce1 |
| J.5 连通分量 | 非双曲点先按 4 近邻 + 欧氏最小生成树的边分连通分量（相邻点弦中点的 Newton 抛光必须落在两点之间且是**新的**零点），每个分量内部再判几何；`EquilibriaResult.truncated` 独立字段，`hit_limit` 由它派生 | f9e18b3 |
| J.5 病态缩放 | `classify` 给了 `zeroFloor` 时按误差判零（\|det\| 相对特征值量级）；x' = 1e10 x, y' = 1e-10 y 在首轮里按单一误差模型判为 non_hyperbolic（后来 J-fix 的逐元误差改判为 unstable_node，见下） | b7093d0 |
| J.5 外壳 | 两个外壳和工具摘要显示「列表已截断（上限 {max}）」和 `domainEdge` caveat | 4002fc5 |
| J.2 唯一性探测 | `lib/core/uniqueness.ts`：在常数解 / 平衡点处取逐级缩小的距离 δ_k（1e-2·尺度起，每级 /4，8 级），差商对 log δ 拟合斜率 −α；α ≥ 0.25 且单调 → unbounded，0.1 ≤ α < 0.25 → borderline，否则 bounded_at_tested_scales（是测量，不是证明，所以没有「唯一性成立」的句子）；探测在已找到的根处减去残差 g(t, c)。sqrt(y) 的 α = 1/2、y^(1/3) 的 α = 2/3 都是推导值 | 37e211a |
| J.2 常数解 | 定义域边界上的常数解（sqrt(y) 的 y = 0）用二分到相邻双精度数找到（50 次二分不够：最后一个有限 y 处 \|M\| ≈ 1e-9 会被残差判据拒绝）；稳定性新增 `edge_approach` / `edge_leave`；每条常数解带 `uniqueness` | 285a928 |
| J.2 外壳与工具 | `TrajectoryView.nonUnique`：起点或途经被标记点的轨线（按线段而不只按顶点判）标出「数值解只是其中一条」；`uniquenessSentence()` 在 labels 里只写一次，工具和两个外壳共用；画布：非唯一常数解画 4 px 双线 + '!' 徽标，非唯一平衡点旁 '!'，边界线用点划线；`trace_trajectory` 也跑 findEquilibria + 唯一性探测来标记曲线 | 40df35c |
| J.3 时间依赖探测 | `detectTimeDependence`：对若干无理 t 值比较 F（首轮是数值判定；J-fix 改为静态规则，探测只作证据）；`Scene.timeDependent { snapshotT, maxRelDeviation }`；外壳在输入范围上只测一次，缩放平移不会翻转结论；快照时刻进 systemKey，换 t 就清轨线 | 5eda07f |
| J.3 工具与外壳 | 依赖 t 的系统不报平衡点和分类，摘要说明是 t = … 的快照；`analyze_system` / `sample_field` 加可选参数 `t`；画布标出 t；特征盒那行对非自治场景隐藏，换成快照说明 | ef6d53c |
| J.4 二阶降阶 | `reduceSecondOrder`：字符串层把 x''、x' 换成占位符，两边相减得 E，检验 E 对 x'' 仿射，F = −E(x''=0)/(E(x''=1)−E(x''=0))，mathjs simplify（`exactFractions: false`，化简串只在 9 个采样点复现到 1e-12 时采用）；降阶结果 `x' = y, y' = F` 作为字符串进 `analyze_system` 的全部逻辑并显示给学生 | b124d11 |
| J.4 工具 | `analyze_second_order`；`analyze_system` 的分析体抽成 `analyzePlanar` 共用；特征值期望相对 \|λ\| 的 1e-7（由中心差分雅可比误差推出） | 86d031a |
| J.4 外壳 | 网页外壳「二阶方程」输入模式 + `damped2` 预设（`x'' + 0.5*x' + x = 0`） | 4c59e01 |
| 集成 | `analyzePlanar` 统一承载时间依赖分支 → findEquilibria → 唯一性 → truncated，所以 `analyze_second_order` 也得到快照说明和唯一性句子；推导测试 x'' = −x + sin(t)：无平衡点、降阶句在第一行、t = 1.5 时每个采样的 y' 平移 sin 1.5 | 90989ed |

### 审查第一轮（冻结在 90989ed）与修复（`[J-fix]`，HEAD 35c6bbc，测试 638）

- **怎么跑的**：多视角在冻结工作树里写探针复现，共 **39 条**发现，按严重度排序后每条派 3 个独立反驳者（数学重推 / 代码复现 / 学生可见性），默认「驳回」。**13 条被 3/3 确认**（equilibria 视角 9 条、uniqueness 视角 4 条），**其余 26 条没有验证**：验证智能体撞上账号用量上限，反驳者没跑完。这 26 条没有被驳回，只是没被复核；修复时按「复现了就修」处理，报告里把它们标为 `unverified->reproduced`。
- **13 条确认项**：#1 盒子级残差容差造成假平衡点（x' = y, y' = x⁸ + 1 在 [−100,100]² 上列出 14 个）；#2 一阶内核同样的盒子级容差（y⁸ + 1 有 11 条常数解）；#3 Marquardt 缩放的 LM 步把秩 1 雅可比的每个种子拉向原点（SI 模型丢两条轴）；#4 病态但可逆的雅可比被判奇异（1e8 与 1e-8）；#5 x⁷ 例子在 [−100,100]² 及更大盒子上仍丢原点；#6 定义域边界上的一条平衡线只报一个点（x' = sqrt(x)·y, y' = x）；#7 整矩阵单一误差掩盖可分辨的行列式；#8 相距小于 1e-6 × 盒子的两个单根被静默合并；#9 方向相关的奇点被当平衡点（x' = xy/(x²+y²), y' = y − x）；#10 y 范围下边缘的 y = 0 被说成「半稳定」；#11 sqrt|y|、|y|^(1/3) 的常数解只有网格点正好落上才找到；#12 光滑方程在大盒子上被判「导数无界、Lipschitz 失效」；#13 陡但 Lipschitz 的右端（tanh(1e6 y)）被判无界。

| 组 | 修了什么 | 提交 |
|---|---|---|
| A 平衡点 | 接受判据改为**局部**的：Newton 步小于位置容差（1e-13 × 盒子）或残差落到该点雅可比 + 舍入下界之内，盒子级统计一律不进判据（#1）；行缩放的 Newton 求解（#4）；去重用两次运行各自声称半径之**和**（#8，取 max 会把 x⁸ 的重根列两次）；**消失性检验**：Newton 停住的非根点做 F 连续性检验，不连续的进 `singularPoints` 而不是平衡点（#9）；两个外壳和工具报出奇点 | aa20d92, ff3a200 |
| A 雅可比 / 分类 | `jacobianWithError.errors` 逐元误差，判别式改算 (a−d)² + 4bc（tr² − 4det 会消成 4 eps 噪声，sin(πx), sin(πy) 的 121 个格点 caveat 随机）；det / trace / 判别式的判零全部基于误差；x' = 1e10 x, y' = 1e-10 y 改判 unstable_node（#7、#37） | 9833db8 |
| A 种子 | 秩亏时用截断伪逆步（#3，SI 模型报 possible_continuum，两条轴都在）；**变号四叉树**：在扫描格子角点上 f、g 同时变号的格子递归细分到深度 12 再跑 Newton（#5，x⁷ 在 [−3,3]² 到 [−1000,1000]² 及偏置盒上都找到原点 + 两个鞍点）；定义域边界种子（#6，sqrt(x) 线报为 ≥ 20 个边界点的连续解集）；逐元零下界；每个上限（REFINE_CELL_CAP 1024、VISIT 8192、ROOT 128、EDGE 256）都在 `seeding` 里报出 | 0a792c5 |
| B 唯一性 | 最细尺度判定：一直往下降（最多 60 级）直到差商停止变化（level-off → bounded，带当时的局部指数）或到达舍入下界（尾部 4 级拟合，≥ 0.25 unbounded、≥ 0.1 borderline）；判定在 3 个以上盒子上一致（#12、#13、#25、#35）；舍入下界改用 g 的局部量级 eps·(\|g(c+d)\| + \|g(c)\|)/0.1 而不是相邻级的统计（1 − exp(−100y) 在半宽 100 的盒子上曾判 untestable） | 401ba78, b69df72 |
| B 常数解 | 根的接受也改为局部的（两侧阶梯 \|M(c ± h·4^−k)\| 按 δ^β 下降、β ≥ 0.05；#2、#28）；尖点根用黄金分割求 \|M\| 极小再过消失性检验（#11、#27）；范围边缘外多探一格，从阶梯读出定义侧（#10、#36）；自治性第三态 `untestable`（#15）；y·log\|y\| 的根报为精确 0（#16） | 5a88fea |
| B 外壳 | 非唯一标记按曲线自身范围探测而不依赖输入盒子（#14、#29）；边界句子说明定义在哪一侧、`{side}` 占位、`edge_varies`；画布用 `stabilityShort` 词而不是内部键（#17、#32）；3·y^(2/3) 的负底数分数幂提示进句子和工具描述（#38） | c327b51, dbe9979 |
| C 二阶 | x'' 系数含 t 时在 5 个 t 值上采样、系数结构化提取（#18）；采样加盒子里的 13 个点（#21）；弯引号 / unicode 撇号 / 双撇号归一化，x''' 有自己的错误码（#22）；化简只用 simplifyCore + 两条精确改写，−9.81/0.1 按原样显示（#23）；10 个 `second_order_*` 错误码，网页外壳双语（#31） | d2ee294 |
| C 非自治 | **静态规则**：f 或 g 里出现 t 就是非自治，探测只作证据（#19、#20，见 decisions）；快照时刻加入探测时刻，sqrt(t − 5) 在 t = 10 报「定义域随 t 移动」 | d0b7550 |
| C 文案 | 「平衡点只对自治系统有定义」改为「本工具不对非自治系统做该分析」（#26）；奇点连续解集警告进 Scene（#30）；截断只说一次、sample_field 说明放在场数据前（#33、#39）；二阶语法提示写明数值检验的局限 | 419b76c, 8ee7f4c |
| 集成 | A 与 B 合并：消失性检验改用新的唯一性下降（minOffset）、奇点合并；C 合并：奇点句子统一走 `equilibriaNotices` | 2ea8f84, 35c6bbc |

### 审查第二轮（冻结在 35c6bbc）与修复（`[J-fix2]`，HEAD 80559da）

- **41 条**发现，四个视角（equilibria / first-order / second-time-text / tools-mcp），每个视角先复核上一轮的修复（全部在 3 个以上盒子和 1e±6 缩放下复现为已修），再找新的。**验证再次被用量上限打断**：这一轮没有反驳者投票，41 条都是单一视角的复现记录。编排者按「课堂会遇到 / 极端盒子」分了三组修，极端盒子的明确跳过（列在 open-questions）。
- 上一轮 K1 已合入（61ee1e7，在 90989ed 上并行做的），所以这一轮的修复排在 K 提交之后。

| 组 | 修了什么 | 提交 |
|---|---|---|
| JA 平衡点 | `parse` 给每个表达式算**运行时舍入误差界**（每步运算加 eps，函数按 \|f'\| 传播）和下溢标志（#31，cos(x) − 1 这类消去的重根现在按表达式自身各项的舍入下界接受）；雅可比差分步相对盒子并按函数自适应，去掉绝对 1e-6（#33）；平衡点探测从该点的位置分辨率起步（#22，\|x\|^(1/3) 的 α 在 2/3 ± 0.05）；**耗尽的 Newton 运行不再按几何尾外推接受**，尾部只作半径（#29、#23）；方向相关奇点 x²/(x²+y²)（#35）；下溢平台（x' = y, y' = exp(x) 在 [−1000,1000]² 报 `underflowPlateau` 而不是连续解集，#30）；位置容差不低于 8 eps\|p\|（#34，sin 格点在 x0 = 999990 处仍完整）；`region_of_equilibria`（0/0、max(x−1,0) 这种在二维区域上为零的场，#37）；(x+y)² 线不再报奇点（#38）；格子角点上的可去奇点（x log\|x\|，#40）；顺带把 A1 留下的 J.8 `it.fails` 变成通过的测试（#41） | 18abaa7, b2365dd, c50399f, 02e7808 |
| JB 常数解 | 阶梯自适应下降到位置下界 / 60 级（#19，tanh(1e6 y) 在 [−2.5e5, 2.5e5] 上找到）；稳定性在最细可用级读符号（#20，(y−1)(y−1−1e-5)）；只在部分 t 范围有定义的线（#21，sqrt(t)·y）；下溢平台边缘不再报成解、有平台说明（#17）；全零扫描不再走「M ≡ 0」捷径（#18，y·exp(−100y²) 在 [−1000,1000] 找回 y = 0）；y·log(y) 的可去点精确报 0（#24）；一格两根做 deflation，并**总是显示扫描分辨率一行**（#25，只修了一半）；分数幂提示只在表达式确有分数幂时加（#27）；sin(1/y) 的 y = 0 不再列出、exp(−1/y²) 在三个盒子上一致（#4、#5） | 6c01cac |
| JC 二阶 / 文案 | unicode −、×、·、÷ 在所有模式归一化（#16）；仿射性在 x'' = −3.7…10 的 8 个值上探测，abs(x'')、max(x'', −1)、sqrt(x''²) 一律拒绝（#1、#10）；x' 出现在 x'' 系数里（(1 + x'²)·x'' = −x，#9）；x''(t) + x(t) = 0 记法（#11）；xx''、tx'' 报隐式乘积并给出提示，占位符永不泄漏（#12）；`formatNumber` 保留有效数字、只有精确 0 才打成 0（#3，(−1e-5, 0) 与 (1e-5, 0) 分得开）；按定义排除的 Bernoulli 单独一行说规则（#6）；奇点截断只说一次（#8）；非自治轨线句子按实际追踪方向措辞（#14、#15） | 675e784, c71882b, 8ac64af, c2eb08c |
| 集成 | 唯一性测试里打印的点改从 scene 推导（formatNumber 变化后） | 80559da |

### 审查第三轮（冻结在 18eef51，K2/K3 之后）与最后一轮修复（`[fix]`，HEAD 3dd4f27 = `j-math-done`，测试 797）

- **21 条**发现，四个视角（kernel-classroom 6、site-embed-url 4、gestures-text 10、tools-mcp 1），**每条带课堂可能性标签**：classroom 15、edge 5、extreme 1。这一轮不再派反驳者，由编排者按标签分诊：classroom 和 edge 全修，extreme 的 1 条（#20，下溢平台句子说「两侧连续趋近」只是浮点证据）留着。
- kernel-classroom 的三条 high 都是课堂例子：展开形式的重根 y(1−y) − 1/4 找不到（分解形式能找到）；秩亏雅可比的平衡点漏掉（logistic 猎物的捕食模型丢 (1,0)、x' = xy, y' = x² − y 报 none_found 且跑 1–1.5 s）；这些点附近停住的 Newton 运行被说成「场不连续，不是平衡点」，44–47 句。

| 组 | 修了什么 | 提交 |
|---|---|---|
| FA 平衡点 | 奇异雅可比阈值改为**实测**的 detTol = max(16 eps, 2(ρ₀ + ρ₁))（ρ 为行噪声 / 最大元），绝对的 1e-8 退出搜索路径；残差下界和差分行噪声计入坐标量化 \|J_ij\| eps \|p_j\|；步的接受看「残差下降或带下界的残差下降」；停住点按各自声称半径聚类，最多一句；\|c\| ≤ 分辨率的坐标在算雅可比前**贴到 0**（7.36e-322 那种不再打给学生）。竞争模型、x' = xy, y' = x² − y、x' = y, y' = x² − y 在 1×/10× 盒子和 1e±3 单位下都列出 (1,0) 或 (0,0) non_hyperbolic、零奇点；cos(x) − 1 在 [−100,100] 上 ±14·2π 的根曾丢失，差分步扩到行噪声 10% 修回。**#5「同样输入两次结果不同」没有复现**：Duffing 和阻尼单摆各跑 20 次深度相等，内核无模块级可变状态，保留为回归测试 | 648814e |
| FA 文案 | `repeatedRoot` caveat 改为在误差判定模式下也为真的说法（特征值在数值精度内重合、判别式在估计误差内为零、精确重根与近重根数值上分不清） | 701e7a4 |
| FB 常数解 | 消去型重根：零到精度的带有一格宽的毛边，改用**上升检验**（四分点处 \|M\| 超过舍入界 10 倍）判零集是否连通；y(1−y) − 1/4 → 0.5、y² − 2y + 1 → 1，半稳定，盒子与尺度不变；dy/dt = 0 / M ≡ 0 报「右端恒为 0」专用句子；**一阶方程的自治性也改静态规则**（表达式提到 t 就非自治，t·sqrt(y) 在 [−4,0] 上不再「untestable」）；连续零采样之间 M 上升就拆开（y(1−y)(2−y) 在 [−200,200]、[−400,400] 上三个根都在）；`hasFractionalPower` 认 pow(y, 2/3) | 6d7bdb6, 592bb56 |
| FC 手势与外壳 | 双指缩放的中点平移不再丢（pan + pinch 合成一次函数式更新）；右键菜单和 12 px 提示只对触摸指针（鼠标行为逐字节不变）；`(pointer: coarse)` 下网页外壳和 widget 都换触屏提示；第三指抬起不结束 pinch，pan/pinch/长按清掉双击记忆；两个外壳按定义排除的 Bernoulli 不再混在「未通过」里、截断句只说一次；`<html lang>` 跟随语言 | e6f800f, e08a645 |
| FC 站点文案 | 帮助页悬停颜色（青色一条，固定后才分蓝/橙）、标记图例补星形/退化结点和奇点中心点、「未通过的形式」句子、logistic 卡片（y(0) > 0 的解趋向 y = 1）；**嵌入高度按实测**：logistic 例子在 960 px 宽 1267 px、800 px 单列时 1809 px、无表单 1243 px → 常数 1280 / 1260 并在文案里写明单列约 1820 px | 7202576 |
| 集成 | FB 与 FC 各自加了「右端恒为 0」句子，重复了，删掉 FC 的 `lib/labels-forms.ts` 那份 | 3dd4f27 |

### J 阶段之后仍然开着的（详见 open-questions）

- 3 个 `it.fails`：`y − 1e-20` 贴 0 的旧期望（新行为报 1e-20 并有新测试）；平面尖点平衡点从不含原点的盒子出发标不出来；x'' = −x + x'/x' 在定义域外的点 (1, 0) 仍列出平衡点。
- x' = xy, y' = x² − y 仍要 1–2 s（四叉树沿 x 轴每个格子都细分到底，1024 次封顶的运行各爬约 80 步）；sin(100y) 在 [−10,10] 上 637 个根只列 165 个（只靠「扫描分辨率」那行说实话）；sin(1/y) 无穷多根的子集随盒子变（明确 SKIP）。
- 第二轮里明确按「极端盒子」跳过的：x⁷ 在半宽 ≥ 1.5e5 的盒子丢原点；K ≥ 1e9 的病态线性系统；大盒子上紧贴极点的根；部分枚举的格点被判连续解集（#36）；相距 2e-10 的两个单根合并（#39）；#26（y − 1e9 − 0.5 在 [1e9, 1e9+1] 上）报告里没有提到，视为未处理。
- 第三轮 extreme 的 #20（平台句子的措辞）未改。

---

## K 阶段：网站完整化（tag `k-website-done` = f7ab5ca）

K1（URL 状态 + 组件抽取 + embed + 预设）先在 90989ed 上做；K2（文案 / 首页 / 帮助 / 元信息）和 K3（触屏 / 响应式 / PNG）并行 worktree，rebase 后 ff 合入（c9965a1、18eef51）。

| 项 | 做了什么 | 提交 |
|---|---|---|
| K.1 组件抽取 | 页面主体原样移到 `components/VectorFieldApp.tsx`（纯移动，便于 `/vector-field` 和 `/embed` 共用） | 2ddb00b |
| K.1 URL 状态 | `lib/url-state.ts`：`AppState`、`encodeState` / `decodeState` / `buildShareUrl`；参数 `m`（first / diff / system / second）、`g` / `f` / `M` / `N` / `eq`、`tmin/tmax`（一阶）或 `xmin/xmax`（系统、二阶）、`ymin/ymax`、`loc`、`eqs`（只在关闭等比时写 0）、`d`（5..40）、`arrows`、`t0`、`traj`（`x,y;x,y`，≤ 20 条，6 位有效数字）；默认值一律省略；解码走同一套解析器白名单，永不抛错，非法项逐个记入 `problems`（reason：queryTooLong / invalidExpression / notANumber / invertedRange / badChoice / tooMany / malformedPair …）；查询串上限 4096 字符、表达式 200 字符、数值 ≤ 1e6 | 978b8ad |
| K.1 同步与复制 | `history.replaceState` 防抖 500 ms，只在状态能编译时写、只写输入范围、embed 模式不写；「复制链接」用剪贴板，失败退回只读输入框；顶部显示「链接里这些参数无效，已忽略并使用默认值：…」；`/vector-field` 改为在服务端解码 `searchParams` 的动态路由 | 6df5ffe |
| K.2 嵌入 | `/embed` 路由（复用同一组件，`embed` / `controls` props）、`robots: noindex`、顶栏只有语言下拉 + 「打开完整页面」（带当前状态）、`controls=0` 时方程以文字显示；`next.config.ts` 的 `headers()` **只给 `/embed`** 加 `Content-Security-Policy: frame-ancestors *`，`/widget`、`/vector-field` 不加任何 frame 头（curl 验证）；画布按容器尺寸（ResizeObserver，300..900 px，高 = 宽 × 0.72），完整页面也这样（手机上固定 720 px 会溢出）；800 px 以下单列 | db99f2e |
| K.5 预设库 | 9 个章节组、20 个预设（可分离 / 线性 / 恰当 / Bernoulli / 齐次 / 解不出来的 / 唯一性失效 / 二阶与系统 / 非自治），`<select>` 分组，每个预设就是一条可分享链接（`presetUrl`）；简谐振子等于默认状态，链接只剩 `?traj=1,0;2,0` | 9105538 |
| 文档 | README「分享链接与嵌入」一节、CLAUDE.md | 61ee1e7 |
| 测试门禁 | vitest 排除 `lib/**/__probe__`（审查智能体的探针不进门禁） | bac644a |
| K.3/K.4 文案 | `lib/site-text.ts` 双语长文 + 键集合一致性测试 | 9e5b8f0 |
| K.3 首页 | 面向学生和老师：一句话说明、入口按钮、4 张示例卡片（logistic、阻尼振子二阶写法、恰当方程、Lotka–Volterra，都是 `/vector-field?…` 链接）、能做什么 + 明确边界（二维、数值非符号）、底部 GitHub / 帮助 / 「本站不使用 cookie、不做任何追踪」；`?loc=` 在服务端读，首屏就是链接语言，没有时客户端跟浏览器语言 | 6584572 |
| K.4 帮助页 | `/help` 六节：记号约定（函数列表来自 `ALLOWED_FUNCTIONS`）、操作说明（鼠标 + 触屏）、结果怎么读、已知限制、嵌入（iframe 片段 + Google Sites 步骤 + 复制按钮）、连接 Claude（放最后） | ae5fc59 |
| K.8 元信息 | 每页 `<title>` / description、Open Graph（`app/opengraph-image.tsx` 用 next/og 生成 1200×630 PNG，66.9 KB）、`app/icon.svg`、`robots.txt`（Disallow `/embed`、`/mcp`，带 sitemap）、`sitemap.xml`（/、/vector-field、/help） | c9965a1 |
| K.6 触屏 | `lib/gestures.ts` 纯状态机（tap / 双击 / 长按 / 单指平移 / 双指缩放；触摸 8 px 阈值，鼠标保持 3 px）；画布只对 `pointerType === "touch"` 走触屏路径，鼠标路径逐字节不变；`touch-action: none` 只在画布上；画布绘制抽到 `components/drawScene.ts`（不进 `lib/render`，保持其纯几何） | 5f2c204, 80bfc32 |
| K.6/K.7 | `(pointer: coarse)` 下控件 ≥ 44 px、触屏版提示文字；「下载 PNG」：`exportScenePng` 2× 离屏画布 + 页脚一行（方程、当前显示范围 3 位有效数字、站点地址），文件名带时间戳；导出的是**当前视口**（缩放后就是缩放后的图） | 18eef51 |
| 验收修复 | 链接切换模式但表达式无效时，回退值曾是系统模式的 `-x`（一阶里 x 被拒绝，页面既有提示又有解析错误、没有图）→ `MODE_DEFAULT_EXPRESSIONS`（first: `y*(1 - y)`，diff: `t` / `y`，second: `x'' + 0.5*x' + x = 0`）+ 3 个推导测试 | f7ab5ca |

测试：K1 在自己的分支上 574；K2/K3 合入后 775（772 通过 + 3 预期失败）。浏览器验收见「网站验收结果」。

---

## L 阶段：MCP 层收尾（tag `l-mcp-done` = 1e825bc）

| 项 | 做了什么 | 提交 |
|---|---|---|
| L.1 触发规则 | 五个分析工具的 description **都以 "CALL THIS TOOL FIRST …" 开头**，按工具定制（一阶：「标准的恰当或可分离方程正是你最想跳过的情形」；二阶：「有特征方程的线性振子正是你最想跳过的情形」；trace_trajectory：具体系统 + 具体起点；sample_field：只要方向场不要平衡点分析），共用尾句「即使能求出闭式解也要调用本工具，用数值结果核对推导并把图展示给学生，不要仅凭符号推导作答」，然后才是 "WHAT IT COMPUTES"（原文）和原有的 USE THIS / 表达式规则 / 范围 / locale；`ping` 不动。补了两句：二阶方程必须对 x'' 仿射（系数可含 x、x'、t，x''²、sin(x'') 拒绝）；负底数分数幂的提示在每个工具的语法规则里都说一遍。测试锁定前缀、顺序和逐工具措辞 | 06deb55 |
| L.2 J 成果的暴露 | 读 `tools.ts` 加协议级测试，全部一次通过（没有发现缺口，所以没有改工具或文案）：奇点句、下溢平台（只说一次）、`region_of_equilibria`、右端恒为 0 + 扫描分辨率、降阶句在第一行、三个工具的快照 t、平衡点唯一性 / 非唯一轨线 / 截断句的中文版 | 3b777d7 |
| L.3 widget | `WIDGET_VERSION` h-2 → **l-1**（URI `ui://vector-field-tool/widget.html?v=l-1`，server.test 锁定，smoke 检查 resources/list 和 resources/read 都带它）；widget 本来就通过与网页外壳相同的 helper 渲染 J 的全部新内容（唯一性句、非自治说明、降阶句、奇点 / 连续 / 截断句、边界虚线和 '!' 标记来自共用的 `drawScene.ts`），补了两处缺口：等比开关（共用 hook，常驻警告，范围行「等比 / 填满」）和每个平衡点的 "tr = …, det = …"；CSP 块（connectDomains / resourceDomains / baseUriDomains）、assetPrefix、根布局 history 补丁都没动 | e7b98bf |
| L.4 模拟主机 | E 阶段的 harness 从没进过仓库，新写 `scripts/mock-host/`（`npm run mock-host`）：host.html 在 :3520（转发 POST /mcp、应答 ui/initialize、收 initialized / size-changed、推 tool-input / tool-result），sandbox.html 在 :3521 **按 URL** 加载 widget HTML 到嵌套的 sandboxed iframe，CSP 头由 `_meta.ui.csp` 生成（无 eval）。srcdoc 方式不能让 Next 水合（chunk 相对 about:srcdoc 解析），真实主机也是按沙箱域名 serve 的，所以模拟主机照做 | 1e825bc |

**模拟主机实测**（`BASE_URL=http://localhost:3510 npm run build` + `next start -p 3510`）：smoke 19/19（含「资源地址是绝对的」PASS 而不是 SKIP、l-1 URI）；握手 ui/initialize（vector-field-tool-widget 0.3.0）→ initialized → 「已连接，等待工具调用…」；`analyze_first_order sqrt(y)`（y ∈ [−0.3, 1.5]，zh）走本地编译路径（「实际显示范围」一行出现）、y = 0 边界句「方程只在这条线的上方有定义，该侧的解离开它」、唯一性句（δ^−0.5、Lipschitz）、等比开关、4 种形式 + caveat，底图全画、y = 0 线画出；`analyze_system y / −x + sin(t)`，t = 1.5：无平衡点、「t = 1.5 时刻的快照」、「解曲线从 t = 1.5 出发」；`analyze_second_order x'' + 0.5x' + x = 0`（en）：降阶 `x' = y, y' = -(0.5 * y + x)`，"(0, 0) stable spiral … tr = -0.5, det = 1"；悬停 → 覆盖层 0 → 3733 个已画像素；滚轮 → 范围收窄（x ∈ [−1.987, 2.856]）；拖动 → 平移；双击 → 复位；取消等比 → 「filled to the entered range」+ 警告，再勾回；`size-changed` 3 次（如 {width: 720, height: 989}）iframe 随之调整；主机页控制台无 error，widget 内只有已知无害的 zod script-src/eval CSP 探测。

回滚：`git checkout k-website-done`；从那个 tag serve 的 widget 是 ?v=h-2，回滚后同样要重连连接器。

---

## 网站验收结果（编排者在会话自带浏览器面板实测，`next dev`，2026-09-09 上午）

环境：Windows 本机 dev server（localhost:3000），跨源测试用 Node 静态页（localhost:3601）。浏览器面板在隐藏状态下视口为 0，因此高度类测量不可靠（见末尾）。

**预设逐个点击**（`select[name=preset]`，9 个章节组、20 个预设）
- 20 个预设全部画出图（画布非白像素 9%–13%），无 `role=alert`，模式自动切换正确（explicit / differential / system / second）。
- 结果核对：logistic y=0 不稳定 / y=1 稳定；阻尼振子（系统与二阶两种写法）都是 (0,0) 稳定螺旋 −0.25 ± 0.96825i；Van der Pol 不稳定螺旋 0.5 ± 0.86603i；Lotka–Volterra 鞍点 + 中心或弱螺旋；单摆 kπ；星形结点带"重根或近重根"caveat；非自治 `x' = y, y' = −x + sin t` 显示快照说明、不报平衡点；恰当方程 (0,0) 奇点 + 齐次/恰当一致；`t dt + y dy = 0` 与 `(t+y)/t` 按静态规则报"右端含有 t，方程不是自治的"。
- 每个预设的特征计算 1–3 s 内完成（含 250 ms 防抖）。

**分享链接往返**
- 从 `?m=system&f=y&g=-x-0.5*y&…&traj=1,0;2,1&loc=en` 进入：2 条固定轨线还原（"Clear trajectories (2)"）。
- 改 xMax→4、取消等比、密度→25、语言→中文后 500 ms 内地址栏变为 `?g=-x-0.5*y&xmax=4&loc=zh&eqs=0&d=25&traj=1,0;2,1`（默认值全部省略）。
- "复制链接"：沙箱里剪贴板不可用，走兜底只读输入框，内容为完整 URL。
- 用该 URL 重新打开：表达式、范围、语言（`<html lang="zh-CN">`）、等比关闭 + 常驻警告、密度 25、2 条轨线全部还原。

**非法链接**
- `?m=first&g=x*y&tmin=5&tmax=1&d=abc&traj=NaN,1;1,1;2,2&loc=zh&eqs=9&arrows=zzz` → 200，页面显示可读提示："链接里的这些参数无效，已忽略并使用默认值：g（表达式无法解析）、tmin（范围下限不小于上限）、tmax（…）、eqs（不是允许的取值）、d（不是整数）、arrows（不是允许的取值）、traj（有格式错误的轨线起点，已跳过）。"
- 发现并修复：切换到一阶模式但 g 无效时，原回退值是系统模式的 `-x`（一阶里 x 被拒绝），页面既有提示又有解析错误、没有图 → `MODE_DEFAULT_EXPRESSIONS` + 3 个推导测试（f7ab5ca）。
- 5000 字符查询 → 200 + 提示；`g=<script>alert(1)</script>` → 200，页面里不含原样脚本，只有提示；`m=second&eq=abs(x'')=x` → 200 + 提示。

**跨源嵌入**
- `curl -I /embed` → `Content-Security-Policy: frame-ancestors *`，无 `X-Frame-Options`；`/widget`、`/vector-field` 无任何 frame 头。
- localhost:3601 的静态页用两个 `<iframe>` 加载 localhost:3000/embed（不同源）：截图可见 iframe 内画布与表单正常渲染（不是白屏）；`controls=0` 的 iframe 同样加载。
- 直接打开 `/embed?…&controls=0`：无表单、无输入框，顶栏只有语言下拉 + "Open full page"（链接带当前状态），方程以文字显示，画布非白像素 11.6%。

**窄视口（375 px 预设）**
- 单列布局（`.vf-columns` flex-direction: column，表单在上、画布在下）；画布不超出视口、无横向滚动；所有按钮/下拉/输入最小高度 44 px；画布 `touch-action: none`；提示文字改为触屏版（"轻点预览解曲线 · 长按固定 · 双指缩放 · 拖动平移 · 双击复位"）。

**PNG 导出**
- 点击"下载 PNG"（拦截 `URL.createObjectURL`）：得到 `image/png` blob 309 KB，尺寸 1440×1080 = 2 × (720 × (518 + 22 px 页脚))；文件名 `vector-field-explicit-<时间戳>.png`。

**首页 / 帮助页 / 元信息**
- `/`：中文首页，入口按钮、4 个示例卡片链接（logistic、阻尼振子二阶、恰当方程、Lotka–Volterra，均为 `/vector-field?…` 可分享链接）、"本站不使用 cookie…"、GitHub 与帮助链接；`/help?loc=en` 六节：Notation / Controls / How to read the results / Known limits / Embedding / Connecting Claude (optional)，iframe 片段带 Copy 按钮，函数列表来自 `ALLOWED_FUNCTIONS`。
- curl：`/robots.txt`（Disallow /embed、/mcp，含 sitemap）、`/sitemap.xml`（/、/vector-field、/help）、`/icon.svg`、`/opengraph-image`（image/png 66 KB）、首页 og:title / og:description / og:image 均 200。

**控制台**
- 无新的 error：只有 dev 模式的 HMR websocket 沙箱失败，以及 I 阶段修复前残留在同一标签页缓冲区里的 14 条旧警告（重新导航后计数不再增加）。

**未能在本机验收的**
- 帮助页推荐的 iframe 高度（带控件 1280 px / 只读 1260 px）是代理在窄视口测量的；隐藏面板视口为 0 无法复测桌面宽度下的真实高度。站长嵌入到 Google Sites 后按实际调整。
- `npm run smoke -- https://tools.studycase.net/mcp`（线上）未跑：未推送、未部署；本地生产构建 smoke 见下。
- 真机触屏手势（双指缩放、长按）未测；只测了纯状态机与 375 px 布局。

**响应头与 smoke（生产构建，`next start`）**

```
（最后一轮修复后，3dd4f27，port 3570）
GET /vector-field -> 200; GET / -> 200; GET /help -> 200
/embed:        HTTP/1.1 200 OK, Content-Security-Policy: frame-ancestors *, no X-Frame-Options
/widget:       HTTP/1.1 200 OK, no CSP header, no X-Frame-Options
/vector-field: HTTP/1.1 200 OK, no CSP header, no X-Frame-Options
node scripts/smoke.mjs http://localhost:3570/mcp: 18/18 passed
  (1 SKIP: widget asset URLs absolute — BASE_URL unset locally; widget uri …?v=h-2)   exit 0

（L 阶段之后，1e825bc，BASE_URL=http://localhost:3510 npm run build + next start -p 3510）
node scripts/smoke.mjs http://localhost:3510/mcp: 19/19 PASS
  incl. "widget asset URLs are absolute" PASS, "resources/list and resources/read carry the l-1 widget URI", CSP check PASS
```

---

## 验证输出（main = 1e825bc，2026-09-09 17:03，写本文档前重跑）

```
$ npm run typecheck        （tsc --noEmit）
(无输出) exit 0

$ npm test                 （vitest run，v4.1.11）
 Test Files  30 passed (30)
      Tests  808 passed | 3 expected fail (811)
   Duration  32.64s
exit 0

$ npm run build            （Next.js 16.3.4 Turbopack，本地无 BASE_URL）
✓ Compiled successfully in 425ms
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

$ git log --oneline h2-reviewed..HEAD
1e825bc [L] scripts: two-origin mock MCP Apps host for exercising the widget without Claude
e7b98bf [L] widget: version l-1, equal-scale toggle, tr/det in the equilibria list
3b777d7 [L] tools: derived exposure tests for the Phase J results in both locales
06deb55 [L] tools: every analysis tool description starts with the call-first rule
f7ab5ca [fix] url-state: a link that switches the mode falls back to that mode's expressions
3dd4f27 [fix] integrate: drop the duplicate identically-zero line in both shells
7202576 [fix] site-text: hover color, embed heights, marker legend, failed forms, logistic card
e08a645 [fix] shells: excluded forms, single truncation sentence, identically-zero line, html lang
e6f800f [fix] gestures+canvas: pinch as one update, touch-only context menu, touch hint
592bb56 [fix] integrate: shells pass identicallyZero to noConstantSentence
6d7bdb6 [fix] slope-field: cancellation-aware double roots, identically-zero right-hand side, static autonomy, zero runs
701e7a4 [fix] labels: repeated-root caveat true in both regimes
648814e [fix] equilibria: rank-deficient roots, stall vs discontinuity, coordinate snap
18eef51 [K] app: 44 px targets, PNG export with footer
80bfc32 [K] canvas: touch gestures, drawScene extraction
5f2c204 [K] gestures: pure touch state machine
c9965a1 [K] meta: site metadata, OG image, favicon, robots and sitemap
ae5fc59 [K] help: /help with notation, controls, reading the results, limits, embedding, Claude
6584572 [K] home: bilingual home page with example cards and the site shell
9e5b8f0 [K] site-text: bilingual copy of the site pages with key-parity tests
80559da [J-fix2] integrate: derive the uniqueness test's printed point from the scene after the formatNumber change
c2eb08c [J-fix2] tools/labels: excluded forms say their rule, truncation said once, direction-aware non-autonomous sentence
8ac64af [J-fix2] labels: formatNumber keeps significant digits; only an exact 0 prints as 0
c71882b [J-fix2] second-order: probe x'' at both signs, x' inside the coefficient, x(t) notation, implicit products, no placeholder leaks
675e784 [J-fix2] parse: normalize unicode minus, ×, · and ÷ before parsing in every mode
6c01cac [J-fix2] slope-field: adaptive vanishing ladder, partial-t-range lines, zero plateaus, deflation, honest notes
02e7808 [J-fix2] equilibria: no extrapolated roots, term-based floor, underflow plateau, units, corners
c50399f [J-fix2] uniqueness: a point's location resolution bounds the equilibrium probe
b2365dd [J-fix2] jacobian: step relative to the box and adapted to the function, no absolute 1e-6
18abaa7 [J-fix2] parse: running rounding-error bound and underflow flag per expression
bac644a [K] vitest: exclude lib/**/__probe__ from the gate
61ee1e7 [K] docs: share links, /embed and the preset library in README and CLAUDE.md
9105538 [K] presets: chapter library with shareable links
db99f2e [K] embed: route, frame-ancestors header, container-sized canvas
6df5ffe [K] app: URL sync, copy link, initial trajectories
978b8ad [K] url-state: AppState, encodeState / decodeState / buildShareUrl with validated links
2ddb00b [K] app: page body moved into components/VectorFieldApp (pure move)
35c6bbc [J-fix] integrate: singular-point lines flow through equilibriaNotices (main ff3a200 + j3 C.7)
8ee7f4c [J-fix] labels: second-order syntax hint documents the numerical check
419b76c [J-fix] labels+scene+shells: non-autonomous wording, singularities warning, truncation sentences, bilingual second-order errors
d0b7550 [J-fix] time-dependence: static rule (t present = non-autonomous), probe as evidence, snapshot t honored
d2ee294 [J-fix] second-order: t-dependent coefficients, box samples, prime normalization, conservative simplification, error codes
2ea8f84 [J-fix] integrate: vanishing test on the new uniqueness descent (minOffset), singular-point merge
b69df72 [J-fix] uniqueness: rounding floor from the local magnitude of g
dbe9979 [J-fix] labels+canvas: domain-edge wording, short stability tags
c327b51 [J-fix] interactive: curve-based non-unique flag
5a88fea [J-fix] slope-field: local root acceptance, cusp roots, box-edge domain edges, autonomy untestable
401ba78 [J-fix] uniqueness: finest-scale verdict, box-independent probe
0a792c5 [J-fix] equilibria: rank-one pseudo-inverse step, sign-change quadtree, domain-edge seeds, per-entry zero floors
9833db8 [J-fix] jacobian+classify: per-entry errors, error-based determinant/trace/discriminant decisions
ff3a200 [J-fix] shells: report the field's singular points found by the equilibrium search
aa20d92 [J-fix] equilibria: local acceptance criterion, row-scaled Newton solve, resolution-based dedupe, vanishing test
90989ed [J] integrate: analyze_second_order shares the non-autonomous snapshot branch through analyzePlanar
4c59e01 [J] shell: second-order input mode and preset
86d031a [J] tools: analyze_second_order; analyze_system body shared as analyzePlanar
b124d11 [J] second-order: reduction x'' = F(x, x') -> planar system at the string level
ef6d53c [J] tools+shells: snapshot semantics for non-autonomous systems, no equilibria or stability claims
5eda07f [J] time-dependence: numerical probe for non-autonomous systems
40df35c [J] interactive+tools+shells: non-unique trajectories and uniqueness sentences
285a928 [J] slope-field: domain-edge constant solutions, one-sided stability, uniqueness per solution
37e211a [J] uniqueness: difference-quotient growth probe for Lipschitz failure
4002fc5 [J] shells+tools: show truncated lists and the domainEdge caveat
b7093d0 [J] classify: error-based zero decisions for ill-scaled Jacobians
f9e18b3 [J] equilibria: connected components before the continuum test; independent truncated flag
2dccce1 [J] equilibria: adaptive seeds and a |F| local-minimum self-check; domain-edge roots
f562d39 [I-fix] axis names: the horizontal name sits below the axis line, clear of constant-solution labels
d80b86f [I-fix] shell: selected preset uses a full border, not borderColor over the shorthand
5b48c50 [I-fix] docs: equal-scale toggle, {hv} convention, features-box rule, test count
dd285d7 [I-fix] smoke: skip the absolute-URL check on a local build without BASE_URL
6a2faf1 [I-fix] interactive-scene: features box is the entered range at the home view
560bcb1 [I-fix] shells: mode-aware last-trajectory line via lib/labels-trajectory
dbb61f2 [I-fix] shell: mode-aware left-hand-side explanation, differential compile order
35307f5 [I-fix] detect-form: English articles inside FORM_NAME.en
f383b1a [I-fix] slope-field: left-hand-side check on the raw g / M / N before wrapping
2e1d9a6 [I-fix] parse: mode-aware left-hand-side message, comparison typo, assertNoLeftHandSide
d232e2a [I] shell: equal-scale toggle with persistent warning
85d8ca3 [I] interactive-scene: equalScale input
f02a2df [I] viewport+arrows: optional non-equal scale, anisotropic arrow directions
a12a3c4 [I] docs: README, CLAUDE.md, home page in t notation
c77ed95 [I] tools: analyze_first_order in dy/dt notation
8a5a30d [I] labels+shell: t notation, t min/t max, readable x and left-hand-side hints, axis names
e2145ed [I] core: first-order notation dy/dt = g(t, y), M dt + N dy = 0 in detect-form, exact, scene
d1f13ad [I] slope-field: first-order specs compile in variable mode t,y; tRange option; dy/dt notation in tests
502e737 [I] parse: first-order variable mode t,y; x and left-hand sides rejected with readable hints
8e52630 [H2-fix] docs: mark the atol question resolved by C0, test count, widget h-2

$ git tag
a-core-done b-tools-done c-render-done d-webshell-done e-widget-done f-forms-done
g-render-done g-widget-done h1-deploy-ready h2-math-done h2-reviewed i-notation-done
j-math-done k-website-done l-mcp-done night-final p0-verified s-spike-done
```

测试数变化：H 结束 337 → I 结束 409 → J 集成 538 → J-fix 638 → J-fix2 + K2/K3 775 → 最后一轮修复 797 → L 结束 811（808 通过 + 3 个 `it.fails`）。

## 验证清单（按「最快发现问题」排序；每步失败回滚到哪个 tag）

先说明 tag 的一个特殊之处：`j-math-done`（3dd4f27）在提交线上排在 K 的绝大多数提交**之后**（J 的第二、三轮修复晚于 K 合入），所以「退掉 K 但保留 J」没有对应的 tag；退掉 K 只能退到 `i-notation-done`（J 和 K 一起退）或无 tag 的提交 35c6bbc（J 第一轮修复之后、K1 之前）。

1. **本地三绿** `npm run typecheck` / `npm test` / `npm run build` —— 1 分钟内知道代码是否完整；`npm test` 应是 808 通过 + 3 expected fail。失败：`git checkout k-website-done`（L 之前）；再不行 `j-math-done`。
2. **打开 `/vector-field`**：预设下拉应有 9 个章节组；每个章节点一个（logistic、`-2*t*y`、`-y + sin(t)`、恰当方程、Bernoulli、齐次、Riccati、`sqrt(y)`（应有唯一性失效句子和 '!' 标记）、二阶阻尼振子、非自治 `x' = y, y' = -x + sin(t)`（应只说快照、不报平衡点））；画布有图、没有红色错误框、控制台无 error。失败：预设或图坏 → `i-notation-done`；只有 J 的句子不对 → 同样 `i-notation-done`（J 在 K 里面）。
3. **分享链接往返**：改表达式、范围、语言、取消等比、密度，点「复制链接」，新标签页打开 → 全部还原（含固定轨线）。失败：`i-notation-done`（K.1 之前没有 tag；只想退掉验收修复 f7ab5ca 用 `j-math-done`）。
4. **非法链接** `/vector-field?m=first&g=x*y&tmin=5&tmax=1&d=abc` → 页面顶部一段「链接里的这些参数无效，已忽略并使用默认值：…」，图照画，不是白屏或 500。失败：同上。
5. **`/embed` 嵌进 Google Sites**：Google Sites 里「插入 → 嵌入 → 嵌入代码」，贴 `/help` 嵌入一节复制来的 iframe 片段；应显示画布和表单（`controls=0` 版只有图和方程文字）。失败：先 `curl -I https://tools.studycase.net/embed` 看有没有 `Content-Security-Policy: frame-ancestors *` 且没有 `X-Frame-Options`（Vercel 或 next.config 的头被覆盖是最可能的原因）；代码回滚 `i-notation-done`。高度不够就改 iframe 的 height，不是代码问题。
6. **手机**：单列（表单在上、画布在下）、页面能滚动、双指缩放画布、单指拖动、双击复位、长按固定轨线、轻点预览；不应出现整页被画布拖走。失败：K3 之前的提交 c9965a1（无 tag）；整个 K 退掉用 `i-notation-done`。
7. **PNG 下载**：文件是画布 2 倍尺寸、底部一行「方程 · 范围 · 站点地址」。失败：同 6。
8. **Claude：断开并重新连接连接器**（widget l-1），问「用 ping 发 hello」—— 链路。失败与代码无关（先查部署 / `BASE_URL`）；代码回滚 `k-website-done`（widget 回到 h-2，同样要重连）。
9. **Claude：「分析 2*t*y dt + (t^2+y^2) dy = 0」** —— 模型**必须先调用** `analyze_first_order` 再作答（工具调用出现在推导之前）；widget 有紫色等值线、四种形式各带偏差。失败（模型仍直接推导）：这是 description 措辞的问题，回滚没有意义（旧版本更弱）；记下模型的原话进 open-questions，下一轮加强规则。
10. **Claude：「dy/dt = sqrt(y)」** —— widget 里 y = 0 常数解带「在这一点 ∂g/∂y 无界，Lipschitz 条件不成立，解的唯一性不能保证」的完整句子和 '!' 标记；从 (0, 0) 附近点出发的轨线说「数值解只是其中一条」；y = 0 的稳定性是「方程只在这条线上方有定义，该侧的解离开它」，不是「半稳定」。失败：`i-notation-done`（J 之前）。
11. **Claude：「x'' + 0.5*x' + x = 0」** —— 调 `analyze_second_order`，第一行是降阶 `x' = y, y' = -(0.5 * y + x)`，(0, 0) 稳定螺旋 −0.25 ± 0.968i，tr = −0.5, det = 1。失败：`i-notation-done`。
12. **`npm run smoke -- https://tools.studycase.net/mcp`** —— 19/19，`widget asset URLs are absolute` PASS 且指向你的域名，widget uri `?v=l-1`。失败：`k-website-done`（回到 h-2，重连连接器）；`[base-url]` 警告看 Vercel 构建日志。
