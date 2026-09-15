@AGENTS.md

# vector-field-tool

Teaching tool for differential-equations courses. Claude answers students' questions by calling MCP
tools; every number comes from deterministic code in `lib/core`. The AI only translates language to
parameters and results to explanations. README.md (English, public-facing) has run / tunnel /
deploy steps; the docs/ notes are Chinese.
`docs/NIGHT-*.md` record the 2026-09-02 overnight build (stages A-E); `docs/FG-*.md` the 2026-09-03
S/F/G round (sandbox spike, differential forms, bilingual labels, interaction); `docs/H-*.md` the
H round (deploy readiness, cost caps, and the math-first re-decisions listed below);
`docs/IJKL-*.md` the 2026-09-08/09 I-L round (dy/dt notation and the equal-scale toggle; the
equilibria / uniqueness / non-autonomous / second-order math with three review-and-fix rounds; the
website: URL state, /embed, /help, presets, touch gestures, PNG export, metadata; the call-first
rule in every tool description and widget l-1); `docs/MNO-*.md` the 2026-09-09 M-O round (English
by default with the language only from the URL, trimmed copy with folded caveats and the
reorganized /help, the kernel freeze below; trajectory removal / undo / long-press delete,
initial-value inputs, solution queries and the `query_solution` tool; widget o-1).
Repository: <https://github.com/Qscxds/vector-field-tool>.

The consolidated current engineering record is `docs/ENGINEERING-RECORD.md`: architecture, the
2026-09-10 fixes and validation, and all 16 original docs in full. Historical entries retain their
then-current status; use the current section for superseding decisions. Widget version is now p-1 (round P).

## Module map

- `lib/core/` pure math kernel: `parse` (mathjs AST whitelist -> compiled system, eval never throws;
  `variables: "xy" | "ty"` — in "ty" mode t is the horizontal coordinate and x is rejected with
  ParseError code `x_in_first_order`; a pasted left-hand side gives `lhs_in_expression` with a
  mode-aware message ("dy/dt =" in "ty", "x' =" / "y' =" in "xy"), checked on the RAW g / M / N by
  `assertNoLeftHandSide` before slope-field wraps them; a bare "y =" followed by "?" is a
  comparison typo and gets a "write ==" hint instead; `roundingBound` is the running rounding-error
  bound of each component from the expression's OWN terms plus an underflow flag, the yardstick for
  "this residual is zero as far as floating point can tell"),
  `field` (grid sampling), `integrate` (RK4 + adaptive Dormand-Prince, shared stop rules; blow-up
  is decided by the POSITION only, never by speed; 'reached_equilibrium' applies only to autonomous
  systems (including the ty coordinate mode), relative to the
  problem's reference speed; the adaptive step is capped at h*L <= 1 so sinks are actually
  reached; box exits and arc-length stops are cut exactly; statuses completed / left_box /
  reached_equilibrium / blew_up / singular / domain_edge / arc_length / max_steps; optional
  `checkpoint` for wall-clock budgets), `jacobian` (+ `jacobianWithError`), `classify` (trace/det
  classification; `caveat` is a key: center / nonHyperbolic / notFinite / repeatedRoot; optional
  `zeroFloor` = the numerical error of the Jacobian, never a box-wide statistic), `equilibria`
  (damped Newton on the row-equilibrated Jacobian + truncated pseudo-inverse step when it is
  numerically rank-deficient, difference step shrinking with the Newton step; seeded from a grid,
  the |F| minima of a scan, the domain's edge (bisection) and a sign-change quadtree, every cap
  reported in `seeding`; a root is accepted
  by a LOCAL test only: Newton step below the location tolerance (1e-13 x box, never below
  8 eps |p|), or residual at the rounding floor of the expression's own terms, never a residual
  tolerance from the box and NEVER an extrapolated geometric tail of an exhausted run; a
  vanishing test (end-to-end decrease of |F(p + d e) - F(p)| over offsets that resolve the point)
  drops points where the field is discontinuous into `singularPoints`; an underflow plateau
  (exp(x) at x < -745) is reported once as `underflowPlateau`, a field exactly 0 on >= 25% of the
  scan as `region_of_equilibria`; every point carries its `resolution`; duplicates merge within
  the resolution each run achieved, never a fraction of the box; a
  continuum needs a count signal AND a shape signal AND connectedness (the field vanishes between
  neighbours), else `multiple_non_hyperbolic`; classification uses PER-ENTRY Jacobian errors from
  a step relative to the box and adapted to the function (no absolute 1e-6), and
  a repeated root decided within error always carries `repeatedRoot`), `slope-field` (first-order base: `FirstOrderSpec` explicit `dy/dt = g(t, y)`
  or differential `M dt + N dy = 0`; `toSystem` returns a SystemSpec with `variables: "ty"` (the
  student's t is the horizontal coordinate x of the reduced planar system), constant solutions
  checked along whole lines,
  singular points M = N = 0), `detect-form` (numerical probes for the eight textbook forms, each
  returned with a verdict consistent / borderline / inconsistent / untestable, the measured
  relative deviation, the threshold, sample counts; Bernoulli exponents snap to fractions with
  denominator <= 6 when the identity still holds), `exact` (potential by two-path Simpson with a
  path-independence check whose failure is reported, level values), `query` (`querySolution`:
  both directions integrated under the caller's stop box; a time target is ABSOLUTE and answered
  by re-integrating from the start to exactly t*, an unreachable t* is `stopped_before_target`
  with the leg's status saying why; a coordinate target x = c / y = c brackets every sign change
  of the stored polyline and solves the crossing time by Brent IN TIME, every trial re-integrated
  from the accepted bracket-left state, never interpolated; errors are ESTIMATES:
  `TOLERANCE_SAFETY` (10) x (atol + rtol |p|) plus |dp/dt| x the final bracket width;
  `timeUncertainty(hit)` = max(bracket, position error / speed) is what the shells display; the
  note is always a key: ok / not_reached_in_span / stopped_before_target /
  possibly_more_beyond_span (>= 3 hits in a COMPLETED direction) / target_is_start).
- `lib/render/` pure geometry: `viewport` (`fitViewport` equal-scale by default, `equalScale: false`
  returns the entered box unchanged so it fills the canvas; cursor-anchored `zoomAt`, `panBy`,
  `resetViewport`), `arrows`, `ticks`, `axis-names` (where the axis names go without covering the
  tick numbers), `color`, `contours` (marching squares).
- `lib/scene.ts` the data contract: every visual tool returns a `Scene` as structuredContent (with
  `locale`, `system`, `firstOrder.spec` for analysis and `firstOrderSpec` for queries so clients can
  recompute without fabricating an analysis); the widget and the web shell only
  ever consume a Scene.
- `lib/labels.ts` ALL student/user-facing text as keyed tables `LABELS.zh` / `LABELS.en` with an
  identical key set (tested), `labels(locale)`, `fill()`, number formatting
  (`localeFromLanguageTag()` is still exported and tested but no shell uses it since round M:
  the language never comes from the browser). English is American spelling. The kernel returns keys; presentation looks them up.
  Placeholder convention `{hv}`: the range templates (`shownRange*`, `featuresBox` /
  `featuresBoxDetail`, `xRangeError`, `equalScaleDetail`) take `{hv}`, the student-facing name of the horizontal coordinate: "x" for a planar
  system, "t" for a first-order scene (`system.variables === "ty"`); both shells fill it via
  `horizontalName()`.
- `lib/labels-trajectory.ts` the mode-aware "last trajectory" text shared by both shells:
  planar = direction + tEnd; explicit first order = direction + the END POINT's t (tEnd is the
  parameter of the reduced system, not the t coordinate); differential form = the two sides by
  status only (no natural direction, no t number). Since round M the shells FOLD long caveats
  (`Folded` = short line + full detail behind an info toggle: `equilibriumDetail`,
  `constantSolutionFolded`, `timeDependentFolded`, `formFolded`, `formatEigenvalues` for the
  "±0.9682i" shorthand); folding is display only, the Scene and the tool summaries keep every word.
- `lib/labels-query.ts` the query wording shared by the tool summary and the widget
  (`queryTargetText`, `queryLines` at 6 fixed digits, `queryNoteText` for the note keys).
- `lib/interactive.ts` pure helpers for the interactive shells: `computeFeatures` for a box,
  `featuresBoxFor` (the features-box rule below), `tracePreview` (hover: fixed ON-SCREEN length,
  2 canvas diagonals, steps only a safety cap) and `traceFixed` (click: stops at 20x the original
  problem domain, never at the view edge).
- `lib/trajectory-store.ts` the kept trajectories as a pure store: the STARTS are the single source
  of truth, curves are derived by an injected trace; add / delete / clear with an undo history of
  `HISTORY_LIMIT` 20; a system change or a new seed array resets to the seeds, a `retraceKey`
  change (the web shell passes the snapshot t) re-traces the CURRENT starts, so a cleared start never
  comes back (the N.1 bug).
- `lib/trajectory-hit.ts` point-to-polyline distance in SCREEN pixels (`HIT_THRESHOLD_PX` 8,
  zoom-independent), `nearestFixedTrajectory`, `clickAction` (a click within the threshold removes
  that pair, otherwise it adds; long press and mouse share this one rule).
- `lib/undo-key.ts` `isUndoKey` (Ctrl/Cmd+Z outside inputs, selects, textareas and contenteditable).
- `lib/initial-value.ts` `parseInitialValue` / `parseDecimal` for the initial-value inputs (finite
  decimals within `MAX_ABS_VALUE` from url-state so an added start always round-trips through
  `traj`).
- `lib/query-panel.ts` pure helpers of the web shell's query panel: `queryKindsFor` (t / y on a
  first-order picture, t / x / y on a planar one), `kernelQueryKind` (the student's t on a
  first-order picture is the coordinate kind "x", the time kind exists only on planar pictures),
  `parseQueryValue`, `errorDigits` / `roundToError` (2 significant digits of the error),
  `queryHitText`, `trajectoryOptionText`, `selectedTrajectoryIndex` (the newest addition is
  preselected; a click cannot both select and remove a curve).
- `components/VectorFieldCanvas.tsx` draws a Scene on a base + overlay canvas; data props only,
  never calls lib/core; draws the axis names (t or x from `scene.system.variables`, and y);
  reports pointer/wheel as world/screen coordinates. Touch pointers go through `lib/gestures.ts`
  (pure state machine, every event carries its time: pinch = distance ratio -> `onWheelZoom` about
  the midpoint, one-finger pan, tap -> hover preview that stays, double tap (300 ms / 30 px) ->
  reset, long press (500 ms, < 8 px) -> keep); mouse and pen keep the original handlers.
  `components/drawScene.ts` is the base-layer drawing shared with `components/exportScenePng.ts`
  (2x PNG, white footer strip with the one-line text of `lib/export-footer.ts`: equation, displayed
  range at 3 significant digits, `t = t0` when time-dependent, origin; canvas drawing is browser
  only and not unit-tested, the footer text and file name are; the footer prints "entered ... ·
  shown ..." when the two ranges differ; query hits are drawn as a filled diamond with a white halo
  and a coordinate label). `components/Info.tsx` the one disclosure control of both shells: `Info`
  (a real "ⓘ" button with aria-expanded / aria-controls, Escape closes, 44 px hit area by negative
  margins, panel is a block span so it is valid inside <p> / <li>) and `FoldedLine`; display only,
  whatever it hides is still in the Scene and the tool summary word for word.
  `components/useInteractiveScene.ts` the interaction state shared by both shells (home box,
  viewport with `equalScale` (default true; false fills the canvas with the entered box and the
  web shell shows a persistent not-to-scale warning), resampled field, debounced features, rAF
  hover preview, click-to-keep / click-to-remove through `lib/trajectory-store` and
  `lib/trajectory-hit`; inputs `retraceKey`, `query` + `queryStart` (the query is kept on the scene
  only while a kept trajectory still starts there), `secondOrder` pass-through; outputs `highlight`,
  `cursor`, `addTrajectory`, `deleteTrajectory`, `clearTrajectories`, `undo`, `canUndo`). Features-box rule: at the home view (not zoomed or panned) the
  features are computed for the ENTERED range in both equal-scale modes, so the toggle or a canvas
  of another aspect ratio never changes what is listed (the equal-scale margin only carries
  arrows); after a zoom or pan they are computed for the visible box. `Scene.featuresBox` says which.
- `base-url.ts` public origin: explicit `BASE_URL` beats every Vercel variable (tested); Vercel
  production without it warns at startup (custom domains need it or the widget is blank).
- `app/mcp/route.ts` the /mcp endpoint (do not touch casually); `app/mcp/server.ts` widget
  resource + ping + `WIDGET_VERSION` (p-1 since round P); `app/mcp/tools.ts` the six analysis tools
  (`locale` is optional and defaults to en since round M; analyze_first_order keeps the parameter
  names xMin/xMax but they are the t range, and its expressions use t and y only; `query_solution`
  since round N: mode first / diff / system / second, t0 for first-order pictures; for planar ones x0,
  y0 and t0 = the START TIME (default 0, no alias since round P); for second x0 = x(t0), xp0 = x'(t0),
  xpMin/xpMax for the x' range, `target { kind: "t" | "x" | "y", value }` (kind y is the velocity x' in
  mode second), tSpan default 20 max 1000,
  stop box 20x the view like the shells, Scene kind "query_solution" + `Scene.query`; its description
  says value-at-time / time-of-value questions must call it, never a closed form); `app/mcp/budget.ts` (2 s wall-clock budget per call via kernel checkpoints) and
  `app/mcp/rate-limit.ts` (per-process sliding window, best effort only on serverless).
- `app/widget/page.tsx` MCP Apps widget (compiles the Scene's equation locally, falls back to the
  static picture if compiling is blocked); `app/page.tsx` home.
- `lib/url-state.ts` the web shell's URL state (pure): `AppState` (mode first / diff / system /
  second, g f M N eq, the ENTERED box, `locale | null` = no loc in the link (English), equalScale, density,
  arrowMode, snapshotT, trajectoryStarts) with `DEFAULT_STATE`; `encodeState` (short names,
  defaults omitted, readable parentheses; tmin/tmax for first-order pictures, xmin/xmax for planar
  ones); `decodeState(query, fallback)` never throws: 4096-char query cap, 200-char expressions
  validated through the SAME parser whitelist as the page (compileScalar "ty" / "xy",
  reduceSecondOrder), finite bounded numbers, per-field fallback with reason keys rendered by the
  shell; `buildShareUrl`, `queryFromSearchParams`. A link is a public attack surface: no relaxation.
- `components/VectorFieldApp.tsx` the shared application body of `app/vector-field/page.tsx` and
  `app/embed/page.tsx` (both thin async server components that decode `searchParams`, so the
  first render shows the linked state). Props `{ initial, embed?, controls?, urlProblems? }`.
  Keeps the address bar in sync (history.replaceState, 500 ms debounce, only when the state
  compiles, never on hover, entered range not the zoomed view; not in embed mode), "Copy link"
  with a selected read-only fallback, the ignored-parameters notice, a `<select>` of presets with
  one `<optgroup>` per chapter, fixed trajectory starts passed to the hook as
  `initialTrajectoryStarts` (the hook exposes `trajectoryStarts`), a vf- prefixed `<style>` layout
  (two columns, one column below 800 px) and a container-sized canvas (ResizeObserver, width
  clamped 300..900, height = round(width * 0.72)).
- `app/embed/` the embeddable route for the course site (Google Sites iframes): same parameters,
  compact top bar (language + "Open full page"), `controls=0` hides the form, robots noindex.
  HEADERS RULE: `next.config.ts` sends `Content-Security-Policy: frame-ancestors *` for source
  `/embed` ONLY. Never add X-Frame-Options or frame-ancestors to any other route: `/widget` is
  rendered inside the MCP host sandbox and any such header blanks it.
- Site pages: `app/page.tsx` (home) and `app/help/page.tsx` are thin server components reading
  `?loc=` (`app/site-locale.ts`) and rendering `components/HomeContent.tsx` /
  `components/HelpContent.tsx` inside `components/SitePage.tsx` (language toggle in component
  state only, footer, copy button with a read-only fallback). ALL their copy lives in
  `lib/site-text.ts` (zh / en, identical key structure, tested), never in the components; the
  help page's function list is `ALLOWED_FUNCTIONS` from the parser, never retyped. Metadata:
  `app/layout.tsx` (metadataBase from `base-url.ts`, title template, OG / twitter defaults),
  per-page `metadata` exports (`/embed` is noindex with no OG card), `app/opengraph-image.tsx`
  (next/og, drawn at build time), `app/icon.svg`, `app/robots.ts` (disallow /embed, /mcp),
  `app/sitemap.ts`.
- `app/vector-field/presets.ts` the preset library: `PRESET_GROUPS` (chapters) and `PRESETS` of
  `{ id, group, mode: AppMode, name, note, expressions, box, starts? }` with hand-derived honest
  notes; `presetState`, `presetUrl` (a shareable link per preset), `presetsByGroup`. Tests check
  compilation per mode, both languages, unique ids, link round trips and derived key features.
- `scripts/smoke.mjs` HTTP smoke test against a running server (`npm run smoke`; 20 checks, 7
  tools, the widget URI version). `scripts/mock-host/` (`serve.mjs`, `host.html`, `sandbox.html`)
  the two-origin mock MCP Apps host (`npm run mock-host -- --mcp <url>`): the sandbox page is served
  by URL on its own origin with the CSP built from `_meta.ui.csp`, no eval; scenarios for ping and
  the visual tools (analyze_first_order, analyze_system, analyze_second_order, trace_trajectory,
  query_solution); diagnostic hooks (`mock.readText()`, `?inspect=1`) exist only
  here. Build with `BASE_URL=http://localhost:<port>` first so the absolute-asset check is real.

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

## Kernel freeze (decided 2026-09-09, round M)

2026-09-10 narrow exception explicitly authorized by the user: fix the non-autonomous zero-speed
stop using the existing static `mentionsTime` rule, with derived integration and query regressions.
No numerical threshold is changed; the freeze continues for unrelated numerical mechanisms.

`lib/core` gets NO new numerical machinery and NO threshold changes. The constants below were chosen
by agents during the J rounds (equilibria / uniqueness / non-autonomous / second-order and the three
review-and-fix rounds); they are unverified heuristics that may only change when a real classroom
failure drives it, with a derived test for that failure. The extreme-box open questions
(`docs/IJKL-open-questions.md`: sin(1/y), the 637 roots of sin(100y), K >= 1e9 systems, half-widths
>= 1.5e5) stay as they are.

- `uniqueness.ts`: `LIPSCHITZ_MAX_LEVELS` 60 most offset levels per side; `LIPSCHITZ_FIRST_FRACTION`
  1e-2 first offset as a fraction of the scale; `LIPSCHITZ_SHRINK` 4 offset divisor per level;
  `UNBOUNDED_EXPONENT` 0.25 quotient-growth exponent alpha at or above which the side is unbounded;
  `BORDERLINE_EXPONENT` 0.1 alpha at or above which it is at least borderline; `LEVEL_OFF_EXPONENT`
  0.05 change per level below which the descent stops as bounded; `TAIL_LEVELS` 4 levels the exponent
  is fitted over; `MIN_LEVELS` 3 usable levels for any verdict but untestable; `ROUNDING_GUARD` 0.1
  rounding-floor fraction of the quotient that ends the descent; `FLOOR_WINDOW` 4 levels the rounding
  floor is estimated over; `POSITION_GUARD` 1e6 eps of |center| below which offsets are not
  representable; `RESOLUTION_FACTOR` 10 multiple of a point's resolution at which a probe starts.
- `slope-field.ts` (vanishing ladder of a constant solution): `VANISH_MAX_LEVELS` 60, `VANISH_SHRINK`
  4, `VANISH_EXPONENT_MIN` 0.05 (M vanishes when |M| falls like delta^beta with beta at least this),
  `VANISH_TAIL` 6 levels fitted, `VANISH_MIN_LEVELS` 3, `UNDERFLOW_MIN_LEVELS` 2 usable levels before
  an underflow counts as measured, `VANISH_POSITION_GUARD` 1e3 eps of |c|, `UNDERFLOW_REACH` 1e60
  factor of the smallest normal within which an exact 0 is an underflow and not a coincidence,
  `PRECISION_REACH` 1e6 factor of the rounding bound within which a value is the rounding floor,
  `RESIDUAL_SAFETY` 10 allowed excess of |M(t, c)| over the vanishing law's prediction, `N_FLOOR`
  1e3 eps of |N| below which N counts as zero on the line, `LOCATE_ITERATIONS` 200,
  `MIN_USABLE_PROBES` 2 / `PROBES_NOTED` 3 probes a constant solution needs / below which the shells
  say how many, `CANDIDATE_CAP_PER_SAMPLE` 4, `PROBE_FRACTIONS` / `DEFAULT_PROBES` the
  irrational-looking t probes.
- `equilibria.ts`: `COLLINEAR_RATIO` 1e-6, `CURVE_LOCAL_RATIO` 0.02, `CURVE_FRACTION` 0.8,
  `CURVE_MIN_POINTS` 6 continuum shape thresholds (H2.7); `CONNECTED_FRACTION` 0.8 (deprecated) and
  `COMPONENT_NEIGHBOURS` 4 connectedness; `SEED_GRID_MIN` 12 / `SEED_GRID_MAX` 32 Newton seed grid;
  `SCAN_GRID_DEFAULT` 64 and `SCAN_SEED_CAP` 400 the |F| scan; `EDGE_CELL_CAP` 256 edge cells
  bisected; `REFINE_MAX_DEPTH` 12, `REFINE_CELL_CAP` 1024, `REFINE_VISIT_CAP` 8192,
  `REFINE_ROOT_CAP` 128 the sign-change quadtree; `NEWTON_STEP_TOL` 1e-13 of the box stops Newton;
  `SINGULAR_SCALED_DET` 1e-8 scaled determinant below which the pseudo-inverse step is used;
  `SINGULAR_DET_NOISE_FACTOR` 2 and `SINGULAR_DET_FLOOR` 16 eps the noise-based determinant tolerance;
  `ABORT_RADIUS` 1e-6 of the box abandons a run heading into a found root; `LOCATION_RELATIVE_TOL`
  1e-9 merges two converged points; `VANISHING_MIN_EXPONENT` 0.1 beta below which the field is
  discontinuous at the point (singular, not an equilibrium); `VANISHING_DELTA_FACTOR` 1e3 first
  offset as a multiple of stepTol; `VANISHING_RESOLUTION_FACTOR` (= 10) smallest offset relative to
  the point's resolution; `ROUNDING_FLOOR_FACTOR` 4 residual within this factor of the rounding bound
  is at the floor; `EXTENDED_ITERATIONS` 10 x maxIterations for a run still closing in;
  `POOR_DECREASE` 0.9 full step compared with the half step; `JACOBIAN_NOISE_FRACTION` 0.5 no step
  verdict above this noise; `JACOBIAN_WIDEN_FRACTION` 0.1 FD step widened until row noise is below
  it; `FD_QUANTIZATION_FRACTION` 1e-4 FD step never below eps |p| / this; `POLISH_ITERATIONS` 20;
  `REGION_ZERO_FRACTION` 0.25 of the scan exactly 0 means region_of_equilibria; `CORNER_NUDGE` 2^-20
  inward sign witness at a non-finite corner.
- `jacobian.ts`: `JACOBIAN_TRUNCATION_TARGET` 1e-7 truncation fraction the step is shrunk to;
  `JACOBIAN_STEP_HALVINGS` 20 most quarterings; `ROUNDING_SAFETY` 4 factor on the rounding bound;
  `EDGE_HALVINGS` 1000 deepest step halving for a column at a domain edge at coordinate 0.
- `classify.ts`: no numerical constants of its own (`zeroFloor` is the Jacobian's per-entry error).
- `detect-form.ts`: `TOL_ALGEBRAIC` 1e-8 identities evaluated directly; `TOL_DERIVATIVE` 1e-6
  identities with estimated derivatives; `MIN_SAMPLES` 5 usable samples for a verdict.
- `time-dependence.ts`: `PROBE_TIMES` 0, 0.7183, 1.4142, 3.1416, -2.7183 and the `FX` / `FY`
  irrational-looking box fractions.
- `second-order.ts`: `AFFINITY_REL_TOL` 1e-9 affinity of E in x''; `XDD_PROBES` the eight x''
  values; `CONSTANT_REL_TOL` 1e-12 "same constant at every sample"; `CROSS_CHECK_REL_TOL` 1e-12
  F == -E0/a; `DISPLAY_DIGITS` 12; `MIN_FINITE_POINTS` 3; `SAMPLE_POINTS` the nine generic points.

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
- Tools take `locale` (`zh` | `en`, optional, default `en` since round M; H2.9 had it REQUIRED, but
  the isError of a forgotten locale reached the student, whereas the default only costs an English
  summary): the model sets `zh` when the student writes Chinese. The site is English by default and
  NEVER reads `navigator.language`: only `?loc=zh` (or the visitor's pick, kept in component state,
  no localStorage, written into the link) gives Chinese. The widget follows `scene.locale`, else en.
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
- Reply to the user in Chinese. Keep code, comments, commit messages and paths in English. The SITE
  and the README are English by default (zh only via `?loc=zh`); `docs/*.md` and this file stay Chinese
  working notes.
