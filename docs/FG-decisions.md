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
