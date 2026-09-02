# 夜跑决策记录（2026-09-02 夜）

所有偏离《多阶段无人值守夜跑》文档的决定和理由。按时间顺序追加。

## 开工

- **停掉了本会话后台跑着的 `next start`（端口 3000）。** 夜里要反复 `npm run build`，构建会覆盖 `.next`，正在运行的生产服务器会读到半成品文件。隧道（cloudflared）没有动，早上重启服务器即可恢复连接器（README 有命令）。
- `git tag p0-verified` 打在 `d23b07c`（P0 交接文档那个 commit，也是 Claude 实机验证通过时的代码）。

## A 阶段：计算内核

- **`eval(p, t = 0)` 多了一个可选的时间参数。** 文档白名单允许符号 `t`，但签名 `eval(p: Vec2)` 没地方传时间；与其让 `t` 永远等于 0 误导使用者，不如让积分器把当前时间传进去，非自治系统也能正确积分。所有下游模块都默认 `t = 0`。
- **解析白名单比文档略宽也略窄。** 放行 `ConditionalNode` 和比较运算符（`x > 0 ? 1 : -1` 这类分段右端在课上有用）；拒绝字符串字面量、`mod`、逻辑运算 `and/or/not`、阶乘等一切可能在求值期抛异常的构造。求值再包一层 try/catch，保证「eval 永不抛」。
- **参数名校验**：必须是合法标识符，不能与 `x y t pi e` 或白名单函数同名，值必须是有限数。
- **`left_box` 会保留越界的那个点**，这样画出来的轨线能碰到边框；文档只说「离开时停」，没说要不要保留。
- **自适应积分器步长塌缩到 `1e-12 * tSpan` 以下时报 `blew_up`**，因为这通常意味着解在有限时间内奇异；枚举里没有更贴切的状态。拒绝步（误差过大）不计入 `maxSteps`，但有 20 倍的总尝试上限防死循环。
- **`Trajectory` 多了 `steps` 字段**（接受的步数），自适应对比定步长的测试需要它。
- **classify 的容差按矩阵规模缩放**：实部比较用 `tol * scale`，行列式和判别式用 `tol * scale²`（它们是元素的二次量）。`scale = max(1, 最大元素绝对值)`。
- **caveat 用中文写**。它最终由 Claude 读给中文课堂的学生，中间少一次翻译。
- **雅可比含非有限值时 classify 返回 `non_hyperbolic` 加专门的 caveat**，不抛异常（文档没规定这种情况）。
- **equilibria 的连续解集判据**：找到 ≥3 个点且其中 ≥60% 是 `non_hyperbolic`（连续解集上雅可比必然奇异）→ `possible_continuum`；超过 `maxPoints`（默认 30）但大多数是双曲的 → `hit_limit`。两种都截断到 `maxPoints`。种子撒在格子中心而不是格点上，避开常见的边界奇点。牛顿收敛判据是残差 `|F| ≤ tol * max(1, 场强中位数)`，`tol` 默认 1e-9。
- **新增 `firstOrderEquilibria(expr, yRange)`**：文档要求 Logistic 方程给出 `y=0`、`y=1` 两条平衡线，但 `findEquilibria` 对 `x'=1, y'=g` 永远找不到平衡点（`f=1` 不为零）。一阶方程的平衡解是另一个概念（常数解），所以单独实现：先数值检查 g 与 x 无关，再在 y 上扫描符号变化并二分，对切触型零点做牛顿抛光，并按两侧符号给出 stable / unstable / semi_stable。
- **一处测试预期写错并改正**（不是改容差）：原本期望 `1/x` 在 `x=0` 处的中心差分给出非有限值，实际上差分模板取的是 `±h` 两点，结果是 `1e12` 这种有限大数；改为用 `sqrt(x)` 在 0 处（模板左点落在负数域）来测「非有限值不抛异常」。

## B 阶段：MCP 工具层

- **工具注册放在新文件 `app/mcp/tools.ts`**，`server.ts` 只留 widget 资源、ping 和一行 `registerTools(server)`。文档说 B 只改 `server.ts`；拆文件是为了让 E 阶段改版本号时不用在几百行工具描述里翻找。`route.ts` 未动。
- **四个新工具用 SDK 的 `server.registerTool`，不带 `_meta.ui`**（B 阶段 widget 还不认识它们的结果）；E 阶段再切到 `registerAppTool` 并挂上资源地址。`ping` 保留原样，`structuredContent` 多了 `kind: "ping"` 便于 widget 分流。
- **结果契约 `lib/scene.ts`**：每个可视化工具的 `structuredContent` 都是一个 `Scene`（kind、system、box、field、trajectories、equilibria、firstOrder…），widget 和网页外壳都只消费这个类型。`analyze_system` 顺带返回一份场采样，这样 widget 一次调用就能画出完整相图。
- **参数越界的报错形式**：SDK 1.30 把 zod 校验失败转成 `isError: true` 的工具结果（文字里点名字段），而不是 JSON-RPC 错误对象；两种都是规范允许的，冒烟脚本和单测都按「二者之一」验收。表达式解析失败和盒子颠倒是我们自己抛的，也走 `isError` 结果，并说明是 f 还是 g 出错。
- **轨线点数上限 1000/方向**（均匀抽稀，保留末点），`trace_trajectory` 默认自适应积分、双向、观察盒 ±3 且离开盒子即停，防止 `tSpan=1000` 时返回十万个点。
- **结果摘要用中文**（分类名、状态解释、caveat 原文），description 用英文（给模型的指令）。
- **工具层测试不走 HTTP**：用 SDK 的 `InMemoryTransport` 连一个真实 `Client`，覆盖 tools/list、每个工具的正常与异常路径；HTTP 传输层由 `scripts/smoke.mjs`（`npm run smoke`）对 `next start` 验证。
