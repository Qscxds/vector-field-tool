# P0 交接：骨架轮完成（2026-09-02）

## 状态

- **P0 验收线已过**：本地 `next start` 经 cloudflared 隧道接入 Claude 自定义连接器，调用 `ping` 工具后 widget 在对话里渲染出「connected to host」和 `{"message":"hello"}`。
- 未做：推到 GitHub（还没有 remote）、部署 Vercel。两者都是用户手动步骤，README 有说明。
- 仓库 `E:\project\vector-field-tool`，分支 main，6 个 commit，工作区干净。

## 现有文件

| 文件 | 作用 |
|---|---|
| `app/mcp/route.ts` | `/mcp` 端点。POST 交给 SDK 的无状态 Web 标准传输层；GET/DELETE 回 405；不认识的 `mcp-protocol-version` 头降级；每请求一行日志 |
| `app/mcp/server.ts` | 每个请求新建 McpServer；注册 `ping` 工具和 `ui://` widget 资源；自抓 `/widget` 页面并注入 `<base href>` |
| `app/widget/page.tsx` | widget 页面，`useApp()` 接收 tool input/result 并显示 |
| `app/layout.tsx` | 根布局；含仅在 iframe 中生效的 history 补丁 |
| `app/page.tsx` | 首页说明 |
| `base-url.ts` | 公网地址：BASE_URL 或 Vercel 系统变量；喂给 `assetPrefix` |
| `next.config.ts` | `assetPrefix`、`allowedDevOrigins`、关闭 dev 指示器 |
| `lib/core/hello.ts` | 纯函数内核占位（`hello`、`echo`） |
| `lib/core/*.test.ts` | 单测 + 架构守卫（lib/core 不得 import React/Next/MCP） |
| `app/mcp/server.test.ts` | `rewriteForSandbox` 单测 |
| `README.md` / `CLAUDE.md` | 运行、隧道、部署、排错、决策记录；给 AI 会话的项目规则 |

## 技术栈（已验证可装可跑）

next 16.3.4 · react 19.2.8 · @modelcontextprotocol/sdk ^1.30.0 · @modelcontextprotocol/ext-apps ^1.7.5 · zod ^4.5.4 · typescript ^5.9.3 · vitest ^4.1.11 · Node 24（≥20.9）。**不用 mcp-handler**：ext-apps 只兼容 sdk 1.x。

## 这一轮学到的、下一轮必须遵守的

1. widget 资源地址是 `ui://vector-field-tool/ping.html?v=<版本>`。**改了 widget 就要改版本号，改了版本号 Claude 侧必须断开重连连接器**（它缓存工具列表里的资源地址，读旧地址会得到「Resource not found」并静默失败）。
2. 公网地址必须在构建时已知（`assetPrefix`）。隧道调试：`$env:BASE_URL="https://xxx.trycloudflare.com"; npm run dev`，隧道地址变了就重启。**不要在请求时改写 HTML 里的资源 URL**，Turbopack 按构建前缀识别 chunk，改了就静默不水合。
3. 资源 `_meta.ui.csp` 要声明 `connectDomains`、`resourceDomains`、`baseUriDomains`（都填自己的公网源）。
4. 根布局的 history 补丁不能删：Next 水合后的 `replaceState` 在 iframe 里抛 SecurityError，React 19 会卸载整棵树。
5. Claude 的请求特征：多个子客户端（Anthropic、Anthropic/Toolbox、Anthropic/ClaudeAI、claude-ai）各自 initialize，协议 2025-11-25；会先发一个带 `mcp-protocol-version: 2026-07-28` 的 `server/discover` 探测。
6. `lib/core` 的纯度由测试强制；工具 description 是给 AI 看的 prompt（P2 重点）。

## 本地验证命令

```
npm test            # 10 个单测
npm run typecheck
npm run build
```

JSON-RPC 手测见 README「手动验证 MCP 端点」。不依赖 Claude 复现 widget 水合问题的方法见 README 排错一节。

## 下一轮（P1）范围提示

按原始路线图：mathjs 解析、网格采样、RK4、数值求平衡点、雅可比特征值与稳定性分类，全部放进 `lib/core/`，用课本上有解析解的例子（线性系统、简谐振子、Lotka-Volterra）写 vitest。P1 不碰 MCP 工具和 widget（那是 P2/P3）。
