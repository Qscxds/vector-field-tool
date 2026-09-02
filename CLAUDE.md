@AGENTS.md

# vector-field-tool

Teaching tool for differential-equations courses. Claude answers students' questions by calling MCP
tools; every number comes from deterministic code in `lib/core`. The AI only translates language to
parameters and results to explanations. README.md (Chinese) has run / tunnel / deploy steps and the roadmap.

## Architecture rules (long-lived, do not change)

1. `lib/core/` is pure: no React, Next.js or MCP imports. Data in, data out. Must run offline under
   vitest. Enforced by `lib/core/architecture.test.ts`.
2. Rendering components only receive data props and do not know who is calling them.
3. The web shell (`app/vector-field/`, P4) and the MCP shell (`app/mcp/`) share the same core and
   components. Never write a second copy.
4. Stateless: no database, no accounts, no login, no secrets. One McpServer per request.

## Stack decisions (2026-09-02)

- No mcp-handler. `@modelcontextprotocol/sdk` 1.x + `WebStandardStreamableHTTPServerTransport` used
  directly, because `@modelcontextprotocol/ext-apps` (the widget SDK) only supports sdk 1.x
  (modelcontextprotocol/ext-apps#702 still open). Switching back later touches only `app/mcp/route.ts`.
- `/mcp` accepts POST only. GET and DELETE return 405: no standalone SSE stream, no sessions.
- The widget is the Next page `app/widget/page.tsx`, self-fetched at resource-read time with a
  `<base href>` injected (allowed via `csp.baseUriDomains`). The public origin comes from
  `base-url.ts`: `BASE_URL` (tunnel dev) or Vercel system env, and feeds `assetPrefix`. Request
  headers are only a fallback on plain localhost. Do NOT rewrite asset URLs at request time: the
  Turbopack runtime matches chunks by stripping its build-time base path from script URLs.
- `app/layout.tsx` patches `history.pushState/replaceState` when embedded in an iframe: Next's
  post-hydration replaceState throws SecurityError cross-origin and React 19 would unmount everything.
- `/mcp` downgrades unknown `mcp-protocol-version` headers (Claude sends 2026-07-28) instead of 400.
- Tunnel dev: `$env:BASE_URL = "https://<tunnel>"; npm run dev` (PowerShell). Restart when the
  tunnel URL changes.
- Local testing goes through cloudflared. ngrok's free tier serves an interstitial that breaks widget
  assets in Claude's iframe. Vercel Deployment Protection is intentionally OFF for this project.

## Working rules

- P0 acceptance (the widget renders inside Claude through a tunnel) must pass before any math code
  is written. Roadmap P1-P5 lives in README.md.
- Tool descriptions are the prompt Claude sees. They will be tuned repeatedly from P2 on.
- Commands: `npm run dev`, `npm test`, `npm run typecheck`, `npm run build`. Smoke-test `/mcp` with
  JSON-RPC over curl (examples in README.md).
- Reply to the user in Chinese. Keep code, comments, commit messages and paths in English.
