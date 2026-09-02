# F/G 轮决策记录（2026-09-03）

所有偏离《推 GitHub + F/G 两阶段》文档的决定和理由。按时间顺序追加。

## 前置：推 GitHub

- 仓库 <https://github.com/Qscxds/vector-field-tool>，public。推之前自检：工作区干净；`git grep` 扫描 token / 密钥 / 隧道地址，只找到文档里的占位符 `xxxx.trycloudflare.com` 和测试里的 `example.trycloudflare.com`，没有真实地址；`.gitignore` 覆盖 `node_modules`、`.next`、`lib/**/__probe__/`、`__probe*`。推完核对：远端 44 个提交、7 个 tag，与本地一致。
- 用户留言时我已经推完（gh 在会话开始前就是已认证状态），没有中断 S 阶段。

## S 阶段：沙箱里能不能本地算

实测环境：E 阶段的本地模拟主机（不同源沙箱 iframe，`sandbox="allow-scripts allow-same-origin"`，CSP 按 MCP Apps 规范默认值构造：`script-src 'self' 'unsafe-inline' <resourceDomains>`，**没有 `unsafe-eval`**）。探针临时加在 widget 页面里，读完结果后已删除，没有进入任何提交。

| 探测 | 结果 |
|---|---|
| `new Function('return 1+1')()` | **被挡**：`EvalError: Evaluating a string as JavaScript violates the following Content Security Policy directive because 'unsafe-eval' is not an allowed source of script` |
| mathjs `compileScalar('x^2+y^2')({x:1,y:2})` | **成功，返回 5**。mathjs 15 的 `compile()` 把 AST 编成闭包，不生成代码字符串；仓库里 `grep "new Function("` 在 mathjs 运行时代码中零命中（之前看到的 `new FunctionNode` 是构造函数调用，不是 eval） |
| 编译一次 | < 1 毫秒 |
| RK4 2000 步（简谐振子，h = 0.01，共 1.6 万次表达式求值） | **13.2 毫秒**，status completed |
| 唯一的 CSP 违规报告 | zod 启动时的 `new Function` 探测（已知、无害，zod 自己捕获） |

**结论与路线**：`unsafe-eval` 确实不可用，但我们唯一依赖的东西（mathjs 编译求值）不需要它。**走「eval 可用」那条路**：F 和 G 照文档正常做，widget 直接用 `lib/core`，不实现解释器，`compileSystem` 不加 `mode` 参数。文档里为「eval 被挡」准备的解释器方案不需要了；若将来 mathjs 改用代码生成，`lib/core/parse.ts` 头部注释已写明这个依赖。

**hover 预算**：2000 步 13 毫秒 ≈ 每步 6.6 微秒（含两次表达式求值和 RK4 四级）。一帧 16 毫秒里留一半给绘制，hover 曲线正逆各 ≤ 400 步（约 5 毫秒），用 `requestAnimationFrame` 节流；缩放平移后重采样 20×20 场（400 次求值，约 0.5 毫秒）可以每帧做。

**注意**：这是在模拟主机的规范默认 CSP 下测的，不是 Claude 实机；Claude 只可能更严（去掉 `unsafe-inline` 等），而 mathjs 编译路径不依赖任何 CSP 放行，所以结论对 Claude 同样成立。E 阶段在 Claude 实机里已经证明 widget 的 JS 能跑（包括 mathjs 所在的同一份 bundle 中的 ext-apps 代码），只是当时没有调用 compile。

## F 阶段：一阶方程重构

- **`FirstOrderSpec` 两种变体都带可选 `params`**（文档的类型里没有），与 `SystemSpec` 一致；`toSystem` 输出 `x' = N, y' = -(M)`，显式形式给出与旧行为完全一致的 `x' = 1, y' = g`。旧的 `firstOrderToSystem(expr, params)` 保留为薄封装，网页外壳还在用它，G 阶段再改。
- **常数解判据按文档改为逐条直线检验**：候选来自参考列 x_ref 上 M(x_ref, c) 的零点，再在盒子 x 范围内 7 个无理分数位置逐个核对 M(x, c) = 0 且 N(x, c) ≠ 0。于是非自治方程（如 dy/dx = x(y−1)）的常数解也能找到；稳定性在各探测 x 上不一致时报新增的 `varies`。`autonomous` 标志保留为信息字段，不再是前置条件。
- **方向场奇点直接复用 `findEquilibria`**：M = N = 0 恰好是系统 x' = N, y' = −M 的平衡点；把它给出的分类丢掉（对方向场没有意义），只留位置和截断警告。显式形式 N = 1 永远没有奇点。
- **类型识别的容差**：直接求值的恒等式（可分离、自治、齐次）用相对偏差 1e-8；含有限差分的（对 y 线性、恰当、积分因子）用 1e-6。采样点在盒子的无理分数位置（0.2137、0.3819、0.5773、0.7071、0.866、0.4472、0.6281 等）。少于 5 个有效点的形式不报（既不肯定也不否定）。
- **Bernoulli 的判法**：对固定 x，把 g/y 拟合成 a + b·y^(n−1)：用三点比值方程在 m = n−1 ∈ [−6, 6] 上扫描符号变化再二分，排除平凡根 m = 0，用另外两点核对，并要求三个不同 x 处的 n 一致（差 ≤ 1e-6），且 b 不为零（否则是线性）。指数 n 写进证据和 `details.n`。
- **恰当优先于积分因子**：恰当时 μ = 1 平凡，不再重复报两种积分因子。
- **证据与 caveat 的双语文案放在 `lib/core/detect-form.ts` 里**（按 `locale` 参数），与 classify 的 caveat 同一做法：core 可以包含面向学生的字符串。`detectForms` 的 `locale` 默认 `en`（与 G1 的工具默认值一致），F5 的工具层暂时传 `zh`，G1 加 `locale` 参数后改为透传。
- **F4 做完了，包括等值线**：势函数用复合 Simpson（每段默认 64 格，多项式被积函数精确）沿两条路径积分，路径差作为恰当性的独立自检；等值线用 marching squares（`lib/render/contours.ts`，60×60 网格，鞍点格用中心值消歧）。只在 `detectForms` 报恰当且路径自检通过时才把等值线放进 Scene。
- **`Scene.fieldStyle`** 加在 Scene 顶层而不是 firstOrder 里，因为渲染层对任何 Scene 都要知道画箭头还是线段。`FirstOrderView.expr` 从「g 的表达式」变成人可读的方程文本（显式：`dy/dx = g`；微分：`(M) dx + (N) dy = 0`），widget 的摘要直接显示它。
- **工具的两种输入互斥**：`expr` 或 `M`+`N` 恰好给一个，否则返回可读的 isError；解析失败时点名是 g、M 还是 N。

## G 阶段：双语、等比视口、缩放平移、hover、widget 本地计算

- **文案表结构**：`lib/labels.ts` 变成 `LABELS.zh` / `LABELS.en` 两张同构表（`classification`、`stability`、`status`、`warning`、`caveat`、`form`、`tool`、`ui`），`labels(locale)` 查表，`fill()` 填 `{name}` 占位符。`lib/labels.test.ts` 用递归键路径比较两张表的键集合、检查每个叶子非空、检查占位符两边一致。`classify` 的 `caveat` 从中文句子改为 key（`center` / `nonHyperbolic` / `notFinite`），展示层查表；`detect-form` 的证据与 caveat 仍按 F 阶段决定留在 core 里按 `locale` 生成（它们含具体数字，不适合模板表）。
- **`locale` 参数**：四个工具都加 `locale: z.enum(["zh","en"]).default("en")`，description 里写「学生用中文提问就传 zh，否则 en」；Scene 带 `locale`，widget 据此选表。错误信息（参数校验、解析失败）仍是英文——那是给模型看的，不是给学生看的。
- **网页外壳语言**：初始 `en`，挂载后按 `navigator.language` 切换（组件状态，不用 localStorage，按文档），右上角下拉可改。预设名称与说明双语。
- **等比视口**：`fitViewport` 以盒子中心为中心、取两轴中较小的像素比例、把短的一边对称扩大。输入 x∈[−3,3]、y∈[−3,3] 在 720×520 画布上实际显示 x∈[−4.15,4.15]，图下用一行小字给出「实际显示范围」。
- **缩放不变量**：`zoomAt(v, p, k)` 保持屏幕点 p 下的世界坐标不动（测试直接断言 `screenToWorld` 前后相同，误差 1e-9）；缩放倍数相对原始盒子限制在 1/50..50（`ZoomLimits`），`panBy` 让内容跟着鼠标走，`resetViewport` 回到 `fitViewport`。滚轮系数 `exp(−deltaY·0.0015)`，每次夹在 0.5..2。
- **视图变化时算什么**：场每次视图变化都重采样（密度²次求值，亚毫秒）；平衡点 / 一阶特征（常数解、奇点、类型、等值线）对**可见范围**重算，但在停止操作 250 毫秒后才做（`FEATURE_DEBOUNCE_MS`），因为恰当方程的等值线要几百毫秒。于是平移出去能发现新的平衡点，列表跟随视野。
- **hover**：`onHoverWorld` 只记录最新位置并用 `requestAnimationFrame` 节流；一帧里若指针移动不到 3 像素就不算；正逆各最多 400 步（S 阶段实测 2000 步 13 毫秒）；指针在方向场奇点 8 像素内不画曲线，改在光标旁写「此处靠近方向场奇点，方向无定义」。预览画在单独的 overlay canvas 上，底层（场、等值线、固定轨线、标记）只在 Scene 或视口变化时重画。
- **固定轨线**：点击时用可见范围每边各扩一倍（三倍大小）的盒子做停止条件，tSpan 50，正逆各一条；这样之后缩小视野轨线仍在。**单击延迟 220 毫秒**报告，双击时取消——浏览器实测双击会先触发两次 pointerup，不延迟就会在复位前多画两条轨线。
- **共用 hook**：交互状态机 `components/useInteractiveScene.ts` 由网页外壳和 widget 共用（架构规则 3）；纯计算部分（`computeFeatures`、`expandBox`、`traceBoth`）放在 `lib/interactive.ts` 并有测试。网页外壳只剩表单。
- **widget 本地计算**：Scene 已带 `system` 与 `firstOrder.spec`，widget 用同一份 `compileSystem` 编译；编译抛异常（沙箱不允许）时退回服务器给的静态图并显示 `ui.localComputeUnavailable`。`WIDGET_VERSION` e-2 → g-1，widget `appInfo.version` 0.3.0。在本地模拟主机（规范 CSP，不同源 iframe）验证：握手正常、画布有内容、滚轮缩放、拖动平移、悬停预览都工作，size-changed 正常上报；唯一的 CSP 违规仍是 zod 启动时那次已知的 `new Function` 探测。
- **两处测试期望修正（不是容差）**：`labels.test` 原来断言每条 caveat > 60 字符，中文的 `notFinite` 只有 43 字却是完整句子，改为「> 30 字且以句号结尾」；`interactive.test` 原来断言离盒轨线终点 ≤ 6.1，但积分器（A 阶段起）记录第一个盒外点，f = 1 的自适应步长到边界时已长到约 1.8，改为「末点在盒外、倒数第二点在盒内」。
- **提交拆分**：文案表迁移迫使 tools、网页外壳、widget、画布在同一提交里改（旧导出没了就编不过），所以 G1 与 G2–G4 的界面部分合在 `45df4de` 一个提交；纯函数（viewport）和 hook/widget 各自独立提交。tag `g-render-done` 打在 hook 提交上，`g-widget-done` 打在 widget 提交上。

## G-fix：穿过奇点的常数解

在 widget 里平移 2xy dx + (x²+y²) dy = 0 时发现：原始范围 [−2,2]² 报「没有常数解」，平移后的范围却报「y = 0，稳定性随 x 变化」。推导：沿 y = 0 有 M = 0、N = x² ≠ 0（x ≠ 0），dy = 0 在奇点 (0,0) 两侧都成立，y = 0 确实是常数解；x > 0 一侧吸引（斜率 ≈ −2y/x）、x < 0 一侧排斥，所以 `varies` 是对的。原代码要求每个探测 x 处 N ≠ 0，对称范围的中点探测 x = 0 正好落在奇点上，于是整条线被否定——答案随范围是否对称翻转，这不能接受。修正：探测点上 M = N = 0 视为「线穿过奇点」而跳过（既不算反例也不算证据），要求至少 3 个有效探测点，稳定性也只在有效探测点上比较；`y dx + y dy = 0` 这种整条线都奇异的情况仍然不报。新增 3 个测试，期望值来自上面的推导。提交 `[G-fix] slope-field: ...`，在 `g-widget-done` 之后。
