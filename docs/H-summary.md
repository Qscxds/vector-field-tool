# H 轮总结（2026-09-03）

- **做到哪了**：H1（上线准备）和 H2（数学优先重新拍板，十条全部）完成；tsc 0 错误、309 个测试全绿、build 通过、隧道 smoke 15/15；main 线性，已推 origin。
- **最后一个良好 tag**：`h2-math-done`（H1 单独的回滚点是 `h1-deploy-ready`）。
- **你要手动做的**：去 Vercel 导入仓库、关 Deployment Protection、绑域名、在项目环境变量设 `BASE_URL=https://tools.<域名>` 后重新部署；Claude 里断开重连连接器（widget 版本 h-1）；看 `docs/H-open-questions.md` 里的拍板项（最要紧的是积分器默认 `atol`）。

**H1 完成，可以部署了。** 步骤在 README「部署到 Vercel」；绑完域名不设 `BASE_URL` 会静默白屏，日志里会有 `[base-url]` 警告提醒。

---

## H1：上线准备（tag `h1-deploy-ready`）

| 项 | 做了什么 | 提交 |
|---|---|---|
| H1.1 | `base-url.ts` 改成纯函数 `resolveConfiguredBaseUrl(env)`：显式 `BASE_URL` 优先级最高（压过所有 Vercel 系统变量，无 scheme 时补 https 并警告），Vercel 生产环境无 `BASE_URL` 时回退到 `VERCEL_PROJECT_PRODUCTION_URL` **并打一行警告**说明自定义域名必须显式设置；预览部署用分支 / 部署地址；本地无配置。`base-url.test.ts` 7 个用例覆盖优先级。README 新写「部署到 Vercel」一节讲清这个坑 | c798bc0 |
| H1.2 | 参数上界复查（density ≤ 60、tSpan ≤ 1000、盒子 ≤ 1e6、表达式 ≤ 200 字符对 f/g/expr/M/N 一视同仁、步数 20000/方向、种子 12×12、等值线 8×60×60）；**每次调用 2 秒墙钟预算**：`checkpoint` 回调穿过 `integrate` / `findEquilibria` / `exactPotential` / 等值线循环（内核自己不读时钟，保持纯），超时给可读的 `isError`；**进程内滑动窗口限流** 240 次/分钟/实例，注释和 README 都写明在 serverless 上只是尽力而为 | 20819d0 |
| H1.3 | 首页加 `/vector-field` 入口和一句说明，MCP 说明退到第二段 | 73cab0c |

最贵的合法调用（恰当方程 + 8 条等值线，density 60，盒子 100×100）在测试里实测 < 2 秒（一般 0.3–0.6 秒）。

## H2：按数学优先重新拍板（tag `h2-math-done`）

| 项 | 改成了什么 | 从推导来的测试 | 提交 |
|---|---|---|---|
| H2.1 爆破判据 | `maxSpeed` 删除；只有位置非有限或超出 1e6 × 问题尺度才报 `blew_up`；场无定义/无穷大/步长塌缩报新状态 `singular`；刚性撞步数上限报 `max_steps` 并说明解仍有界 | `x' = -1e7 x` 默认容差下不是 blew_up 且衰减到 0 附近，`atol = 0` 时精确 `reached_equilibrium`（t ≈ 3.45e-6）；`x' = -1e7 x + 1` 限 200 步 → `max_steps`；`x' = x²` 仍 `blew_up`（t 在 0.9 与 1.001 之间）；界随盒子尺度变化；e^x 溢出 → `singular` | 43b631a |
| H2.2 hover 预算 | 按屏幕弧长：两条画布对角线就停，最后一段精确切到限长，步数只兜底 4000 | 快场（×100）和慢场屏幕长度相同（1e-6）；4 倍缩放后屏幕长度不变、世界长度 1/4；到平衡点的预览按自身规则更短 | 70f2009 |
| H2.3 固定轨线 | 停止盒 = 输入范围 20 倍，视野只裁剪 | 放大 10 倍后点击，轨线跑到 x = 50（可见半宽 0.3）；`x' = 5` 在 ±20 处离开 | 70f2009 |
| H2.4 类型识别三档 | 每种形式都返回 consistent / borderline / inconsistent / untestable + 实测最大相对偏差 + 阈值 + 采样数 + 丢弃数；偏差相对于被比较两项；导数检验带 Richardson 误差估计和多步长；线性检验改为远距离插值；13 个采样点 | 可分离 g = xy(1+εxy) 的偏差 ≈ ε·|Δx·Δy|：ε = 1e-12 / 1e-9 / 1e-5 分别 consistent / borderline / inconsistent；自治 y + εx、线性 y + εy²（偏差 0.29ε）同样三档；缩放 M、N 同乘常数判定不变；exp(10x) + y 丢 7 留 6 仍判恰当，[3,6] 上全丢 → untestable | c765ab1 |
| H2.5 Bernoulli | 区间 [−12, 12]；贴合到分母 ≤ 6 的既约分数并用贴合指数重新核对 | y + x√y → 1/2；y + y^1.5 → 3/2；x/y + y → −1；y + y⁷ → 7；y + x·y^1.41421356 → 不贴合报近似；xy + sin x 是 n = 0 → 报线性 | c765ab1 |
| H2.6 恰当自检失败 | `implicitCheck { pathDeviation, tol, passed }`；失败时摘要与两个外壳都明说并报偏差；基点落在奇点时改用无理分数基点 | dθ = (x dy − y dx)/(x²+y²) 在含原点的盒子上：局部判据通过、路径自检失败、无等值线、文字含 "path-independence self-check" 和实测偏差 | c765ab1 |
| H2.7 连续解集 | 计数判据 **且** 几何判据（共线：协方差特征值比 ≤ 1e-6；或曲线：≥ 80% 的点局部共线）才报 `possible_continuum`；只满足计数报 `multiple_non_hyperbolic` | x 轴共线；单位圆平衡集靠曲线判据（共线性 > 0.1）；(x²−1)², (y²−1)² 的四个孤立二重根不是连续集。顺带修正：`classify` 按问题尺度判零，否则二重根处 3e-12·I 被判成星形结点 | be58eff |
| H2.8 星形容差带 | 判别式在容差带内但不精确为零 → caveat `repeatedRoot` | diag(1±1e-6) 星形 + caveat；diag(2,2)、Jordan 块无 caveat；[[3,1],[1e-12,3]] 退化 + caveat；[[1,−1e-12],[1e-12,1]] 在双精度下判别式恰为 0 → 无 caveat | be58eff |
| H2.9 locale 必填 | 去掉默认值，description 写 REQUIRED | 四个工具漏传各自报错并点名 locale；smoke 脚本补上 | 31c0e38 |
| H2.10 美式拼写 | center / linearization / color / behavior / gray / neighbor …，作用于文案、description、预设、首页 | 断言 "center or weak spiral" | 31c0e38 |
| 不改但要点明范围 | 两个外壳的结果列表上方加「以下结果按当前可见范围 x∈[…], y∈[…] 计算」 | — | 31c0e38 |

widget HTML 有改动（摘要文字、范围说明），`WIDGET_VERSION` g-1 → h-1，Claude 里必须重连连接器。

## 验证输出（最终状态）

```
$ npx tsc --noEmit
(无输出) exit 0

$ npx vitest run --exclude "**/__probe__/**"
 Test Files  20 passed (20)
      Tests  309 passed (309)

$ npm run build   （BASE_URL=https://academic-airplane-silk-hanging.trycloudflare.com）
✓ Compiled successfully
┌ ○ /
├ ○ /_not-found
├ ƒ /mcp
├ ○ /vector-field
└ ○ /widget

$ npm run smoke -- https://academic-airplane-silk-hanging.trycloudflare.com/mcp
15/15 passed   （见下文「隧道 smoke」）

$ git log --oneline
（docs 提交）  [H2] docs: H summary, decisions, open questions; CLAUDE.md and README
31c0e38 [H2] locale is required; American spelling; results state their range; widget h-1
be58eff [H2] equilibria: a continuum needs geometry, not just a count; classify: repeated-root caveat and a field-scale floor
c765ab1 [H2] forms: three-tier verdicts with measured deviations; Bernoulli exponents snap to fractions; exact path-check failures are reported
70f2009 [H2] interactive: hover preview by on-screen length; fixed trajectories stop at 20x the home box
43b631a [H2] integrate: blow-up decided by position only; 'singular' and 'arc_length' statuses
3c7cd09 [H1] docs: deploy section (custom domain needs BASE_URL), cost caps, H summary
73cab0c [H1] home page: link to the interactive page, MCP notes second
20819d0 [H1] cost controls: 2 s budget per call, in-process limiter, kernel checkpoints
c798bc0 [H1] base-url: explicit BASE_URL wins, pure resolver, startup warning
61aae68 [G] docs: new tunnel address in the morning checklist
638a1e9 [G] docs: FG summary, decisions, open questions; CLAUDE.md and README for the G state

$ git tag
a-core-done b-tools-done c-render-done d-webshell-done e-widget-done f-forms-done
g-render-done g-widget-done h1-deploy-ready h2-math-done night-final p0-verified s-spike-done
```

测试数变化：G 结束 252 → H 结束 309（base-url 7、budget 1、limiter 2、cost controls 4、integrate 新增 9、interactive 新增 6、detect-form 重写 +12、equilibria 5、classify 6、locale/tools 若干）。

### 隧道 smoke（最终构建，BASE_URL = 隧道地址）

```
PASS initialize / tools/list (5 tools) / ping / analyze_system / trace_trajectory / sample_field / analyze_first_order
PASS tools/call invalid expression -> isError result
PASS tools/call out-of-range param -> MCP validation error naming the field, not 500
PASS resources/list has the widget
PASS resources/read returns widget HTML
PASS resources/read CSP declares connect/resource/baseUri domains
PASS widget asset URLs are absolute
      widget uri: ui://vector-field-tool/widget.html?v=h-1
PASS GET /mcp -> 405
15/15 passed
```

## 验证清单（按「最快发现问题」排序；每步失败回滚到哪个 tag）

1. **本地 `npm test`、`npm run typecheck`、`npm run build`** —— 30 秒内知道代码是否完整。失败：`git checkout h1-deploy-ready`（H2 之前）。
2. **Claude 重连连接器（隧道地址见上），问「用 ping 发 hello」** —— 链路。失败：与代码无关，先查隧道 / BASE_URL；代码回滚点 `g-widget-done`。
3. **问「分析 x' = x - x*y, y' = x*y - y」并注意：摘要语言是否随提问语言变化；漏传 locale 会不会看到 isError（说明 description 规则没被遵守）** —— H2.9。失败：回滚 `h1-deploy-ready` 恢复默认 `en`。
4. **问「从 (1,0) 出发积分 x' = -1e7 x, y' = 0」** —— 应看到「达到步数上限（解仍有界）」或「趋近平衡点」，绝不是「发散」。失败：`h1-deploy-ready`。
5. **widget 里：悬停一条慢场和一条快场的预览长度是否一样；放大 10 倍再点击、然后双击复位，轨线是否延伸到视野外很远** —— H2.2 / H2.3。失败：`h1-deploy-ready`。
6. **问「分析 2*x*y dx + (x^2 + y^2) dy = 0」和「分析 -y/(x^2+y^2) dx + x/(x^2+y^2) dy = 0」** —— 前者紫色等值线 + 四种形式各带偏差；后者恰当性通过但「路径自检失败」并给出偏差、没有等值线。失败：`h1-deploy-ready`。
7. **问「dy/dx = y + x*sqrt(y) 是什么类型」** —— Bernoulli，指数 n = 1/2（精确分数），不是 0.4999997。失败：`h1-deploy-ready`。
8. **问「分析 x' = (x^2-1)^2, y' = (y^2-1)^2」** —— 四个非双曲平衡点、提示「多个孤立的退化平衡点」而不是「连续解集」。失败：`h1-deploy-ready`。
9. **部署 Vercel 后**：先用 `*.vercel.app/mcp` 跑 `npm run smoke -- <url>`；绑域名 + 设 `BASE_URL` 后再跑一次，`widget asset URLs are absolute` 必须 PASS 且指向你的域名。失败：查构建日志里的 `[base-url]` 警告。

## 对抗式审查（在冻结的 `h2-math-done` 上）

（跑完后追加在这里。）
