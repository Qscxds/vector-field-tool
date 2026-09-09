# I–L 轮决策记录（2026-09-08/09 夜跑）

所有偏离《记号改为 dy/dt + 网站完整化》文档的决定和理由，以及文档没有规定、由编排者或实现智能体拍板的细节。按阶段分组；智能体报告是「实际做成了什么」的依据，编排者的设计预案（`IJKL-decisions-draft`）里与之不同的地方以报告为准并注明。

## 环境与工作树

- **会话落在 `E:\project\demo` 的 worktree 里**（桌面端默认项目），任务仓库是 `E:\project\vector-field-tool`。会话目录无法迁移（隔离 worktree），全部命令用绝对路径 `cd /e/project/vector-field-tool && ...`。demo 仓库一个字节没动。
- **并行实现用手工 worktree**：`E:\project\vft-wt\<name>`，分支 `wip/<name>`，各自 `npm ci`；做完在 worktree 里 `git rebase main`，再在 main 上 `git merge --ff-only wip/<name>`，历史保持直线（文档要求「直线推进不开分支」，这里的分支只活在合入之前）。reflog 里能看到每次 ff 合入（wip/i3、j2、j3、j4、k2、k3）。
- **智能体在 worktree 里不跑 `npm run build`**（只跑 typecheck + test），build 只在 main 合入后跑一次；每个合入点都做三绿。

## I 阶段

- **I.1 内核坐标不改名**：`Vec2 {x, y}`、`Box`、平面系统 API 原样。一阶方程里学生看到的横坐标符号是 `t`，通过 `compileScalar(..., { variables: "ty" })` 把符号 `t` 绑定到 `p.x`（横坐标），`x` 在该模式下被拒绝并给可读提示（`ParseError.code = "x_in_first_order"`）。理由：把整个内核的 `.x` 改成 `.t` 是纯返工，且平面系统里 x 本来就对。
- **I.2 `SystemSpec.variables?: "xy" | "ty"`**：`toSystem()` 产出的归约系统带 `variables: "ty"`，Scene 里的 `system` 随之携带，widget 本地 `compileSystem(scene.system)` 不用改一行就正确。
- **I.3 左端检测**：`dy/dx =`、`dy/dt =`、`y' =` 开头的输入报 `lhs_in_expression`（"只需输入右端"），其中 `dy/dx` 再追加 "用 t 不用 x"。网页外壳按 `code` 显示双语句子；工具层错误保持英文（给模型看）。检测在 slope-field 包装之前对原始 g / M / N 做（`assertNoLeftHandSide`），否则包装后的 `-(…)` 会把左端藏起来。
- **I.4 MCP 参数名不改**：`analyze_first_order` 仍用 `xMin/xMax`（schema 不变、无别名），描述里说明它们是 t 的范围。理由：不破坏工具契约；L 阶段统一处理 description 时也没有改名。
- **I.5 齐次方程的缩放参数改叫 k**：`g(kt, ky) = g(t, y)`，因为 t 已被占用。
- **I.6 widget 版本号 I/J/K 都不 bump**：三个阶段都会改 widget 页面文字，统一在 L.3 从 h-2 bump 到 l-1，用户只需重连一次。已按计划在 e7b98bf 做了。
- **I.7 等比开关先只做在网页外壳**：hook 支持 `equalScale`，widget 到 L.3 才加开关（同一份 hook，几行代码）。
- **I.8 非等比时箭头方向**：按各向异性映射画（屏幕方向 ∝ (vx·sx, −vy·sy)），即与画出来的解曲线相切；常驻警告告诉学生角度 ≠ 斜率。另一种选法（保持真实角度）会让箭头和画出的曲线不相切，更误导。
- **特征盒规则**：复位视图时平衡点 / 常数解 / 类型识别按**输入范围**算（6a2faf1），与等比与否和画布长宽比无关——否则同一个链接在手机和桌面上会给不同的平衡点列表。缩放或平移后才按可见范围算，说明文字相应改写。文档只要求「等比状态进 URL」，没有规定特征盒；这一条是为了 K.1 的链接在任何设备上还原出同样的结论。

## J 阶段

### J.1 平衡点（首轮 + 三轮修复）

- **两条机制都做了**（文档要求）：自适应种子（沿扫描线 f、g 的变号次数，12..32/轴）+ 64×64 的 |F| 局部极小自检。审查第一轮发现 x⁷ 在 [−100,100]² 仍丢原点（扫描格子对原点的吸引域太粗），于是加了第三条：**变号四叉树**——在扫描格子角点上 f、g 同时变号的格子递归细分（深度 12），有根的格子不重跑但仍细分（x⁷ 的原点和鞍点 (1,0) 在 [−100,100]² 上共享一个格子）；每个上限（1024 次运行、8192 个格子、128 个根、256 个边界格子）都在 `seeding` 里报出。加上定义域边界种子（从有限格心向未定义邻居二分），共四个种子来源。
- **接受判据改为局部的**（审查 #1 的根因）：`fTol = tol × max(1, median |F|)` 随盒子增长，x⁸ + 1 在 [−100,100]² 上 |F| = 1 的点被当平衡点。现在一个 Newton 运行只在两种情况下算收敛：步长小于位置容差 stepTol = 1e-13 × 盒子（不低于 8 eps |p|，J-fix2 加的：1e-13 × 盒子在 x ≈ 1e6 处低于坐标本身的分辨率），或残差落到**表达式自身各项**的舍入下界（`parse` 的 `roundingBound`，J-fix2）。J-fix 曾允许「步长仍在缩小的耗尽运行」按几何尾 2|d|/(1−ρ) 接受，J-fix2 发现它接受了 exp(x)+1 的最小二乘点，于是**尾部只作声称半径，永不作判定**（02e7808）。最后一轮再把奇异判据从绝对 1e-8 改成实测的 max(16 eps, 2(ρ₀+ρ₁))。
- **去重用两次运行声称半径之和**，不是 max（任务草案写的是 max）：各自声称根在 locTol 内，两个圆盘相交才可能是同一个根；用 max 会把 x⁸ 的重根列两次。
- **消失性检验**：Newton 停住的非根点测 F 在该点是否连续（沿各方向差 |F(p+de) − F(p)| 随 d 缩小是否消失）；不消失的进 `singularPoints`（方向相关奇点 xy/(x²+y²)），消失的静默丢弃。最后一轮加了限制：只有实测差值在分辨窗口内**始终高于舍入界 10 倍**才叫「不连续」，否则是未解决的根候选（之前 logistic 猎物模型在 (1,0) 附近报 44–47 句「场不连续」）。
- **秩亏的步**：秩 1 雅可比用截断伪逆 d = −v₁(u₁·F)/σ₁（矩阵先按最大元缩放，避免 J^T J 溢出）；最后一轮又加了「残差下降或带下界的残差下降」的步接受，使 x' = xy, y' = x² − y 这类秩亏根能被接受（代价见 open-questions 的性能一条）。
- **逐元雅可比误差**（审查 #7）：`jacobianWithError.errors` 每个元素各自的差分 + 舍入误差，`classify` 的 det / trace / 判别式判零全部按误差传播（err(det) = e_a|d| + e_d|a| + …）。x' = 1e10 x, y' = 1e-10 y 从首轮的 non_hyperbolic 改判 unstable_node（e_d ≈ 4.4e-25 ≪ 1e-10）。判别式改算 (a−d)² + 4bc。**误差判定模式下重根永远带 `repeatedRoot` caveat**（差分雅可比的判别式精确为 0 是运气）；裸矩阵模式保持「精确 0 不带 caveat」以保住旧测试。最后一轮把 caveat 的措辞改成在两种模式下都为真。
- **雅可比差分步**：相对盒子和 |p| 的 1e-6 起步，截断误差 > 1e-7 |J| 时四分（最多 20 次，不低于 4 eps|p|），去掉绝对的 1e-6（在宽 4e-7 的盒子上把 3I 的星形结点判错）。
- **连通分量**：先按 4 近邻 + 欧氏 MST 的边分连通分量（只用 4 近邻时，均匀采样成簇的圆会裂成 4 段），连通边要求弦中点抛光后是**新的**零点（否则 sin(πx)² 的等距重根被第二近邻串成连续解集，回到 H 轮 C5 的反例），再在每个分量内部判几何。SI 模型 {xy = 0} 是一个连通的十字，所以期望是 1 个分量、两条轴都有点，不是任务草案写的「2 个分量」。
- **`region_of_equilibria`**：≥ 25% 的有限扫描样本精确为 0 的场（0/0、max(x−1,0)），跳过连续解集分析，直接报「二维区域上为零」；之前被说成「多个孤立退化平衡点」。
- **下溢平台**：某个分量在整个探测方向上精确为 0（exp(x) 在 x < −745）报 `underflowPlateau`，不报连续解集；只在最粗探测偏移处各方向都精确为 0 时才确认（x·y 紧挨真根不算平台）。
- **坐标贴零**：|c| ≤ 该点分辨率的坐标在算雅可比前贴到 0（7.36e-322 那种不再打给学生）。

### J.2 唯一性

- **首轮判据**按预案（8 级、1e-2·尺度起每级 /4、α ≥ 0.25 且单调 → unbounded、0.1 → borderline），两处为诚实偏离字面：α ≥ 0.25 但差商不单调 → borderline 而不是 bounded；只有 4 个可用级且 α ≥ 0.1 → untestable。没有「唯一性成立」的句子：bounded_at_tested_scales 是测量，不是 Lipschitz 条件的证明。
- **J-fix 改为最细尺度下降**（审查 #12/#13/#25/#35：光滑右端在大盒子上被判非 Lipschitz，因为 8 级固定阶梯从盒子的 1e-2 起步，在 tanh 的过渡区里读到的是斜率变化不是发散）：一直下降（最多 60 级）直到 |log(D_k/D_{k−2})|/log 16 < 0.05（level-off → bounded，带局部指数）或差商到达舍入下界（尾部 4 级拟合，≥ 0.25 unbounded、≥ 0.1 borderline）。后果如实记录：y·log|y|（导数只是对数发散）在 k = 13 处 level off，读作 bounded（α ≈ 0.047），而首轮读 borderline；唯一性在那里确实成立（Osgood），期望是重新推导的不是放宽的。被主导线性项掩盖的奇异项（y + 1e-4·sqrt|y|）在粗尺度就停住，读 bounded——写在文件头的诚实限制里。
- **舍入下界用 g 的局部量级** eps·(|g(c+d)| + |g(c)|)/0.1（第二次求值，便宜），不用相邻级的统计（那让 1 − exp(−100y) 的判定随盒子变）。表达式内部的消去（(1e10 + y) − 1e10）仍看不见，记在文件头。
- **常数解处的探测减去残差** g(t, c)（根只定位到 fTol，否则最小偏移处读到假的 1/δ 增长）；平衡点处同理减去 F(p)。J-fix2 再改：平衡点探测从该点声称分辨率的 10 倍起步，不减 F(p)（|x|^(1/3) 的 α 才落在 2/3 ± 0.05）。
- **定义域边界的常数解二分到相邻双精度数**（最多 1200 次），不是预案的「~50 次到 1e-15 跨度」：sqrt(y) 在 0 不是采样点的盒子上，50 次二分后最后一个有限 y ≈ 1e-18，|M| ≈ 1e-9 > fTol 会被拒绝；只有精确的双精度 0 能过残差检验。
- **边界稳定性**：定义侧探针斜率为 0 或未定义时不下结论，兜底是 `varies`（唯一不声称趋向或离开的值），绝不是 semi_stable。
- **非唯一轨线按线段判**（点到线段距离 / 跨 y = c 的变号），不只按顶点：自适应步可能跨过原点而没有顶点落在容差内。容差 1e-9 × 盒子长边。J-fix 加了曲线自身范围的探测（`NonUniqueProbe`），标记不再依赖输入盒子。
- **画布标记**：非唯一常数解 = 两侧 4 px 点线 + 左端 '!' 徽标 + 标签 ' !'；非唯一平衡点 = 标记旁 '!'；边界线 = 点划线 [10,4,2,4]；被标记的轨线和预览 = 虚线 [6,4]。全部从 Scene 读。
- **`trace_trajectory` 也跑 findEquilibria + 唯一性探测**来标记曲线（在 2 秒预算内），平衡点只用于标记、不进 Scene（widget 图不变）。

### J.3 非自治

- **首轮是数值判定**（在若干无理 t 值上比较 F，相对场量级 1e-9），审查发现判定随盒子和采样点翻转（1e-6·sin(t) 在 ±1e4 上、exp(−2000x²)·sin(t)），sqrt(t − 5) 在 5 个固定探测时刻全未定义时被放过。**改为静态规则**（编排者决定，d0b7550）：f 或 g 的 AST 里出现符号 t 就是非自治，句号；`"ty"` 系统永远不是；数值探测（maxRelDeviation、samples）只作证据打印，`TIME_DEPENDENCE_TOL` 删除，没有任何阈值决定任何事。后果：`0*t + y`、`x + t − t` 也是非自治，说明句写「没有测到变化，但仍按非自治处理」。**最后一轮把一阶方程的自治性也改成同一条静态规则**（`firstOrderMentionsT`，6d7bdb6）：t·sqrt(y) 在 y ∈ [−4, 0] 上（只有边界线一个有限样本，M 在其上为 0）曾报 untestable，现在按规则报非自治。
- **快照时刻加入探测时刻**，所以 sqrt(t − 5) 在 t = 10 报「定义域随 t 移动」（deviation = Infinity，打印为 —）。
- 外壳在**输入范围上测一次**并传给 `computeFeatures`，缩放平移不会翻转判定；快照时刻进 systemKey，换 t 就清轨线。
- 措辞：「平衡点只对自治系统有定义」是错的（非自治系统可以有常数解），改为「本工具不对非自治系统做该分析」。
- `reached_equilibrium` 的速度判据对非自治系统是自治推理（x' = 0, y' = cos t 在 t = π/2 处「趋近平衡点」）——在 J.3 范围外（文档说 trace_trajectory 不动），记在 open-questions。

### J.4 二阶降阶

- **在字符串层做**（预案）：x''、x' 换占位符，两边相减得 E，仿射性检验，F = −E(x''=0)/(E(x''=1)−E(x''=0))。审查两轮把它改硬：仿射性在 x'' = −3.7…10 的 8 个值上探测（首轮只在 0、1、2，abs(x'') 也能过）；采样点加盒子里的 13 个点（分段系数）；系数**结构化提取**（形式求导穿过 + − × ÷ 括号 piecewise），数值回退只作交叉检验；系数含 t 时在 5 个 t 值上采样，t·x'' 因在 t = 0 处消失而拒绝。
- **化简保守**：mathjs `simplifyCore` + 两条精确改写（−0 → 0、−(−u + v) → u − v），不做因子消去、不做常数折叠；显示串四舍五入到 12 位有效数字，编译串保留全精度。理由：首轮的 `simplify` 把 −9.81/0.1 打成 −98.10000000000001，还把 x'/x' 化成 1 从而在 y = 0 上制造平衡点（后者仍留一条 it.fails，见 open-questions）。
- 验证符号集**替换**模式变量（[x, t, xd, xdd]），y 在二阶模式是未知符号并给「未知量是 x，x' 是它的导数」的提示；10 个 `second_order_*` 错误码，网页外壳双语，工具层英文。
- x'' 系数为 0 的检验是精确的 a === 0：从已验证仿射的 E 得到零系数只可能是精确 0，容差需要一个不存在的参考量级。
- `analyze_second_order` 返回 kind `analyze_system` + `scene.secondOrder`，不加新 kind；分析体 `analyzePlanar` 与 `analyze_system` 共用，所以快照 / 唯一性 / 截断都自动到位。
- 记法：x''(t) + x(t) = 0 剥掉 `(t)`（lookbehind 保护 exp(t)）；弯引号、unicode 撇号、双撇号、backtick 都归一化；unicode −、×、·、÷ 在所有模式归一化（只这四个，不动 dash 和全角 =）。

### J.5 三条小的与文案

- 连通分量、`truncated` 独立字段、病态缩放测试都按文档做了；`hit_limit` 与截断句意思相同，`equilibriaNotices` 两者都设时只打截断句（带数量）。
- **`formatNumber` 保留有效数字**：|v| < 1e-3 或 ≥ 1e6 或定点形式没有非零数字时用指数形式，只有精确 0 打成 0；旧测试 formatNumber(−0.00001) 的期望从 "0" 改成 "-1e-5"（旧串是被压扁的值）。`formatEigenvalue` 的「实数」判据改为相对的 |im| ≤ 1e-15 |re|。
- 按定义排除的 Bernoulli（n = 0 / 1）单独一行「按定义排除的形式（括号内为规则）」，不进「未通过」。
- **常数解的扫描分辨率一行总是显示**（2 位有效数字），作为「一格里可能有两个根」的诚实声明；没有加「欠采样」标志。

### J 阶段明确跳过的（编排者按「极端盒子」分诊，理由）

- x⁷ 在半宽 ≥ 1.5e5 的方盒上丢原点（允许上限 5e5）：原点的吸引域相对盒子是 1e-10 量级，四叉树深度 12 的格子是盒子的 2.4e-4；再深就是全盒子的指数级细分。课堂上不会用 ±1.5e5 的盒子看 x⁷。
- K ≥ 1e9 的病态线性系统（1e8 已修）：行缩放后剩余的舍入误差已经和 1e-9 的特征值同量级，双精度下本来就分不清。
- 大盒子上紧贴极点的根（x' = 1/(x−1) + 2 在 [−2,2]² 找到鞍点、更大盒子找不到）：扫描间距 6.25 分不开相距 0.01 的根和极点，同一类问题。
- 部分枚举的格点被判连续解集（#36）：连通判据会给「从未定位的根」记功；只在开发中根丢了 2 个时短暂出现，全找到时判 multiple_non_hyperbolic。
- 相距 2e-10 的两个单根合并（#39）：低于 LOCATION_RELATIVE_TOL 的分辨率。
- sin(1/y) 无穷多根的子集随盒子变：无穷多根本来就列不全，「扫描分辨率」一行是诚实的陈述。
- x'' = −x + x'/x' 在 (1, 0) 列出平衡点：需要 findEquilibria 拒绝「收敛点本身场为 NaN」的候选，是新机制，留 it.fails。

## K 阶段

### K.1 URL 状态

- **参数名**：`m`（first / diff / system / second）、`g` / `f` / `M` / `N` / `eq`、`tmin/tmax`（first、diff）或 `xmin/xmax`（system、second）、`ymin/ymax`、`loc`、`eqs`、`d`、`arrows`、`t0`、`traj`。文档的例子里一阶用 `tmin/tmax`，这里照做；系统和二阶用 `xmin/xmax`，因为横轴就是 x。
- **省略规则**：与默认状态相同的参数一律不写（`encodeState` 不带 `?`）；`eqs` 只在关闭等比时写 `0`；`arrows` 只在非默认时写；`d` 范围 5..40；轨线起点 6 位有效数字，范围数字用 `String(n)`；**编码的是输入范围（home box），不是缩放后的视口**——链接表达的是「老师配好的例子」，不是「我此刻看到的那一小块」。简谐振子预设恰好等于默认状态，它的链接只剩 `?traj=1,0;2,0`。
- **`AppState.locale: Locale | null`**：null = 没有选过语言，链接里不带 `loc`，收链接的人跟自己的浏览器语言；只有显式选择或链接里已有 `loc` 才编码。理由：自动探测到的语言不该强加给收链接的人。
- **解码永不抛错**：每个参数独立校验，非法项记入 `problems`（带原因码），回退到默认；表达式走同一套解析器白名单（`validateExpression`），上限 200 字符，查询串 4096 字符，数值 ≤ 1e6，范围下限必须小于上限且宽度 ≥ 1e-9，轨线 ≤ 20 条。常量表达式 `1e999` 会被 mathjs 解析成 Infinity 常量（数值参数则拒绝）——记录，未处理。
- **模式相关的回退表达式**（验收时发现，f7ab5ca）：链接把模式切到一阶但 g 无效时，原来回退到默认状态的 `-x`（系统模式的表达式），在一阶模式下 x 被拒绝 → 页面既有「参数无效」提示又有解析错误、没有图。`MODE_DEFAULT_EXPRESSIONS`：first `y*(1 - y)`、diff `t` / `y`、second `x'' + 0.5*x' + x = 0`。
- **地址栏只在状态能编译时同步**，表达式打到一半时停在上一个合法状态；「打开完整页面」用最后能编译的状态，不是 iframe 的初始查询。防抖 500 ms（文档）。
- 表单内部保留 explicit / differential 词汇（`PresetMode`），边界上 `APP_TO_FORM_MODE` / `FORM_TO_APP_MODE` 转换，减少与并行的 page.tsx 改动冲突。
- **`/vector-field`、`/embed`、`/`、`/help` 都是动态路由**（build 表里的 ƒ）：`searchParams` 在服务端解码，首屏就是链接里的状态和语言，没有先渲染默认再跳的闪动。

### K.2 嵌入

- **`frame-ancestors *`，不是 Google 的域名列表**：这是公开教学工具，无登录、无状态，点击劫持没有意义；列域名反而会在 Google Sites 换渲染域时静默失效。只在 `/embed` 上加；`/widget`（MCP Apps 用，CSP 完全不同）和 `/vector-field` 不加任何 frame 相关头，curl 三次验证（K1、最后一轮修复、L）。
- **画布按容器尺寸**（ResizeObserver，300..900 px，高 = 宽 × 0.72），完整页面也这样，不只 embed：固定 720 px 的画布在手机上会溢出。
- `/embed` 带 `robots: noindex`，`robots.txt` Disallow `/embed` 和 `/mcp`。
- **嵌入高度按实测**：审查建议 760 / 640，但 logistic 例子的实际文档高度是 960 px 宽时 1267 px、800 px 以下单列时 1809 px、无表单 1243 px；按「实测值向上取整到 20 px」定为 1280 / 1260，文案里写明单列约 1820 px。测量是在隐藏的浏览器面板里做的，见 open-questions。

### K.3 / K.4 首页与帮助页

- 长文放 `lib/site-text.ts`（zh / en 键集合一致性测试），页面是客户端组件；`?loc=` 在服务端读，没有时水合后跟 `navigator.language`（与 VectorFieldApp 同一套）。
- 首页 `<title>` 是绝对的双语站名（不套模板），其他页用模板。「阻尼振子」卡片链到 `damped2`（二阶写法 `x'' + 0.5x' + x = 0`），与文档点名的方程一致；`damped` 系统写法的预设保留。
- 站点外壳 `SitePage` 把 `lang` 设在 `<main>` 上，因为 `app/layout.tsx` 不许动；最后一轮修复又加了 `useDocumentLang` hook 在三个页面组件里改 `<html lang>`（审查 #10：中文应用页对屏幕阅读器仍是 en）。
- 帮助页的函数列表直接从 `ALLOWED_FUNCTIONS` 生成，不手抄。「连接 Claude」放最后（文档）。

### K.5 预设

- 结构：`PRESET_GROUPS`（9 组）+ `PRESETS`（20 个 `{ id, group, mode, name, note, expressions, box, starts? }`），`presetState(p)` / `presetUrl(p)`，`<select>` 用 optgroup；每个预设就是 K.1 的一条链接。

### K.6 触屏

- **触屏路径只对 `pointerType === "touch"`**，鼠标 / 笔的代码逐字节不变（审查复核过 diff）；触摸的 tap/move 阈值 8 px，鼠标保持 3 px。
- 手势状态机 `lib/gestures.ts` 是纯函数（可测）：tap（预览且保留）、双击 300 ms 复位、长按固定、单指平移、双指缩放；**pinch 同时发出中点的平移**（两指拖动），最后一轮修复把 pan + pinch 合成一次函数式 `setView` 更新（否则两个 handler 读到同一个过期 viewportRef，平移被丢掉）；第三指抬起不结束 pinch；pan / pinch / 长按 / 取消都清掉双击记忆。
- `touch-action: none` 只在画布上，页面其余部分照常滚动（文档）；右键菜单只对触摸指针阻止（首版对鼠标也阻止了，审查 #16 指出丢了「另存图片」，改回）。
- 触屏提示文字通过 `matchMedia("(pointer: coarse)")` 切换，网页外壳和 widget 都用；控件 ≥ 44 px 也只在 `(pointer: coarse)` 下。
- iOS Safari 的双击与浏览器自身手势的竞争没有在真机验证（见 open-questions）。

### K.7 PNG

- 画布绘制抽到 `components/drawScene.ts`（不进 `lib/render`，保持其纯几何；widget 与网页外壳共用，所以 J 的标记在两边一致）；`exportScenePng` 2× 离屏画布 + 22 px 页脚。
- **导出当前视口**（缩放后就是缩放后的图），页脚范围也是当前范围——这是诚实的选择；要不要同时打印输入范围是产品问题（open-questions）。
- 页脚范围用真正的 3 位有效数字（`toPrecision(3)`），不用 `formatNumber` 的固定小数；页脚从 Scene 拼：一阶 `firstOrder.expr` → 二阶 `secondOrder.equation` → 系统 `x' = f, y' = g`；站点地址为空时省略而不是留悬空分隔符。
- 画布绘制和 PNG 导出没有单元测试（vitest 在 node 里跑，没有 canvas），只测页脚文字、文件名和手势状态机。

### K.8 元信息

- **OG 图走 `app/opengraph-image.tsx`**（next/og `ImageResponse`，1200×630），build 通过且预渲染为静态，所以预案里的静态 SVG/PNG 回退没有做。中文字形靠 next/og 在构建时联网取字体——本机成功，Vercel 构建环境若无网络可能变方块（open-questions）。
- `robots.txt` / `sitemap.xml` 在没有 `BASE_URL` 时写 `http://localhost:3000`；部署环境本来就要求 `BASE_URL`，那里是对的。
- vitest 门禁排除 `lib/**/__probe__`（bac644a）：审查智能体在冻结工作树里写的探针文件不应让 `npm test` 变红。

## L 阶段

- **L.1 措辞**：每个分析工具的 description **以 "CALL THIS TOOL FIRST …" 开头**并按工具定制（一阶：「a standard exact or separable equation is exactly the case you are tempted to skip」；二阶：「a linear oscillator with a characteristic equation is exactly the case you are tempted to skip」），然后共用尾句「Even when you can … in closed form, call the tool, check your derivation against its numerical results, and show the student the picture. Never answer from symbolic derivation alone.」，再接 "WHAT IT COMPUTES:"（原文逐字保留）和原有规则。规则放在**最前面**而不是附在末尾：模型扫工具列表时先读到的是开头。`ping` 不加。测试锁定前缀、顺序（规则 → WHAT → USE THIS）和逐工具措辞。顺带补两句：二阶方程必须对 x'' 仿射（系数可含 x、x'、t）；负底数分数幂的提示在每个工具的语法规则里都说一遍。
- **L.2 只加测试**：读 `tools.ts` 后用协议级测试逐项验证 J 的结果在摘要里（两种语言），全部一次通过，没有改工具或文案。
- **L.3 widget l-1**：**widget 也加了等比开关**（偏离 I.7 的「widget 保持等比」——共用 hook 只需几行，学生在 Claude 里看 (t, y) 平面同样需要它）；每个平衡点加 "tr = …, det = …"；`analyze_second_order` 的结果 kind 仍是 `analyze_system` + `scene.secondOrder`，不加新 kind；CSP 块、assetPrefix、根布局补丁不动。版本号只在这里 bump 一次（h-2 → l-1）。
- **L.4 模拟主机按 URL serve 沙箱，不用 srcdoc**：srcdoc 的 iframe 加载了 chunk 却不水合（Next 运行时把 chunk 相对 `about:srcdoc` 解析），真实主机也是把 HTML 放在沙箱域名上按 URL 加载的，所以模拟主机照做（两个源 :3520 / :3521，CSP 头由 `_meta.ui.csp` 生成、无 eval）。诊断钩子（mock/read-text、mock/canvas、widget 内探针）只存在于模拟主机。`package.json` 加了 `mock-host` 脚本。E 阶段的 harness_e.py 从没进过仓库，这次的进了。

## 流程决策

- **worktree 并行**：I 的等比开关（wip/i3）、J 的四个模块（j1–j4）、J-fix 的 A/B/C、J-fix2 的 JA/JB/JC、K 的 K2/K3、最后一轮的 FA/FB/FC 都在 `E:\project\vft-wt\<name>` 里做，rebase 后 ff 合入；每轮一个「integrate」提交解决语义冲突（`labels.ts` 的键联合、`analyzePlanar` 承载各组的分支、重复句子删除）。K1 在 90989ed 上与 J-fix 并行，所以 K 提交先于 J 的后两轮修复进入 main，`j-math-done` 因而排在 K 提交之后。
- **验证方式的改变**：第一轮按 H 轮的做法每条发现派 3 个反驳者，39 条只验了 13 条就撞上账号用量上限，26 条没有投票；第二轮 41 条干脆没有反驳者。从第三轮起改为**审查者给每条发现打课堂可能性标签（classroom / edge / extreme）+ 编排者分诊**：classroom 和 edge 修，extreme 明确跳过并写理由。理由：3 个反驳者的成本高于修复本身，而分诊需要的只是「课堂会不会遇到」这一个判断；代价是第二、三轮的发现没有独立复核，修复以「复现了就修」为准（summary 里如实标注）。
- **智能体输出纪律**：一个智能体的报告超过 64k 输出上限而丢失之后，所有智能体的报告改为固定小节（commits / fixed / refuted / notDone / decisions / openQuestions / failingMarked / apiChanges）、长材料写进 scratchpad 文件、单次工具输出不超过约 200 行；本文档也是按这个纪律分块写的。
- **被 amend 的提交**（reflog）：main 上两处——5b48c50（I 阶段的 docs 提交，打 `i-notation-done` 之前）和 83a8c8f → f7ab5ca（验收修复，amend 后才打 `k-website-done`）；worktree 里一处——FC 的 424e449 → e9b9e53（9 个文件的 CRLF 归一回 LF，内容逐字节相同，否则并行合并全冲突）。三处都在推送之前，tag 都打在 amend 之后的提交上。
- **行尾**：仓库按文件混用 LF / CRLF，每个智能体把改过的文件恢复到 index 里的约定再提交（CLAUDE.md 是混合行尾文件，K3 rebase 时整文件冲突，按 main 的版本逐段插入）。
- **提交粒度**：一个模块一个提交，`npm test` 每个提交绿；`git add` 用显式路径；JB 的一组改动只有一个提交（内核改动同时改了 tools.test 和 labels.test 的期望，拆开会有红的中间提交）；`[J-fix] uniqueness` 和 `interactive` 拆成两个提交而不是任务写的一个。