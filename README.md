# vector-field-tool

仓库：<https://github.com/Qscxds/vector-field-tool>（public）

微分方程课的向量场教学工具。目标不只是画图，而是让 AI 通过工具调用回答学生关于微分方程的问题：AI 把自然语言翻译成参数、把数值结果翻译成解释，**所有数学计算由确定性代码完成**，AI 一个数字都不许自己算。

当前状态（2026-09-02 夜跑之后）：

- **计算内核完成**（`lib/core/`）：表达式解析、场采样、RK4 与自适应 Dormand–Prince 积分、雅可比、平衡点分类（带诚实的 caveat）、数值求平衡点、一阶方程适配。171 个单测，期望值全部来自数学推导。
- **MCP 工具层完成**：`analyze_system`、`trace_trajectory`、`sample_field`、`analyze_first_order`，加链路探针 `ping`。
- **渲染与网页外壳完成**：`/vector-field` 页面可用，预设一键加载，点击画布加轨线。
- **widget 已接线**，在本地模拟主机里验证过渲染；**Claude 实机渲染待人工验证**（widget 资源地址变了，Claude 里必须断开重连连接器），见 `docs/NIGHT-summary.md`。
- 未做：推 GitHub、部署 Vercel、widget 内交互、限流。

交接与夜跑文档：`docs/P0-handoff.md`（P0）、`docs/NIGHT-summary.md`（进度、验证清单）、`docs/NIGHT-decisions.md`（所有偏离原计划的决定）、`docs/NIGHT-open-questions.md`（待拍板事项）。

## 架构（长期有效）

一份计算内核，两个外壳：

```
                 学生浏览器                Claude 等 AI 客户端
                     │                            │
                     ▼                            ▼
               网页外壳                       MCP 外壳
        (app/vector-field/page.tsx)      (app/mcp/route.ts)
                     │                            │
                     └────────────┬───────────────┘
                                  ▼
                     lib/core/    纯函数计算内核
                     lib/render/  纯函数几何（坐标、箭头、刻度、颜色）
                     components/  canvas 渲染组件（只收数据）
```

硬约束：

1. `lib/core/` 和 `lib/render/` 是纯函数：不许 import React / Next.js / MCP 任何东西，不用 `Math.random`。`lib/architecture.test.ts` 自动检查。
2. 渲染组件只接收数据 props（一个 `Scene`），不知道调用方是谁，不调用 `lib/core`。
3. 网页外壳和 MCP 外壳共用同一份 core 和同一套组件，共用的数据契约是 `lib/scene.ts`。
4. 无状态：没有数据库、没有账号、没有登录、没有 secret。每个请求新建一个 McpServer，算完就走。

## 目录

```
app/mcp/route.ts           MCP 端点 /mcp（Streamable HTTP，无状态，无鉴权；GET/DELETE 回 405）
app/mcp/server.ts          每请求新建 McpServer；widget 资源（版本号在这里）；ping
app/mcp/tools.ts           四个分析工具：zod 参数校验、给 AI 看的 description、中文结果摘要
app/widget/page.tsx        widget 页面：接收工具结果的 Scene，用 VectorFieldCanvas 画出来
app/vector-field/page.tsx  网页外壳：表单 + 预设 + 画布 + 平衡点列表
app/vector-field/presets.ts 预设例子
app/page.tsx               首页说明
app/layout.tsx             根布局（含 iframe 内的 history 补丁，不要删）
base-url.ts                公网地址：BASE_URL 或 Vercel 系统变量，喂给 assetPrefix
components/VectorFieldCanvas.tsx  画场、轨线、平衡点标记、一阶平衡解横线
lib/core/                  parse field integrate jacobian classify equilibria slope-field types
lib/render/                viewport arrows ticks color
lib/scene.ts               工具结果 = Scene 的类型契约
lib/labels.ts              中文标签与数字格式化，两个外壳共用
scripts/smoke.mjs          对运行中的服务器做 HTTP 冒烟（npm run smoke）
docs/                      交接与夜跑文档
```

## MCP 工具

| 工具 | 算什么 | 什么时候用 |
|---|---|---|
| `analyze_system(f, g, xMin.., density)` | 观察范围内全部平衡点，各带雅可比、特征值、分类、caveat，附一份场采样 | 学生问平衡点、稳定性、相图、临界点类型、长期行为 |
| `trace_trajectory(f, g, x0, y0, tSpan, direction, method)` | 从初值正向 / 逆向积分，返回点列和终止原因 | 学生问某个初值出发会怎样、轨线去哪、是否趋向平衡点或极限环 |
| `sample_field(f, g, xMin.., density)` | 规则网格上的向量场 | 只想看方向场 / 相平面箭头 |
| `analyze_first_order(expr, xMin.., density)` | dy/dx = g(x, y) 的斜率场，自治时给出平衡解与稳定性 | 单个一阶方程：Logistic、牛顿冷却、可分离方程、斜率场 |
| `ping(message)` | 原样返回 | 链路探针，判断是传输层挂了还是只有渲染挂了 |

表达式写法：变量 `x`、`y`（`t` 为时间），乘号必须写出来（`x*y`，不是 `xy`），幂用 `^`，函数 `sin cos tan asin acos atan atan2 sinh cosh tanh exp log log10 sqrt abs sign pow min max floor ceil round`，常数 `pi`、`e`，其他常数放 `params`，分段可用 `x > 0 ? 1 : -1`。解析走 mathjs AST 白名单，赋值、属性访问、非白名单函数一律拒绝并点名。

分类结果的诚实性规则：纯虚特征值只报 `center_or_weak_spiral` 并附 caveat（线性化分不清中心和弱螺旋）；行列式约等于零报 `non_hyperbolic` 并附 caveat（Hartman–Grobman 不适用）。caveat 是给学生念的完整中文句子。

## 本地运行

要求 Node ≥ 20.9（推荐 24，Vercel 默认也是 24）。

```bash
npm install
npm run dev          # http://localhost:3000 ，网页外壳在 /vector-field
npm test             # vitest，171 个测试
npm run typecheck    # tsc --noEmit
npm run build        # 生产构建
npm run smoke        # 对已运行的服务器做 HTTP 冒烟（默认 http://localhost:3000/mcp）
```

冒烟脚本检查 initialize、五个工具的 tools/list 与调用、非法输入的错误形式、widget 资源的 HTML 与 CSP、GET 405。要先在另一个终端起服务器（`npm run dev` 或 `npm run build && npm start`）。

手动验证一个工具调用：

```bash
curl -s -X POST http://localhost:3000/mcp -H "content-type: application/json" -H "accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"analyze_system","arguments":{"f":"x - x*y","g":"x*y - y","xMin":-0.5,"xMax":3,"yMin":-0.5,"yMax":3}}}'
```

响应是 SSE 格式（`event: message` + `data: {...}`）。无状态模式下每个请求独立，不需要 session 头。

## 暴露给 Claude 测试

Claude 从 Anthropic 云端连接你的服务器（桌面版也是），所以本地必须走公网隧道。**用 cloudflared，不要用 ngrok 免费版**：ngrok 免费版对浏览器请求插一个警告页，Claude 沙箱 iframe 加载 JS/CSS 时拿到的是警告页，widget 会白屏（[claude-ai-mcp#53](https://github.com/anthropics/claude-ai-mcp/issues/53)）。

1. 装 cloudflared（Windows）：

   ```bash
   winget install Cloudflare.cloudflared
   ```

2. 先起隧道，拿到地址：

   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```

   免账号的快速隧道地址在 **cloudflared 进程重启时会变**，调试时让它一直开着。

3. 另开一个终端，把隧道地址告诉 Next 再启动（PowerShell；不是 secret，只是让 Next 知道自己的公网地址）：

   ```bash
   $env:BASE_URL = "https://xxxx.trycloudflare.com"; npm run dev
   ```

   隧道地址变了就要改 BASE_URL 并重启。为什么必须这样见下文「三道关」。

4. Claude（网页版或桌面版）→ 设置 → Connectors → Add custom connector：URL 填 `https://xxxx.trycloudflare.com/mcp`，鉴权选 None。Team/Enterprise 版只有 Owner 能加；Free 版限一个。

5. **改过 widget 版本号之后，必须在 Claude 里把连接器断开再重连**。Claude 缓存连接时的工具列表（里面记着 widget 资源地址），按旧地址读会得到 Resource not found，widget 静默变空白。

6. 对话里说「用 analyze_system 分析 x' = x - x*y, y' = x*y - y」，应看到相图 widget；说「用 ping 工具发一句 hello」可以单独测链路。

### 为什么需要 BASE_URL，以及 widget 在沙箱里跑起来要过的三道关

Claude 把 widget HTML 渲染在它自己的沙箱域名 `<hash>.claudemcpcontent.com` 上，页面等于被搬到了别人的源下运行。三个坑，每个都会让 widget 静默变成空白：

1. **资源地址与 Turbopack 前缀必须同时是我们的公网源。** Next 的运行时用「脚本 URL 去掉构建时前缀」识别 chunk，前缀对不上就永远等不到入口执行，不报任何错。只有 `assetPrefix` 能同时改地址和前缀，它在构建时固定，所以公网地址必须提前知道：本地隧道靠 `BASE_URL`，Vercel 上由系统变量自动推出（`base-url.ts`）。**不要在请求时改写 HTML 里的资源 URL**，试过，不行。
2. **`<base href>` 需要 CSP 放行。** MCP Apps 规范规定主机默认 `base-uri 'self'`，服务器在资源的 `_meta.ui.csp.baseUriDomains` 里声明自己的源。
3. **`history.replaceState` 会抛 SecurityError。** Next 水合后写 history，地址与 iframe 自身的源不一致，浏览器抛异常，React 19 卸载整棵树。`app/layout.tsx` 里有一段只在 iframe 中生效的内联脚本吞掉它。

另外：Next 16.3 起开发服务器默认对跨源 `/_next/*` 返回 403，`next.config.ts` 配了 `allowedDevOrigins`；Claude 沙箱 CSP 不允许 eval，zod 启动时探测一次 `new Function` 并自行捕获，主机会记一条无害的违规报告。

不依赖 Claude 复现 widget 问题的方法：两个不同源的静态页面，外层扮演主机（应答 `ui/initialize`、推送 `ui/notifications/tool-result`），内层用 `<iframe sandbox="allow-scripts allow-same-origin">` 加载按规范 CSP 提供的 widget HTML，看 iframe 是否发出 `ui/initialize` 并画出画布。夜跑时就是这样验证 E 阶段的。

## 部署到 Vercel

1. import 仓库，框架自动识别为 Next.js，不需要环境变量。
2. **关掉 Deployment Protection**（Settings → Deployment Protection → Vercel Authentication → Disabled）。有意为之：没有 secret、没有用户数据，关掉后 preview URL 也能给 Claude 连。
3. Claude 里添加 `https://<project>.vercel.app/mcp`。

Vercel 将于 2026-10-01 弃用 Node 20 运行时，本项目 `engines` 允许 ≥20.9，Vercel 默认选 24。

## 排错

- **widget 不出现或一块空白**：先确认启动时设了 `BASE_URL` 且与连接器地址一致；改过版本号要重连连接器；然后 Claude 桌面版 Help → Troubleshooting → Enable Developer Mode，Ctrl+Shift+I 看内层 iframe 控制台。其他原因：`/_next/*` 被 403、ngrok 免费版、Vercel Deployment Protection 没关。先用 `ping` 判断传输层是否正常。
- **resources/read 报 `widget fetch failed for <url>`**：服务器推算出的公网地址它自己访问不到。检查隧道、`x-forwarded-host`、`BASE_URL`。
- **日志里出现 400**：Claude 有些请求带 `mcp-protocol-version: 2026-07-28`，路由会降级为 SDK 支持的版本再处理。每个 POST 打一行 `[mcp] <method> ...` 日志。
- **连接器无法连接**：URL 带 `/mcp`、是 https、cloudflared 还活着。Claude 出口 IP 段见 <https://platform.claude.com/docs/en/api/ip-addresses>。
- **工具返回 isError**：文字里点名了哪个参数或哪个表达式有问题（例如 `xy` 会提示写成 `x*y`）。参数越界由 zod 校验，同样以 isError 结果返回，不会 500。

## 决策记录

日常决策见 `docs/NIGHT-decisions.md`。骨架期的两条：

- 2026-09-02：不用 mcp-handler，直接用 sdk 1.x（ext-apps 只兼容 sdk 1.x）。隧道用 cloudflared。Vercel Deployment Protection 有意关闭。
- 2026-09-02：widget 走 `assetPrefix`（BASE_URL / Vercel 系统变量），不在请求时改写地址。`/mcp` 对 GET/DELETE 返回 405；对不认识的协议版本头降级。

## 路线图

- ~~P1 计算内核~~、~~P2 MCP 工具~~、~~P3 widget 静态渲染~~、~~P4 网页外壳~~：2026-09-02 夜跑完成。
- 下一步：Claude 实机验证 widget；widget 内交互（点击加轨线、参数滑块）；工具 description 按实际对话反复调；推 GitHub、部署 Vercel。
- P5：绑子域名，按 endpoint 限流（不要按 IP：MCP 请求全部来自 Anthropic 云端的少数几个 IP）。
