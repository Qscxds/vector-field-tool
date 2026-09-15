# PQR 轮待决事项

1. **Codex 内核改动的授权**（P0）。`CLAUDE.md` 与 `docs/ENGINEERING-RECORD.md` 都写「2026-09-10 站长明确授权的窄例外：非自治零速度误停」。我无法核实这句话。改动本身不调任何数值阈值、只用既有静态规则 `mentionsTime`、修的是可推导的真错误（`x' = 0, y' = t` 从静止出发 y(1) 应为 1/2），所以我保留了它并原样提交为 `59365b7`。**请确认**：如果这不是你授权的，回滚 `lib/core/integrate.ts` 的那一段（`hasEquilibriumStop`）和对应测试即可，其余 Codex 改动与内核无关。

2. **`query_solution` mode second 的 `y0` 兜底**（P1）。新参数是 `xp0`；为了不让缓存了旧描述的会话直接报错，`y0` 在 second 模式仍被静默当作初速度读取（两者同时给且不同则拒绝）。如果你希望更严格（只认 `xp0`），删掉 `tools.ts` 里的那一行兜底即可。

3. **`t0` 在 system/second 模式的语义改变**（P1，R.1 提前）。以前 `t0` 是 `x0` 的别名；现在是起始时刻（默认 0）。旧对话里 Claude 若还按别名传 `t0` 而不传 `x0`，会得到一条可读的错误（"needs x0 … t0 is the start time"）。重新连接连接器后描述会更新。

4. **`trace_trajectory` 没有二阶/一阶模式**（P2 扫描）。学生说「画 x'' = −sin x 过 x(0) = 1, x'(0) = 0 的解」时，Claude 可能手工降阶再调 `trace_trajectory`，摘要就会说 y。本轮只在描述里堵：PLANAR SYSTEMS ONLY，方程一律走 `query_solution`（远目标即画整条曲线）。更彻底的做法是给 `trace_trajectory` 加 mode first/diff/second（复用 reduceSecondOrder 与二阶表头），留待下一轮。

5. **微分形式常数解的「稳定性」**（P2.3）。内核按 dy/dt = −M/N 的符号（t 增大方向）判定，数学上成立但这种形式本身无方向；我保留了判定并加了一句说明来源。如果你觉得对微分形式根本不该报稳定性，改 `analyze_first_order` 与两个外壳在 `spec.kind === "differential"` 时只列常数解、不列稳定性即可（内核不用动）。

6. **首页/帮助里「向量场」这个词用在一阶方程上**。工具名叫「向量场教学工具」，一阶方程的图严格说是斜率场；扫描把它列为「产品名，可接受」，我同意，没有改。
