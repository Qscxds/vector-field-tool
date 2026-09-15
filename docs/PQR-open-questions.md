# PQR 轮待决事项

1. **Codex 内核改动的授权**（P0）。`CLAUDE.md` 与 `docs/ENGINEERING-RECORD.md` 都写「2026-09-10 站长明确授权的窄例外：非自治零速度误停」。我无法核实这句话。改动本身不调任何数值阈值、只用既有静态规则 `mentionsTime`、修的是可推导的真错误（`x' = 0, y' = t` 从静止出发 y(1) 应为 1/2），所以我保留了它并原样提交为 `59365b7`。**请确认**：如果这不是你授权的，回滚 `lib/core/integrate.ts` 的那一段（`hasEquilibriumStop`）和对应测试即可，其余 Codex 改动与内核无关。

2. **`query_solution` mode second 的 `y0` 兜底**（P1）。新参数是 `xp0`；为了不让缓存了旧描述的会话直接报错，`y0` 在 second 模式仍被静默当作初速度读取（两者同时给且不同则拒绝）。如果你希望更严格（只认 `xp0`），删掉 `tools.ts` 里的那一行兜底即可。

3. **`t0` 在 system/second 模式的语义改变**（P1，R.1 提前）。以前 `t0` 是 `x0` 的别名；现在是起始时刻（默认 0）。旧对话里 Claude 若还按别名传 `t0` 而不传 `x0`，会得到一条可读的错误（"needs x0 … t0 is the start time"）。重新连接连接器后描述会更新。
