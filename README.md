# vector-field-tool

微分方程课的向量场教学工具。目标不只是画图，而是让 AI 通过工具调用回答学生关于微分方程的问题：AI 把自然语言翻译成参数、把数值结果翻译成解释，**所有数学计算由确定性代码完成**。

当前状态：**P0 骨架轮已完成并通过 Claude 验收（2026-09-02）**。只有一个什么都不算的 `ping` 工具和一个最简 widget，用来验证 Claude → MCP 服务器 → widget iframe 整条链路。交接文档见 `docs/P0-handoff.md`。

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
                     lib/core/  (纯函数计算内核)
                     components/  (canvas 渲染组件)
```

硬约束：

1. `lib/core/` 是纯函数，不许 import React / Next.js / MCP 任何东西。`lib/core/architecture.test.ts` 会自动检查。
2. 渲染组件只接收数据 props，不知道调用方是谁。
3. 网页外壳和 MCP 外壳共用同一份 core 和同一套组件。
4. 无状态：没有数据库、没有账号、没有登录、没有 secret。请求进来算完就走。

## 目录

```
app/mcp/route.ts        MCP 端点 /mcp（Streamable HTTP，无状态，无鉴权）
app/mcp/server.ts       注册工具和 widget 资源；把 MCP 调用翻译成 lib/core 调用
app/widget/page.tsx     widget 页面，Claude 在沙箱 iframe 里渲染它
app/page.tsx            首页，说明端点在哪
lib/core/               纯函数计算内核（P0 只有占位 hello.ts）
lib/core/*.test.ts      vitest 测试
```

## 技术栈

| 包 | 版本 | 说明 |
|---|---|---|
| next | 16.3.4 | App Router，部署 Vercel |
| @modelcontextprotocol/sdk | ^1.30.0 | MCP 服务端，直接用它自带的 `WebStandardStreamableHTTPServerTransport` |
| @modelcontextprotocol/ext-apps | ^1.7.5 | MCP Apps widget SDK：服务端 `registerAppTool/registerAppResource`，前端 `useApp()` |
| zod | ^4.5.4 | 工具参数 schema |
| vitest | ^4.1.11 | 测试 |
| mathjs | 下一轮 | 表达式解析（P1 再装） |

**为什么不用 mcp-handler（2026-09-02 决定）**：mcp-handler 2.x 依赖 SDK v2 的 `@modelcontextprotocol/server`，而 ext-apps 所有版本只兼容 `@modelcontextprotocol/sdk` 1.x（迁移 issue [ext-apps#702](https://github.com/modelcontextprotocol/ext-apps/issues/702) 未完成）。ext-apps 是不可替换的一环，所以向它对齐，用 sdk 1.x 直接写路由，共约二十行。将来 ext-apps 迁到 v2 后若要换回 mcp-handler，只改 `app/mcp/route.ts` 一个文件。

## 本地运行

要求 Node ≥ 20.9（推荐 24，Vercel 默认也是 24）。

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # vitest
npm run typecheck    # tsc --noEmit
npm run build        # 生产构建
```

手动验证 MCP 端点（不需要 Claude）：

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
```

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"ping","arguments":{"message":"hello"}}}'
```

响应是 SSE 格式（`event: message` + `data: {...}`）。无状态模式下每个请求独立，不需要 session 头。对 `/mcp` 的 GET 和 DELETE 一律返回 405：本服务器不提供独立 SSE 流也没有 session，规范允许这样做，也避免 Vercel 函数被一条空闲长连接挂住。

## 暴露给 Claude 测试（验收线）

Claude 从 Anthropic 云端连接你的服务器（桌面版也是），所以本地必须走公网隧道。**用 cloudflared，不要用 ngrok 免费版**：ngrok 免费版对浏览器请求插一个警告页，Claude 沙箱 iframe 加载 JS/CSS 时拿到的是警告页，widget 会白屏（[claude-ai-mcp#53](https://github.com/anthropics/claude-ai-mcp/issues/53)，Anthropic 明确不会绕过）。ngrok 付费版没有这个问题。

1. 装 cloudflared（Windows）：

   ```bash
   winget install Cloudflare.cloudflared
   ```

2. 先起隧道，拿到地址：

   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```

   cloudflared 会打印一个 `https://xxxx.trycloudflare.com` 地址。免账号的快速隧道地址在 **cloudflared 进程重启时会变**，所以调试时让它一直开着。

3. 另开一个终端，把隧道地址告诉 Next 再启动（PowerShell 写法；不是 secret，只是让 Next 知道自己的公网地址）：

   ```bash
   $env:BASE_URL = "https://xxxx.trycloudflare.com"; npm run dev
   ```

   隧道地址变了就要改 BASE_URL 并重启 `next dev`。为什么必须这样见下文「为什么需要 BASE_URL」。

4. Claude（网页版或桌面版）→ 设置 → Connectors → Add custom connector：
   - URL 填 `https://xxxx.trycloudflare.com/mcp`
   - 鉴权选 None（旧版对话框不填 OAuth 即可）
   - Team/Enterprise 版只有 Owner 能加自定义连接器；Free 版限一个

5. 在对话里说「用 ping 工具发一句 hello」。首次会弹出允许提示，点 Allow 后应看到 widget 渲染出 `{"message":"hello"}`。

**这一步过了才算 P0 完成，过之前不写任何数学代码。**

### 为什么需要 BASE_URL，以及 widget 在沙箱里跑起来要过的三道关

Claude 把 widget HTML 渲染在它自己的沙箱域名 `<hash>.claudemcpcontent.com` 上，我们的页面等于被搬到了别人的源下运行。P0 验收时踩到的三个坑，每个都会让 widget 静默变成空白：

1. **资源地址与 Turbopack 前缀必须同时是我们的公网源。** Next 的运行时用「脚本 URL 去掉构建时前缀」来识别 chunk，前缀对不上就永远等不到入口执行，不报任何错。只有 `assetPrefix` 能同时改地址和前缀，而它在构建时就固定了，所以公网地址必须提前知道：本地隧道靠 `BASE_URL`，Vercel 上由系统变量自动推出（见 `base-url.ts`）。在资源读取时改写 HTML 里的 URL、或者只靠 `<base href>` 让浏览器解析，都试过，都不行。
2. **`<base href>` 需要 CSP 放行。** MCP Apps 规范规定主机默认 `base-uri 'self'`，服务器必须在资源的 `_meta.ui.csp.baseUriDomains` 里声明自己的源，否则 `<base>` 被忽略。
3. **`history.replaceState` 会抛 SecurityError。** Next 水合后会把路由地址写进 history，这个地址解析出来和 iframe 自身的源不一致，浏览器抛异常，React 19 随即卸载整棵树并显示 Next 的错误页。`app/layout.tsx` 里有一段只在被嵌入 iframe 时生效的内联脚本，吞掉这类错误。

另外两条相关配置：

- Next 16.3 起开发服务器默认对跨源的 `/_next/*` 请求返回 403，`next.config.ts` 里配了 `allowedDevOrigins: ["**.claudemcpcontent.com", "**.trycloudflare.com"]`。生产环境不受影响。
- Claude 沙箱的 CSP 不允许 eval。zod 库启动时会试探一次 `new Function` 并自行捕获，主机因此会记录一条 `script-src` 违规报告，无害，可忽略。

没有 BASE_URL 且不在 Vercel 上时（纯本地 `npm run dev`），服务器改为从请求头推算自己的地址，够 curl 手测用，但 widget 在 Claude 里不会正常水合。

## 部署到 Vercel

1. 把仓库 import 进 Vercel，框架自动识别为 Next.js，不需要任何环境变量。
2. **关掉 Deployment Protection**（项目 Settings → Deployment Protection → Vercel Authentication 设为 Disabled）。这是有意为之：本项目没有 secret、没有用户数据，关掉之后 preview 部署的 URL 也能直接给 Claude 连，迭代 widget 时不用每次都发到 production。开着的话只有 production 域名能被 Claude 和服务器自身访问，preview URL 会 401。
3. 在 Claude 里添加 `https://<project>.vercel.app/mcp` 为自定义连接器，重复上面的 ping 测试。

Vercel 将于 2026-10-01 弃用 Node 20 运行时，本项目 `engines` 允许 ≥20.9，Vercel 默认会选 24。

## 排错

- **widget 不出现，只有文字，或者一块空白**：先确认启动时设了 `BASE_URL`（隧道场景）且和 Claude 里填的连接器地址一致；然后 Claude 桌面版 Help → Troubleshooting → Enable Developer Mode，Ctrl+Shift+I 看内层 iframe 的控制台。其他常见原因：`/_next/*` 被 403（allowedDevOrigins）、用了 ngrok 免费版、Vercel Deployment Protection 没关。本地可以不依赖 Claude 复现：两个不同源的静态页面，外层用 `<iframe sandbox="allow-scripts allow-same-origin">` 嵌入按规范 CSP 提供的 widget HTML，看 iframe 是否向父窗口 postMessage 出 `ui/initialize`。
- **resources/read 报 `widget fetch failed for <url>`**：服务器推算出的公网地址是 `<url>`，但它自己访问不到。检查隧道是否还在、代理是否正确传 `x-forwarded-host`；必要时设 `BASE_URL`。
- **日志里出现 400**：Claude 有些请求带 `mcp-protocol-version: 2026-07-28`，sdk 1.x 不认识。路由会把不认识的版本头改写成它支持的最新版本再交给 SDK，请求体格式相同、服务器又无状态，所以是安全的。开发模式下每个 POST 会打一行 `[mcp] <method> version=... ua=...` 日志。
- **连接器显示无法连接**：确认隧道 URL 带 `/mcp`、是 https、cloudflared 还活着。Claude 出口 IP 段见 <https://platform.claude.com/docs/en/api/ip-addresses>。
- **改了 widget 但 Claude 显示旧的**：`app/mcp/server.ts` 里把 `WIDGET_VERSION` 加一，资源 URI 变了主机就会重新拉。**但 Claude 会缓存连接时的工具列表**（里面记着旧的资源地址），所以改完版本号必须在 Claude 设置里把连接器断开再重连，否则它按旧地址读、服务器答「Resource not found」、widget 静默变空白。
- 社区里有一批「widget 静默回退成文字」的报告（[ext-apps#671](https://github.com/modelcontextprotocol/ext-apps/issues/671)），原因五花八门，其中一例是服务器没正确应答 `ping` 方法。本项目用官方 SDK，`ping` 由 SDK 处理。

## 决策记录

- 2026-09-02：不用 mcp-handler，直接用 sdk 1.x（原因见上）。隧道用 cloudflared。Vercel Deployment Protection 有意关闭。目录 `E:\project\vector-field-tool`，独立仓库。
- 2026-09-02：widget 走 `assetPrefix`（BASE_URL / Vercel 系统变量）而不是请求时推算地址，原因见「三道关」。`/mcp` 对 GET/DELETE 返回 405；对不认识的 `mcp-protocol-version` 头降级而不是拒绝。

## 路线图（本轮不做）

- **P1** 计算内核：mathjs 解析、网格采样、RK4、数值求平衡点、雅可比特征值与稳定性分类；用有解析解的课本例子做 vitest。
- **P2** 把内核包成 MCP 工具，工具 description 就是给 AI 的 prompt。
- **P3** widget：canvas 画向量场和轨线，点击加初值，参数滑块。
- **P4** 网页外壳 `app/vector-field/`，复用同一套组件。
- **P5** 绑子域名，按 endpoint 限流（不要按 IP：MCP 请求全部来自 Anthropic 云端的少数几个 IP）。
