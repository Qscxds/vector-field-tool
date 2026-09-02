@AGENTS.md

# vector-field-tool

Teaching tool for differential-equations courses. Claude answers students' questions by calling MCP
tools; every number comes from deterministic code in `lib/core`. The AI only translates language to
parameters and results to explanations. README.md (Chinese) has run / tunnel / deploy steps.
`docs/NIGHT-summary.md`, `docs/NIGHT-decisions.md`, `docs/NIGHT-open-questions.md` record the
2026-09-02 overnight build (stages A-E) and what still needs a human.

## Module map

- `lib/core/` pure math kernel: `parse` (mathjs AST whitelist -> compiled system, eval never throws),
  `field` (grid sampling), `integrate` (RK4 + adaptive Dormand-Prince, shared stop rules),
  `jacobian`, `classify` (trace/det classification with honesty caveats), `equilibria`
  (seeded damped Newton + LM fallback), `slope-field` (dy/dx = g as x'=1, y'=g; constant solutions).
- `lib/render/` pure geometry: `viewport`, `arrows`, `ticks`, `color`.
- `lib/scene.ts` the data contract: every visual tool returns a `Scene` as structuredContent; the
  widget and the web shell only ever consume a Scene.
- `lib/labels.ts` Chinese labels + number formatting shared by tool summaries and the web shell.
- `components/VectorFieldCanvas.tsx` draws a Scene; data props only, never calls lib/core.
- `app/mcp/route.ts` the /mcp endpoint (do not touch casually); `app/mcp/server.ts` widget
  resource + ping + `WIDGET_VERSION`; `app/mcp/tools.ts` the four analysis tools.
- `app/widget/page.tsx` MCP Apps widget; `app/vector-field/` the web shell.
- `scripts/smoke.mjs` HTTP smoke test against a running server (`npm run smoke`).

## Architecture rules (long-lived, do not change)

1. `lib/core/` and `lib/render/` are pure: no React, Next.js or MCP imports, no `Math.random`.
   Enforced by `lib/architecture.test.ts`.
2. Rendering components only receive data props and do not know who is calling them.
3. The web shell and the MCP shell share the same core and components. Never write a second copy.
4. Stateless: no database, no accounts, no login, no secrets. One McpServer per request.
5. Honesty over confidence in `classify`: purely imaginary pairs are `center_or_weak_spiral` with a
   caveat, never a centre; det ~ 0 is `non_hyperbolic` with a caveat. Caveats are full Chinese
   sentences read to students verbatim.
6. Test expectations come from derivation, never from running the code. A failing test is never
   fixed by loosening a tolerance; record it in open-questions and mark it instead.

## Stack decisions

- No mcp-handler. `@modelcontextprotocol/sdk` 1.x + `WebStandardStreamableHTTPServerTransport`
  directly, because `@modelcontextprotocol/ext-apps` only supports sdk 1.x (ext-apps#702 open).
- `/mcp` accepts POST only; GET and DELETE return 405. Unknown `mcp-protocol-version` headers
  (Claude sends 2026-07-28) are downgraded, not rejected. One log line per request.
- Widget: Next page self-fetched at resource-read time with `<base href>` injected (allowed via
  `csp.baseUriDomains`). Public origin from `base-url.ts` (`BASE_URL` for tunnel dev, Vercel system
  env otherwise) feeds `assetPrefix`. NEVER rewrite asset URLs at request time: the Turbopack runtime
  matches chunks by stripping its build-time base path from script URLs.
- `app/layout.tsx` patches `history.pushState/replaceState` inside iframes (Next's post-hydration
  replaceState throws SecurityError cross-origin; React 19 would unmount everything). Do not remove.
- Changing the widget means bumping `WIDGET_VERSION` in `app/mcp/server.ts`, and the user must
  disconnect / reconnect the connector in Claude (it caches the tool list with the old URI).
- Tunnel dev: `$env:BASE_URL = "https://<tunnel>"; npm run dev` (PowerShell); cloudflared, not free
  ngrok. Vercel Deployment Protection is intentionally OFF.
- SDK 1.30 reports zod schema violations as `isError` tool results (not JSON-RPC errors); our own
  input errors (inverted box, unparsable expression) are also `isError` results that name the field.

## Working rules

- Tool descriptions are the prompt Claude sees: what it computes, WHEN to use it, expression syntax
  (`x*y` not `xy`), and "never compute this yourself". Tune them from real conversations.
- Commit messages use stage prefixes (`[A] parse: ...`); one module (implementation + tests) per
  commit; `npm test` green at every commit. Use explicit paths with `git add`, never `git add -A`
  (review agents leave scratch tests under `lib/**/__probe__/`, which is gitignored).
- Commands: `npm run dev`, `npm test`, `npm run typecheck`, `npm run build`, `npm run smoke`.
  For a full gate run all of tsc, vitest and build.
- Reply to the user in Chinese. Keep code, comments, commit messages and paths in English; student
  facing strings (caveats, summaries, labels) are Chinese and live in `lib/labels.ts` / `classify.ts`.
