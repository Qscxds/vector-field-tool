@AGENTS.md

# vector-field-tool

Teaching tool for differential-equations courses. Claude answers students' questions by calling MCP
tools; every number comes from deterministic code in `lib/core`. The AI only translates language to
parameters and results to explanations. README.md (Chinese) has run / tunnel / deploy steps.
`docs/NIGHT-*.md` record the 2026-09-02 overnight build (stages A-E); `docs/FG-*.md` the 2026-09-03
S/F/G round (sandbox spike, differential forms, bilingual labels, interaction); `docs/H-*.md` the
H round (deploy readiness, cost caps, and the math-first re-decisions listed below).
Repository: <https://github.com/Qscxds/vector-field-tool>.

## Module map

- `lib/core/` pure math kernel: `parse` (mathjs AST whitelist -> compiled system, eval never throws;
  `variables: "xy" | "ty"` — in "ty" mode t is the horizontal coordinate and x is rejected with
  ParseError code `x_in_first_order`; a pasted left-hand side gives `lhs_in_expression` with a
  mode-aware message ("dy/dt =" in "ty", "x' =" / "y' =" in "xy"), checked on the RAW g / M / N by
  `assertNoLeftHandSide` before slope-field wraps them; a bare "y =" followed by "?" is a
  comparison typo and gets a "write ==" hint instead),
  `field` (grid sampling), `integrate` (RK4 + adaptive Dormand-Prince, shared stop rules; blow-up
  is decided by the POSITION only, never by speed; 'reached_equilibrium' is relative to the
  problem's reference speed; the adaptive step is capped at h*L <= 1 so sinks are actually
  reached; box exits and arc-length stops are cut exactly; statuses completed / left_box /
  reached_equilibrium / blew_up / singular / domain_edge / arc_length / max_steps; optional
  `checkpoint` for wall-clock budgets), `jacobian` (+ `jacobianWithError`), `classify` (trace/det
  classification; `caveat` is a key: center / nonHyperbolic / notFinite / repeatedRoot; optional
  `zeroFloor` = the numerical error of the Jacobian, never a box-wide statistic), `equilibria`
  (seeded damped Newton + Marquardt-scaled LM, difference step shrinking with the Newton step; a
  continuum needs a count signal AND a shape signal AND connectedness (the field vanishes between
  neighbours), else `multiple_non_hyperbolic`), `slope-field` (first-order base: `FirstOrderSpec` explicit `dy/dt = g(t, y)`
  or differential `M dt + N dy = 0`; `toSystem` returns a SystemSpec with `variables: "ty"` (the
  student's t is the horizontal coordinate x of the reduced planar system), constant solutions
  checked along whole lines,
  singular points M = N = 0), `detect-form` (numerical probes for the eight textbook forms, each
  returned with a verdict consistent / borderline / inconsistent / untestable, the measured
  relative deviation, the threshold, sample counts; Bernoulli exponents snap to fractions with
  denominator <= 6 when the identity still holds), `exact` (potential by two-path Simpson with a
  path-independence check whose failure is reported, level values).
- `lib/render/` pure geometry: `viewport` (`fitViewport` equal-scale by default, `equalScale: false`
  returns the entered box unchanged so it fills the canvas; cursor-anchored `zoomAt`, `panBy`,
  `resetViewport`), `arrows`, `ticks`, `axis-names` (where the axis names go without covering the
  tick numbers), `color`, `contours` (marching squares).
- `lib/scene.ts` the data contract: every visual tool returns a `Scene` as structuredContent (with
  `locale`, `system`, `firstOrder.spec` so clients can recompute); the widget and the web shell only
  ever consume a Scene.
- `lib/labels.ts` ALL student/user-facing text as keyed tables `LABELS.zh` / `LABELS.en` with an
  identical key set (tested), `labels(locale)`, `fill()`, `localeFromLanguageTag()`, number
  formatting. English is American spelling. The kernel returns keys; presentation looks them up.
  Placeholder convention `{hv}`: the range templates (`shownRange*`, `featuresBox`, `xRangeError`,
  `equalScale`) take `{hv}`, the student-facing name of the horizontal coordinate: "x" for a planar
  system, "t" for a first-order scene (`system.variables === "ty"`); both shells fill it via
  `horizontalName()`.
- `lib/labels-trajectory.ts` the mode-aware "last trajectory" text shared by both shells:
  planar = direction + tEnd; explicit first order = direction + the END POINT's t (tEnd is the
  parameter of the reduced system, not the t coordinate); differential form = the two sides by
  status only (no natural direction, no t number).
- `lib/interactive.ts` pure helpers for the interactive shells: `computeFeatures` for a box,
  `featuresBoxFor` (the features-box rule below), `tracePreview` (hover: fixed ON-SCREEN length,
  2 canvas diagonals, steps only a safety cap) and `traceFixed` (click: stops at 20x the original
  problem domain, never at the view edge).
- `components/VectorFieldCanvas.tsx` draws a Scene on a base + overlay canvas; data props only,
  never calls lib/core; draws the axis names (t or x from `scene.system.variables`, and y);
  reports pointer/wheel as world/screen coordinates.
  `components/useInteractiveScene.ts` the interaction state shared by both shells (home box,
  viewport with `equalScale` (default true; false fills the canvas with the entered box and the
  web shell shows a persistent not-to-scale warning), resampled field, debounced features, rAF
  hover preview, click-to-keep). Features-box rule: at the home view (not zoomed or panned) the
  features are computed for the ENTERED range in both equal-scale modes, so the toggle or a canvas
  of another aspect ratio never changes what is listed (the equal-scale margin only carries
  arrows); after a zoom or pan they are computed for the visible box. `Scene.featuresBox` says which.
- `base-url.ts` public origin: explicit `BASE_URL` beats every Vercel variable (tested); Vercel
  production without it warns at startup (custom domains need it or the widget is blank).
- `app/mcp/route.ts` the /mcp endpoint (do not touch casually); `app/mcp/server.ts` widget
  resource + ping + `WIDGET_VERSION`; `app/mcp/tools.ts` the four analysis tools (`locale` is
  REQUIRED; analyze_first_order keeps the parameter names xMin/xMax but they are the t range, and
  its expressions use t and y only); `app/mcp/budget.ts` (2 s wall-clock budget per call via kernel checkpoints) and
  `app/mcp/rate-limit.ts` (per-process sliding window, best effort only on serverless).
- `app/widget/page.tsx` MCP Apps widget (compiles the Scene's equation locally, falls back to the
  static picture if compiling is blocked); `app/vector-field/` the web shell; `app/page.tsx` home.
- `scripts/smoke.mjs` HTTP smoke test against a running server (`npm run smoke`).

## Architecture rules (long-lived, do not change)

1. `lib/core/` and `lib/render/` are pure: no React, Next.js or MCP imports, no `Math.random`, and
   no clock (budgets are injected as a `checkpoint` callback). Enforced by `lib/architecture.test.ts`.
2. Rendering components only receive data props and do not know who is calling them.
3. The web shell and the MCP shell share the same core, the same components and the same hook.
   Never write a second copy.
4. Stateless: no database, no accounts, no login, no secrets. One McpServer per request.
5. Honesty over confidence: purely imaginary pairs are `center_or_weak_spiral` with a caveat, never
   a center; det ~ 0 is `non_hyperbolic` with a caveat; a repeated root decided inside the tolerance
   band carries `repeatedRoot`; detected equation forms are "numerically behaves like", never "is",
   always with the measured deviation and a caveat, and borderline cases are said to be borderline;
   a failed self-check (path independence of the potential) is reported, never hidden. Caveats are
   full sentences in both languages, read to students verbatim.
6. Mathematical fidelity first: no conclusion may depend on the view, on a parameter, or on the
   luck of sampling. Speed is not evidence of blow-up; a preview's length is measured on screen;
   a trajectory extends by the solution's rule, not the view's; verdicts carry deviations, not
   just yes/no; exact rationals are reported when they fit; failures are stated.
7. Test expectations come from derivation, never from running the code. A failing test is never
   fixed by loosening a tolerance; record it in open-questions and mark it instead.
8. Every user-visible string lives in `lib/labels.ts` (or `detect-form.ts` / `NO_FORM_NOTE` for the
   form evidence) in BOTH languages. No hard-coded Chinese or English in tools, pages or components.

## Stack decisions

- No mcp-handler. `@modelcontextprotocol/sdk` 1.x + `WebStandardStreamableHTTPServerTransport`
  directly, because `@modelcontextprotocol/ext-apps` only supports sdk 1.x (ext-apps#702 open).
- `/mcp` accepts POST only; GET and DELETE return 405. Unknown `mcp-protocol-version` headers
  (Claude sends 2026-07-28) are downgraded, not rejected. One log line per request.
- Public endpoint cost control = hard caps per request, not a distributed limiter: parameter bounds
  (density <= 60, tSpan <= 1000, box <= 1e6, expressions <= 200 chars for f/g/expr/M/N), a 2 s
  budget per call, and an in-process 240/min speed bump.
- Widget: Next page self-fetched at resource-read time with `<base href>` injected (allowed via
  `csp.baseUriDomains`). Public origin from `base-url.ts` feeds `assetPrefix`. NEVER rewrite asset
  URLs at request time: the Turbopack runtime matches chunks by stripping its build-time base path
  from script URLs. On Vercel with a custom domain, BASE_URL MUST be set and the project redeployed.
- `app/layout.tsx` patches `history.pushState/replaceState` inside iframes (Next's post-hydration
  replaceState throws SecurityError cross-origin; React 19 would unmount everything). Do not remove.
- Changing the widget means bumping `WIDGET_VERSION` in `app/mcp/server.ts`, and the user must
  disconnect / reconnect the connector in Claude (it caches the tool list with the old URI).
- Local compute in the sandbox works WITHOUT `unsafe-eval`: mathjs `compile()` builds closures, no
  code strings (S spike, `docs/FG-decisions.md`). `new Function` is blocked there; never depend on it.
- Tools take `locale` (`zh` | `en`, REQUIRED): the model sets `zh` when the student writes Chinese.
  The web shell defaults from `navigator.language` and keeps the choice in component state (no
  localStorage). The widget follows `scene.locale`.
- Tunnel dev: `$env:BASE_URL = "https://<tunnel>"; npm run dev` (PowerShell); cloudflared, not free
  ngrok. Vercel Deployment Protection is intentionally OFF.
- SDK 1.30 reports zod schema violations as `isError` tool results (not JSON-RPC errors); our own
  input errors (inverted box, unparsable expression, budget, rate limit) are also `isError` results.

## Working rules

- Tool descriptions are the prompt Claude sees: what it computes, WHEN to use it, expression syntax
  (`x*y` not `xy`), the locale rule, and "never compute this yourself". Tune them from real conversations.
- Notation for students (the professor's convention): a first-order equation is always written
  `dy/dt = g(t, y)` or `M(t, y) dt + N(t, y) dy = 0`; a planar system is `x' = f(x, y), y' = g(x, y)`.
  Never mix the two in one sentence, and never show a student `dy/dx`.
- Commit messages use stage prefixes (`[H2] integrate: ...`, `[H2-fix] ...`); one module
  (implementation + tests) per commit; `npm test` green at every commit. Use explicit paths with
  `git add`, never `git add -A` (review agents leave scratch tests under `lib/**/__probe__/`, which
  is gitignored and excluded from tsconfig / the vitest gate).
- Commands: `npm run dev`, `npm test`, `npm run typecheck`, `npm run build`, `npm run smoke`.
  For a full gate run all of tsc, vitest and build.
- Adversarial reviews run on a frozen tag, never on a moving main. The H round's review (6 lenses,
  3 refuters per finding) confirmed 14/14 verified findings; all are fixed in `[H2-fix]` commits
  with derived tests. Every relative tolerance in the kernel is relative to magnitudes actually
  measured (never to an absolute 1 or 1e-8): review items C6, C7, C8 were all absolute floors.
- Reply to the user in Chinese. Keep code, comments, commit messages and paths in English.
