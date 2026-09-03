# H 轮总结（2026-09-03）

- **做到哪了**：H1（上线准备）完成并打 tag；H2（数学优先重新拍板）进行中，本文件随阶段更新。
- **最后一个良好 tag**：`h1-deploy-ready`。
- **你要手动做的**：去 Vercel 导入仓库、关 Deployment Protection、绑域名、在项目环境变量里设 `BASE_URL=https://tools.<域名>` 后重新部署；Claude 里重连连接器。

**H1 完成，可以部署了。** 步骤在 README「部署到 Vercel」；绑完域名不设 `BASE_URL` 会静默白屏，日志里会有 `[base-url]` 警告提醒。

---

## H1：上线准备（tag `h1-deploy-ready`）

| 项 | 做了什么 | 提交 |
|---|---|---|
| H1.1 | `base-url.ts` 改成纯函数 `resolveConfiguredBaseUrl(env)`：显式 `BASE_URL` 优先级最高（压过所有 Vercel 系统变量，无 scheme 时补 https 并警告），Vercel 生产环境无 `BASE_URL` 时回退到 `VERCEL_PROJECT_PRODUCTION_URL` **并打一行警告**说明自定义域名必须显式设置；预览部署用分支 / 部署地址；本地无配置。`base-url.test.ts` 7 个用例覆盖优先级。README 新写「部署到 Vercel」一节讲清这个坑 | `[H1] base-url` |
| H1.2 | 参数上界复查（density ≤ 60、tSpan ≤ 1000、盒子 ≤ 1e6、表达式 ≤ 200 字符对 f/g/expr/M/N 一视同仁、步数 20000/方向、种子 12×12、等值线 8×60×60）；**每次调用 2 秒墙钟预算**：`checkpoint` 回调穿过 `integrate` / `findEquilibria` / `exactPotential` / 等值线循环（内核自己不读时钟，保持纯），超时给可读的 `isError`；**进程内滑动窗口限流** 240 次/分钟/实例，注释和 README 都写明在 serverless 上只是尽力而为 | `[H1] cost controls` |
| H1.3 | 首页加 `/vector-field` 入口和一句说明，MCP 说明退到第二段 | `[H1] home page` |

最贵的合法调用（恰当方程 + 8 条等值线，density 60，盒子 100×100）在测试里实测 < 2 秒（一般 0.3–0.6 秒）。

## H2：按数学优先重新拍板

（进行中）
