# vector-field-tool

[![CI](https://github.com/Qscxds/vector-field-tool/actions/workflows/ci.yml/badge.svg)](https://github.com/Qscxds/vector-field-tool/actions/workflows/ci.yml)

A vector field teaching tool for differential-equations courses. Live site: <https://tools.studycase.net>.
Repository: <https://github.com/Qscxds/vector-field-tool> (public).

It draws slope fields and phase portraits in the browser and, through an MCP endpoint, lets Claude
answer students' questions about differential equations by calling the same computation kernel.
Every number comes from deterministic code in `lib/core`; the AI only translates language to
parameters and results to explanations. The site is English by default; Chinese is one click away
(`?loc=zh`).

## What it does

- **Slope fields** for a first-order equation written as `dy/dt = g(t, y)` or as a differential form
  `M(t, y) dt + N(t, y) dy = 0` (the second draws undirected line elements), with constant solutions
  checked along whole lines and their stability, and direction-field singular points where M = N = 0.
- **Phase portraits** of a planar system `x' = f(x, y), y' = g(x, y)`: arrows, hover to preview the
  solution curve through a point, click to keep a trajectory (it extends by the solution's own rule
  to 20 times the entered range, never cut at the view edge).
- **Curve management** (a kept curve is a "solution curve" on a first-order picture and a
  "trajectory" on a phase plane; the buttons follow the picture): click a kept curve (within 8
  screen pixels; it highlights on hover) to remove it, `Undo` / Ctrl+Z for the last 20 add / remove /
  clear steps, "Clear …" for all, long press on touch. Every change is written into the link's
  `traj` parameter. At most 20 curves are kept (the same limit as a link); the page says so and
  refuses the 21st until one is removed.
- **Initial-value inputs**: enter `t₀, y₀` (first-order), `x₀, y₀` (system) or `x(t₀), x'(t₀)`
  (second-order) and press "Add …" to keep the curve through an exact point instead of clicking
  near it.
- **Solution queries**: pick a kept curve and ask for its value at `t = 2.5`, or for every point
  where it reaches `y = 0.5` (`x = …` too for a system, `x' = …` for a second-order equation).
  Each crossing is solved along the numerical solution by re-integration (in time for a system,
  along the curve's own parameter for a differential form), never by interpolating the drawn
  polyline; every hit carries an error estimate and is marked on the canvas. A target that is
  never reached says so, with where and why each direction (each side of the start, for a
  differential form) stopped (left the box, blew up, span ended); a periodic-looking solution says
  more crossings may exist beyond the integrated span.
- **Second-order equations** `x'' = F(t, x, x')` (t is the independent variable), entered as a full equation (`x'' + 0.5*x' + x = 0`) or
  as the right-hand side: reduced with `v = x'` to the planar system `x' = v, v' = F(t, x, v)` and analyzed as one; the phase plane is (x, x').
- **Time-series view** for planar systems and second-order equations: the kept curves' `x(t)`, `y(t)`
  (for a second-order equation `x(t)`, with an optional `x'(t)` overlay) against t, with a legend, its
  own t range (`tmin` / `tmax` in the link) and the query hits marked on the curves. A non-autonomous
  equation opens on it, an autonomous one on the phase plane (`view=phase|time` in the link). Equal
  scale is off there, with a persistent note; the curves are the same kept curves as the phase plane.
- **Equilibria with honest classification**: Jacobian, eigenvalues, trace/determinant class, and a
  caveat wherever the linearization cannot decide (purely imaginary eigenvalues are "center or weak
  spiral", never "center"; a near-zero determinant is "non-hyperbolic"; a repeated root decided within
  numerical error says so). Continua of equilibria and singular points of the field (where it is
  discontinuous) are reported as such, never as isolated equilibria.
- **Uniqueness-failure detection**: a constant solution such as `y = 0` of `dy/dt = sqrt(y)` is
  flagged where the Lipschitz condition fails, with the measured evidence.
- **Non-autonomous snapshots**: when `t` appears in a system, the picture is the field at one snapshot
  time; equilibria and stability are not claimed for a moving field.
- **Equation-type probes** for first-order equations: separable, autonomous, linear in y,
  homogeneous, Bernoulli (with a fitted rational exponent), exact, integrating factor in t or y — each
  with a verdict (consistent / borderline / inconsistent / untestable), the measured deviation and the
  threshold. "Numerically behaves like", never "is".
- **Exact equations** draw the implicit solution curves of the potential; a failed path-independence
  self-check is stated, never hidden.
- **Shareable links**: the whole state of the page lives in the URL (`/vector-field?...`), with a
  "Copy link" button; 20 presets grouped by chapter, each a link.
- **`/embed` for Google Sites** and other course pages: the same parameters, a compact top bar,
  `controls=0` to hide the form. Only this route sends `Content-Security-Policy: frame-ancestors *`.
- **PNG export** at 2x with a one-line footer (equation, entered and displayed ranges when they
  differ, snapshot time, origin).
- **Touch**: pinch to zoom, one-finger pan, tap to preview, long press to keep, double tap to reset.
- **Report a problem**: a link at the bottom of the page (and of `/embed`) opens a new GitHub issue
  prefilled with the page's link, the browser's name and three prompt lines. Nothing is tracked.

## Notation conventions (the professor's)

- A first-order equation is always `dy/dt = g(t, y)` or `M(t, y) dt + N(t, y) dy = 0`. The
  independent variable is `t`; writing `x` in a first-order equation is rejected with a hint. Enter
  only the right-hand side (a pasted `dy/dt =` is rejected with a hint). Students never see `dy/dx`.
- A planar system is `x' = f(x, y), y' = g(x, y)`; `t` is time and may appear in f or g.
- A second-order equation uses `x`, `x'`, `x''` and `t`, with `x''` appearing linearly.
- Expressions: write the product (`x*y`, `t*y`, never `xy`), powers with `^`; functions
  `sin cos tan asin acos atan atan2 sinh cosh tanh exp log log10 sqrt abs sign pow min max floor
  ceil round`, constants `pi` and `e`, other constants through `params`, piecewise with
  `x > 0 ? 1 : -1`. Note that a fractional power of a negative number is undefined here
  (`y^(2/3)` is NaN for y < 0; write `abs(y)^(2/3)` for the real branch).

## Local development

Requires Node >= 20.9 (24 recommended; Vercel's default).

```bash
npm install
npm run dev          # http://localhost:3000 (the app is at /vector-field)
npm test             # vitest: 956 tests (954 pass, 2 marked it.fails with derived expectations)
npm run typecheck    # tsc --noEmit
npm run build        # production build
npm run smoke        # HTTP smoke test against a running server (default http://localhost:3000/mcp)
npm run mock-host    # two-origin mock MCP Apps host for exercising the widget without Claude
```

GitHub Actions (`.github/workflows/ci.yml`) runs `npm ci`, the typecheck, the tests and the build
on Node 24 for every push to `main` and every pull request; it never deploys (Vercel builds `main`
on its own). The badge at the top of this file shows the last run.

The smoke test checks `initialize`, `tools/list`, one call per tool, the error shape of invalid
input, the widget resource's HTML and CSP, and that GET returns 405. Start a server in another
terminal first (`npm run dev` or `npm run build && npm start`). Without `BASE_URL` the widget's
asset URLs are relative and the "absolute asset URLs" check reports SKIP.

A manual tool call:

```bash
curl -s -X POST http://localhost:3000/mcp -H "content-type: application/json" -H "accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"analyze_first_order","arguments":{"M":"2*t*y","N":"t^2 + y^2","xMin":-2,"xMax":2,"yMin":-2,"yMax":2}}}'
```

The response is SSE (`event: message` + `data: {...}`). The endpoint is stateless: no session header.

## Deployment (Vercel)

1. Import the repository; the framework is detected as Next.js. The first deployment (no custom
   domain yet) needs no environment variable.
2. Turn **Deployment Protection off** (Settings → Deployment Protection → Vercel Authentication →
   Disabled). Intentional: there are no secrets and no user data, and Claude must reach the endpoint.
3. Try `https://<project>.vercel.app/mcp` in Claude first.
4. **After binding a custom domain, set `BASE_URL=https://tools.<your-domain>` in the project's
   Production environment and redeploy.** Without it nothing fails visibly, but the widget inside
   Claude is blank: `base-url.ts` feeds the public origin to Next's `assetPrefix`, to the widget's
   `<base href>` and to its CSP, and Vercel's own variables still point at `xxx.vercel.app`. The
   build and function logs print a `[base-url] BASE_URL is not set ...` warning in that case.
5. If the domain sits behind Cloudflare, use a DNS-only record (no proxy), so the MCP responses and
   the widget assets are served unchanged.
6. Point the Claude connector at `https://tools.<your-domain>/mcp` and reconnect.

Pushing to `main` deploys production. Afterwards run `npm run smoke -- https://tools.<your-domain>/mcp`.

## Connecting Claude (MCP)

Claude (web or desktop) → Settings → Connectors → Add custom connector: URL
`https://tools.studycase.net/mcp`, authentication None. (Team/Enterprise plans: only an Owner can add
one; the Free plan allows one connector.) For local testing Claude connects from Anthropic's cloud,
so run a public tunnel with cloudflared (not free ngrok, whose warning page blanks the widget):

```bash
cloudflared tunnel --url http://localhost:3000
$env:BASE_URL = "https://xxxx.trycloudflare.com"; npm run dev     # PowerShell; restart when the tunnel URL changes
```

- Tools: `analyze_system`, `trace_trajectory` (planar systems only), `sample_field`,
  `analyze_first_order` (`expr` or `M` + `N`; the t range is `tMin` / `tMax`), `analyze_second_order`
  (`equation`; the x' range is `xpMin` / `xpMax`), `query_solution` (an initial point plus a target
  `{ kind: "t" | "x" | "y", value }`: the numerical solution's value at a time, or every time it
  reaches a coordinate value, with error estimates and the stop status of both directions; in mode
  `second` the kind `y` means the velocity x' and the result names it x'), plus `ping` for the
  transport. Every description starts with the call-first rule ("call this tool before
  answering"); `query_solution`'s says that "value at a time" and "when does it reach" questions
  must call it and are never answered from a closed form. Every Scene in `structuredContent`
  carries `axes` (what the kernel's `.x` / `.y` / `t` fields mean on that picture) and every
  description tells the model to relay the text summary, never the kernel names.
- Locale rule: `locale` is optional and defaults to `en`; the description asks the model for `zh`
  when the student writes in Chinese. Error messages (parameter bounds, unparsable expressions, the
  2 s budget, the rate limit) are always English: they are for the model.
- Widget version: changing the widget means bumping `WIDGET_VERSION` in `app/mcp/server.ts`, and
  every user must **disconnect and reconnect the connector** in Claude (it caches the tool list with
  the old resource URI; the widget silently goes blank otherwise). The current version is `p-2`.
- Say "use analyze_system on x' = x - x*y, y' = x*y - y" to see the phase-portrait widget; "dy/dt = y,
  y(0) = 1, what is y(2)?" should call `query_solution` and mark the hit in the widget; "use ping
  with hello" tests the transport alone. Inside the widget a kept trajectory can be removed by
  clicking it and restored with `Undo` / Ctrl+Z, as on the web page.

### The three sandbox pitfalls

Claude renders the widget on its own sandbox origin, so the page runs under someone else's origin.
Each of these blanks the widget silently:

1. Asset URLs and the Turbopack prefix must both be our public origin (`assetPrefix` from
   `BASE_URL`; never rewrite URLs at request time).
2. `<base href>` needs the CSP to allow it: the resource declares its origin in
   `_meta.ui.csp.baseUriDomains`.
3. `history.replaceState` throws a SecurityError inside the iframe; `app/layout.tsx` swallows it
   with an inline script that runs only when embedded. Do not remove it.

Local computation in the sandbox needs no `unsafe-eval`: mathjs `compile()` builds closures.

### Cost caps of the public endpoint

`/mcp` is public and unauthenticated. Per-request caps replace a distributed rate limiter: density
<= 60, tSpan <= 1000, box edges <= 1e6, expressions <= 200 characters, 20000 integration steps per
direction, a 2 s wall-clock budget per call (returned as a readable `isError`), and an in-process
240 calls/min speed bump per instance (best effort on serverless).

## Troubleshooting

- **Widget missing or blank**: `BASE_URL` set and equal to the connector's origin? Reconnect after a
  widget version bump. Then Claude desktop → Help → Troubleshooting → Enable Developer Mode,
  Ctrl+Shift+I on the inner iframe. Also: `/_next/*` 403, free ngrok, Deployment Protection on.
  `ping` tells the transport apart from rendering.
- **Picture but no zoom / hover, with a "local recomputation unavailable" note**: expression
  compilation failed in the sandbox; the server's static picture is still correct.
- **`widget fetch failed for <url>`**: the server cannot reach its own public origin; check the
  tunnel, `x-forwarded-host`, `BASE_URL`.
- **A tool returns `isError`**: the text names the parameter or expression (`xy` → write `x*y`; `x`
  in a first-order equation → write `t`; a pasted `dy/dt =` → right-hand side only). Schema
  violations are `isError` results too, never a 500.

## Development notes

`docs/*.md` and `CLAUDE.md` are internal working notes and are kept in Chinese (decisions, open
questions, review rounds; code, comments and commit messages are English). Architecture in one line: one pure computation kernel
(`lib/core`, `lib/render`), one data contract (`lib/scene.ts`), two shells (the web page and the
MCP Apps widget) sharing the same components and interaction hook; all user-facing text lives in
`lib/labels.ts` and `lib/site-text.ts` in both languages.

The consolidated [engineering record](docs/ENGINEERING-RECORD.md) contains the current architecture,
the latest fixes and validation, and the full text of all 16 earlier stage records with source hashes.

## License

No license file yet (the repository is public, but no license has been chosen).
