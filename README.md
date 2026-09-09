# vector-field-tool

仓库：<https://github.com/Qscxds/vector-field-tool>（public）

微分方程课的向量场教学工具。目标不只是画图，而是让 AI 通过工具调用回答学生关于微分方程的问题：AI 把自然语言翻译成参数、把数值结果翻译成解释，**所有数学计算由确定性代码完成**，AI 一个数字都不许自己算。

当前状态（2026-09-03，H 轮之后）：

- **计算内核**（`lib/core/`）：表达式解析、场采样、RK4 与自适应 Dormand–Prince 积分（爆破只看位置、不看速度；状态 completed / left_box / reached_equilibrium / blew_up / singular / arc_length / max_steps）、雅可比、平衡点分类（带诚实的 caveat：中心或弱螺旋、非双曲、近重根；按问题尺度判零）、数值求平衡点（连续解集需要计数与几何两条判据）；一阶方程以微分形式 `M(t, y) dt + N(t, y) dy = 0` 为底层（`dy/dt = g(t, y)` 是特例；学生面对的自变量是 t，表达式里写 x 会被拒绝并提示改成 t），常数解沿整条直线检验、方向场奇点、八种标准形式的数值识别（每种都返回三档判定 + 实测偏差 + 阈值，Bernoulli 指数贴合到简单分数）、恰当方程的势函数与隐式解等值线（路径自检失败会明说）。
- **MCP 工具层**：`analyze_system`、`trace_trajectory`、`sample_field`、`analyze_first_order`（`expr` 或 `M`+`N`）、`analyze_second_order`（`equation`，降阶后复用 `analyze_system` 的分析体 `analyzePlanar`），加链路探针 `ping`。每个工具的 `locale` 参数（`zh` / `en`）**必填**，摘要文字全部来自双语文案表（英文为美式拼写）。每次调用有 2 秒预算，进程内有限流减速带。
- **网页外壳** `/vector-field`：中英切换、三种输入（二维系统 / 显式一阶 `dy/dt = g(t, y)` / 微分形式 `M dt + N dy = 0`，一阶模式下范围输入叫 t 最小 / t 最大）、十个预设、等比视口（默认等比；「等比」复选框关掉后输入范围填满画布，范围行写「填满输入范围」，画布下方常驻一行「横纵比例不同，图上的角度不代表真实斜率。」；widget 始终等比）、画布上标出坐标轴名（一阶方程为 t、y，二维系统为 x、y）、滚轮缩放、拖动平移、双击复位、悬停预览解曲线（屏幕长度固定为两条对角线，与场速和缩放无关）、点击固定轨线（延伸到原始范围的 20 倍才停，不受视野裁剪；「最近一条轨线」按类型措辞：显式一阶方程给出终点的 t 坐标，微分形式只列两侧的终止原因）；结果列表上方注明它按哪个范围计算（复位时是输入范围，缩放或平移后是可见范围）。
- **widget**：Scene 里带着方程，widget 用同一份内核本地编译，缩放 / 平移 / 悬停 / 点击都在沙箱里算（S 阶段证实 mathjs 编译不需要 `unsafe-eval`）；编译被挡时退回静态图并说明。**Claude 实机验证 widget 交互待人工做**（版本号 e-2 → g-1，Claude 里必须断开重连连接器）。
- 单测 409 个，期望值全部来自数学推导。
- **上线准备完成**（H1）：显式 `BASE_URL` 优先级最高并有启动自检；每次调用 2 秒预算 + 进程内限流 + 参数上界；首页有交互页面入口。**H2 数学优先拍板完成**（爆破判据、hover 弧长、轨线延伸、三档类型识别、Bernoulli 有理指数、恰当自检、连续解集几何判据、近重根 caveat、locale 必填、美式拼写）。未做：实际部署到 Vercel（见下文步骤）。

文档：`docs/P0-handoff.md`（P0）、`docs/NIGHT-*.md`（夜跑 A–E）、`docs/FG-*.md`（S/F/G）、`docs/H-summary.md`（H 轮进度、验证清单、审查结果）、`docs/H-decisions.md`（所有偏离原计划的决定）、`docs/H-open-questions.md`（待拍板事项）。

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
                     lib/render/  纯函数几何（视口、箭头、刻度、颜色、等值线）
                     lib/labels.ts 双语文案表（zh / en 键集合相同）
                     components/  canvas 渲染组件 + 交互 hook（两个外壳共用）
```

硬约束：

1. `lib/core/` 和 `lib/render/` 是纯函数：不许 import React / Next.js / MCP 任何东西，不用 `Math.random`。`lib/architecture.test.ts` 自动检查。
2. 渲染组件只接收数据 props（一个 `Scene`），不知道调用方是谁，不调用 `lib/core`。
3. 网页外壳和 MCP 外壳共用同一份 core、同一套组件、同一个交互 hook，共用的数据契约是 `lib/scene.ts`。
4. 无状态：没有数据库、没有账号、没有登录、没有 secret。每个请求新建一个 McpServer，算完就走。
5. 所有面向学生 / 用户的文字都在 `lib/labels.ts` 里同时有中英两份（`lib/labels.test.ts` 检查键集合一致）；内核只返回 key。

## 目录

```
app/mcp/route.ts           MCP 端点 /mcp（Streamable HTTP，无状态，无鉴权；GET/DELETE 回 405）
app/mcp/server.ts          每请求新建 McpServer；widget 资源（版本号在这里）；ping
app/mcp/tools.ts           五个分析工具：zod 参数校验、给 AI 看的 description、按 locale 查表的摘要
app/widget/page.tsx        widget 页面：接收工具结果的 Scene，本地编译方程，交互式绘制
app/vector-field/page.tsx  网页外壳路由（服务端组件：解码地址栏参数后渲染 VectorFieldApp）
app/embed/page.tsx         可嵌入路由：同样的参数，无标题；controls=0 隐藏表单；只有它带 frame-ancestors 头
app/vector-field/presets.ts 预设库：按章节分组，每个预设 = 完整页面状态 + 固定轨线起点 + 双语说明，presetUrl 生成分享链接
components/VectorFieldApp.tsx 网页外壳主体（两个路由共用）：表单 + 预设下拉 + 语言切换 + 交互画布 + 结果列表；地址栏同步、复制链接、vf- 布局
lib/url-state.ts           地址栏状态：AppState 的编码 / 解码（默认值省略；解码有长度上限并走解析白名单，绝不抛异常）
app/page.tsx               首页说明
app/layout.tsx             根布局（含 iframe 内的 history 补丁，不要删）
base-url.ts                公网地址：BASE_URL 或 Vercel 系统变量，喂给 assetPrefix
components/VectorFieldCanvas.tsx   两层 canvas：底层画场 / 等值线 / 轨线 / 标记，overlay 画悬停预览；上报指针与滚轮
components/useInteractiveScene.ts  交互状态机：视口、重采样、防抖重算、hover 节流、点击固定
lib/core/                  parse field integrate jacobian classify equilibria slope-field detect-form exact types
lib/render/                viewport arrows ticks color contours
lib/scene.ts               工具结果 = Scene 的类型契约
lib/labels.ts              双语文案表与数字格式化
lib/interactive.ts         交互外壳共用的纯计算（可见范围内的特征、按步数预算描迹）
scripts/smoke.mjs          对运行中的服务器做 HTTP 冒烟（npm run smoke）
docs/                      交接文档
```

## MCP 工具

| 工具 | 算什么 | 什么时候用 |
|---|---|---|
| `analyze_system(f, g, xMin.., density, locale)` | 观察范围内全部平衡点，各带雅可比、特征值、分类、caveat，附一份场采样 | 学生问平衡点、稳定性、相图、临界点类型、长期行为 |
| `trace_trajectory(f, g, x0, y0, tSpan, direction, method, locale)` | 从初值正向 / 逆向积分，返回点列和终止原因 | 学生问某个初值出发会怎样、轨线去哪、是否趋向平衡点或极限环 |
| `sample_field(f, g, xMin.., density, locale)` | 规则网格上的向量场 | 只想看方向场 / 相平面箭头 |
| `analyze_second_order(equation, params, xMin.., density, locale)` | 单个二阶方程 `x'' = F(x, x')`（写成完整方程 `x'' + 0.5*x' + x = 0`，或只写右端 F；未知函数是 x，导数写 `x'`、`x''`，t 是时间）：令 y = x' 降阶为 `x' = y, y' = F(x, y)`，摘要第一句就是这一步降阶，然后与 `analyze_system` 完全相同（平衡点、特征值、分类、caveat、场采样）；x'' 必须线性出现，`x''^2`、`sin(x'')` 会被拒绝并说明 | 学生给一个二阶方程：谐振子、阻尼振子、单摆、Van der Pol、Duffing，问相平面、平衡点、稳定性 |
| `analyze_first_order(expr 或 M+N, xMin.., density, locale)` | 一阶方程 `dy/dt = g(t, y)` 或 `M(t, y) dt + N(t, y) dy = 0`（自变量是 t；`xMin`/`xMax` 是 t 的范围，参数名不变）：斜率场 / 方向场（微分形式画无向线段）、常数解与稳定性、方向场奇点、八种标准形式各自的判定（consistent / borderline / inconsistent / untestable）与实测偏差（可分离、自治、对 y 线性、齐次、Bernoulli 含贴合的有理指数、恰当、积分因子）、恰当时的隐式解等值线或路径自检失败的说明 | 单个一阶方程：Logistic、牛顿冷却、可分离、线性、恰当方程、斜率场、「这题用什么方法」 |
| `ping(message)` | 原样返回 | 链路探针，判断是传输层挂了还是只有渲染挂了 |

`locale`：**必填**。学生用中文提问传 `zh`，其他一律 `en`；漏传直接报错（有意为之：默认值会掩盖模型没按规则传参）。摘要、caveat、类型证据都按这个语言生成；错误信息（参数越界、表达式解析失败、超预算、限流）始终是英文，那是给模型看的。

表达式写法：二维系统用 `x`、`y`（`t` 为时间）；一阶方程只用 `t`、`y`（t 是自变量，没有另外的时间变量，写 `x` 会被拒绝并提示改成 t），而且只输入右端，不要写 `dy/dt =`（写了会提示只输入右端）。乘号必须写出来（`x*y`，不是 `xy`；一阶方程里是 `t*y`），幂用 `^`（注意：负数的分数次幂在这里没有定义，`y^(2/3)` 在 y < 0 时是 NaN，所以 `3*y^(2/3)` 的 y = 0 会被报告为只在上方有定义的定义域边界；要取实数分支，请写 `abs(y)^(2/3)` 或 `sign(y)*abs(y)^p`），函数 `sin cos tan asin acos atan atan2 sinh cosh tanh exp log log10 sqrt abs sign pow min max floor ceil round`，常数 `pi`、`e`，其他常数放 `params`，分段可用 `x > 0 ? 1 : -1`。解析走 mathjs AST 白名单，赋值、属性访问、非白名单函数一律拒绝并点名。

诚实性规则：纯虚特征值只报 `center_or_weak_spiral` 并附 caveat（线性化分不清中心和弱螺旋）；行列式约等于零报 `non_hyperbolic` 并附 caveat（Hartman–Grobman 不适用）；重根判定落在容差带内（判别式不精确为零）附 `repeatedRoot` caveat；多个非双曲平衡点只有在共线或落在一条曲线上时才报连续解集，否则报「多个孤立的退化平衡点」；方程类型给三档判定和实测偏差，通过的说「在数值上表现得像 X」并附 caveat，临界的明说是临界，不通过的列出偏差，检验不了的说检验不了；恰当方程的势函数路径自检失败时明说并报偏差。爆破判据只看位置：`x' = -1e7 x` 是有界衰减，绝不叫 blew_up。caveat 是给学生念的完整句子，中英各一份。

## 交互（网页外壳与 widget 相同）

- 视口等比（默认）：输入的范围放进画布时保持横纵像素比例相同，短的一边对称扩大，图下一行小字给出实际显示范围（一阶方程写成 t∈[..]，二维系统写成 x∈[..]）。网页外壳有「等比」复选框：关掉后输入范围原样填满画布，横纵像素比例不再相同，范围行改写「填满输入范围」，并在画布下方常驻一行「横纵比例不同，图上的角度不代表真实斜率。」（不是定时消失的提示）；widget 始终等比。
- 坐标轴名画在画布上：横轴在 y = 0 轴线右端标 t（一阶方程）或 x（二维系统），纵轴在 x = 0 轴线顶端标 y；轴线不在视野内时退到对应的角落，不压住刻度数字。
- 滚轮缩放（光标下的点不动，相对输入范围限制 1/50..50 倍），拖动平移，双击回到输入范围。
- 悬停预览经过该点的解曲线：按**屏幕弧长**积分，正逆各画两条画布对角线的长度就停（与场的快慢、与缩放无关，最后一段精确切在限长处），步数只作兜底；`requestAnimationFrame` 节流。靠近方向场奇点时不画预览，改为提示「方向无定义」。
- 点击固定的轨线按解自身的性质延伸：停止盒是输入范围的 20 倍，视野只负责裁剪，缩小视野不会露出断头。
- 视图变化时场立即重采样。平衡点、常数解、奇点、类型、等值线的计算范围：复位视图（未缩放、未平移）时就是输入范围，两种等比模式都一样——等比留出的边缘只画箭头，所以切换「等比」或在另一种长宽比的画布（手机 / 桌面）上打开同一个链接，列出的平衡点 / 常数解 / 类型不会变；缩放或平移后在停止操作 250 毫秒后按可见范围重算。列表上方注明所用范围。

## 分享链接与嵌入

网页外壳的全部状态都在地址栏里（`lib/url-state.ts`）：任何改动 500 毫秒后写回地址栏（`history.replaceState`；只编码输入的范围，不编码滚轮缩放后的视野；悬停不触发），「复制链接」按钮复制 `https://tools.studycase.net/vector-field?...`（剪贴板不可用时显示一个已选中的只读输入框）。默认值一律省略，所以手写链接很短。参数：

| 参数 | 含义 |
|---|---|
| `m` | `first`（dy/dt = g(t, y)）/ `diff`（M dt + N dy = 0）/ `system`（默认）/ `second`（二阶方程） |
| `g` | 一阶：g(t, y)；系统：y' = g(x, y) |
| `f` | 系统：x' = f(x, y) |
| `M`、`N` | 微分形式的 M(t, y)、N(t, y) |
| `eq` | 二阶方程原文，如 `x'' + 0.5*x' + x = 0` |
| `tmin`、`tmax` | 一阶方程的 t 范围（`m=first` / `m=diff`） |
| `xmin`、`xmax` | 系统 / 二阶方程的 x 范围 |
| `ymin`、`ymax` | y 范围（默认 -3..3；横向默认也是 -3..3） |
| `loc` | `zh` / `en`；省略时跟随浏览器语言 |
| `eqs` | `0` = 关闭等比（默认开启） |
| `d` | 网格密度 5..40（默认 20） |
| `arrows` | `scaled` = 箭头长度表示模长（默认 `unit`） |
| `t0` | 非自治系统的快照时刻（默认 0） |
| `traj` | 固定轨线起点 `x,y;x,y`（最多 20 个；点击固定的轨线也会写进来） |

例：`/vector-field?m=first&g=y*(1-y)&tmin=0&tmax=10&ymin=-0.5&ymax=1.5&loc=en`；`/vector-field?m=system&f=y&g=-x-0.5*y&traj=1,0;2,1`；`/vector-field?m=diff&M=2*t*y&N=t^2%2By^2&tmin=-2&tmax=2&ymin=-2&ymax=2`（`+` 在 query 里要写成 `%2B`）。

校验（链接是公开的攻击面）：整条 query 超过 4096 字符则全部忽略；每个表达式最长 200 字符，并走与页面完全相同的解析白名单（一阶只许 t、y，系统 x、y，二阶走 `reduceSecondOrder`）；数字必须有限且 |值| ≤ 1e6，范围 min < max 且边长 ≥ 1e-9；密度是 5..40 的整数；无效的参数回退到默认值，并在表单上方用一句话列出「链接里的这些参数无效，已忽略并使用默认值：…」；未知参数忽略；解码绝不抛异常。

嵌入：`/embed?...` 用同样的参数，没有标题和站点链接，顶部只有语言选择和「在新窗口打开」（带同样参数的 `/vector-field`）；画布随容器宽度变化（300..900 像素，高度 = 宽 × 0.72）；加 `controls=0` 隐藏表单（仍显示方程文本、预设说明和结果）。Google Sites 里用「嵌入 → 通过网址」贴 `https://tools.studycase.net/embed?...&controls=0`。只有 `/embed` 发送 `Content-Security-Policy: frame-ancestors *`（任何站点都可以 iframe 它）；`/widget` 和其他路由绝不能加任何 frame 相关头（X-Frame-Options、frame-ancestors），否则 MCP 宿主沙箱里的 widget 会变成空白。`/embed` 标记 `noindex`。

预设（`app/vector-field/presets.ts`）按章节分组：一阶·可分离 / 线性 / 恰当 / Bernoulli / 齐次 / 解不出来的 / 唯一性失效，二阶/系统，非自治；每个预设自带范围、固定轨线起点和一句双语说明，`presetUrl(preset)` 给出它的分享链接。

## 本地运行

要求 Node ≥ 20.9（推荐 24，Vercel 默认也是 24）。

```bash
npm install
npm run dev          # http://localhost:3000 ，网页外壳在 /vector-field
npm test             # vitest，409 个测试
npm run typecheck    # tsc --noEmit
npm run build        # 生产构建
npm run smoke        # 对已运行的服务器做 HTTP 冒烟（默认 http://localhost:3000/mcp）
```

冒烟脚本检查 initialize、六个工具的 tools/list 与调用、非法输入的错误形式、widget 资源的 HTML 与 CSP、GET 405。要先在另一个终端起服务器（`npm run dev` 或 `npm run build && npm start`）。本地构建没设 `BASE_URL` 时 widget 的资源地址本来就是相对的 `/_next/...`，「widget asset URLs are absolute」这一项会显示 SKIP 并计为通过；`<base href>` 是其他源时仍是真正的 FAIL。

手动验证一个工具调用：

```bash
curl -s -X POST http://localhost:3000/mcp -H "content-type: application/json" -H "accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"analyze_first_order","arguments":{"M":"2*t*y","N":"t^2 + y^2","xMin":-2,"xMax":2,"yMin":-2,"yMax":2,"locale":"zh"}}}'
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

6. 对话里说「用 analyze_system 分析 x' = x - x*y, y' = x*y - y」，应看到相图 widget，可以在里面滚轮缩放、拖动、悬停、点击；说「用 ping 工具发一句 hello」可以单独测链路。

### 为什么需要 BASE_URL，以及 widget 在沙箱里跑起来要过的三道关

Claude 把 widget HTML 渲染在它自己的沙箱域名 `<hash>.claudemcpcontent.com` 上，页面等于被搬到了别人的源下运行。三个坑，每个都会让 widget 静默变成空白：

1. **资源地址与 Turbopack 前缀必须同时是我们的公网源。** Next 的运行时用「脚本 URL 去掉构建时前缀」识别 chunk，前缀对不上就永远等不到入口执行，不报任何错。只有 `assetPrefix` 能同时改地址和前缀，它在构建时固定，所以公网地址必须提前知道：本地隧道靠 `BASE_URL`，Vercel 上由系统变量自动推出（`base-url.ts`）。**不要在请求时改写 HTML 里的资源 URL**，试过，不行。
2. **`<base href>` 需要 CSP 放行。** MCP Apps 规范规定主机默认 `base-uri 'self'`，服务器在资源的 `_meta.ui.csp.baseUriDomains` 里声明自己的源。
3. **`history.replaceState` 会抛 SecurityError。** Next 水合后写 history，地址与 iframe 自身的源不一致，浏览器抛异常，React 19 卸载整棵树。`app/layout.tsx` 里有一段只在 iframe 中生效的内联脚本吞掉它。

另外：Next 16.3 起开发服务器默认对跨源 `/_next/*` 返回 403，`next.config.ts` 配了 `allowedDevOrigins`；Claude 沙箱 CSP 不允许 eval，zod 启动时探测一次 `new Function` 并自行捕获，主机会记一条无害的违规报告。**widget 的本地计算不需要 eval**：mathjs 的 `compile()` 把表达式树编成闭包，不生成代码字符串（S 阶段在规范 CSP 下实测：编译 < 1 毫秒，RK4 2000 步 13 毫秒）。

不依赖 Claude 复现 widget 问题的方法：两个不同源的静态页面，外层扮演主机（应答 `ui/initialize`、推送 `ui/notifications/tool-result`），内层用 `<iframe sandbox="allow-scripts allow-same-origin">` 加载按规范 CSP 提供的 widget HTML，看 iframe 是否发出 `ui/initialize` 并画出画布。E 阶段和 G 阶段都是这样验证的。

## 部署到 Vercel

1. import 仓库，框架自动识别为 Next.js。第一次部署（还没绑域名）不需要任何环境变量。
2. **关掉 Deployment Protection**（Settings → Deployment Protection → Vercel Authentication → Disabled）。有意为之：没有 secret、没有用户数据，关掉后 preview URL 也能给 Claude 连。
3. 先用 `https://<project>.vercel.app/mcp` 在 Claude 里试通。
4. **绑定自定义域名（例如 `tools.<你的域名>`）之后，必须在 Vercel 项目设置里加环境变量 `BASE_URL=https://tools.<你的域名>`（Production 环境），然后重新部署。** 不设的话不会报错，但 widget 在 Claude 里会静默白屏，见下面的解释。
5. Claude 里把连接器改成 `https://tools.<你的域名>/mcp`（改过地址或 widget 版本都要断开重连）。

### 为什么绑了域名就必须设 BASE_URL

`base-url.ts` 在构建时决定这个部署的「公网源」，它同时喂给三处：Next 的 `assetPrefix`（widget 的 JS/CSS 绝对地址和 Turbopack 的 chunk 前缀）、widget HTML 里注入的 `<base href>`、widget 资源的 `_meta.ui.csp`（`connectDomains` / `resourceDomains` / `baseUriDomains`）。优先级：

1. 显式 `BASE_URL`（最高，压过所有 Vercel 系统变量；有测试 `base-url.test.ts` 保证）；
2. Vercel 生产环境的 `VERCEL_PROJECT_PRODUCTION_URL`，即 `xxx.vercel.app`；
3. Vercel 预览部署的分支 / 部署地址；
4. 都没有：本地开发，`/mcp` 从请求头推。

绑了自定义域名之后学生和 Claude 都从 `tools.<域名>` 加载，而第 2 条推出来的仍是 `xxx.vercel.app`：三处全部指向另一个源，Claude 沙箱的 CSP 把 `_next/*` 资源拦掉，iframe 里什么都不出现，也没有任何错误。所以启动时有一道自检：检测到运行在 Vercel 生产环境但 `BASE_URL` 未设置时，构建日志和函数日志里会打一行 `[base-url] BASE_URL is not set on this Vercel production deployment ...` 的警告。**看到这行就去设 `BASE_URL` 并重新部署。**

### 公开端点的成本上限

`/mcp` 完全公开、无鉴权，任何人拿到地址都能调。它不读写任何数据，最坏情况是被人当免费的 ODE 求解器刷。这里没有做分布式限流（serverless 没有共享状态，做对需要外部存储，对这个项目不值），而是把**单次请求的成本**压死：

- 参数上界：`density` ≤ 60、`tSpan` ≤ 1000、盒子每边 ≤ 1e6、表达式 ≤ 200 字符（`f`、`g`、`expr`、`M`、`N` 一视同仁，解析器另有 500 字符硬上限）、积分步数上限 20000 步 / 方向、平衡点种子固定 12×12、等值线固定 8 条 × 60×60 网格。
- **每次工具调用 2 秒的墙钟预算**：积分器、平衡点搜索、势函数和等值线循环都会定期检查，超时返回可读的 `isError`（「范围太大或表达式太复杂，请缩小 tSpan / density / 范围」），不会让函数一直跑。最贵的合法调用（恰当方程 + 等值线，density 60）实测远在 1 秒以内。
- **进程内滑动窗口限流**（每实例每分钟 240 次工具调用）作为减速带。它在 serverless 上只是尽力而为：每个实例各算各的、冷启动清零、多实例并行时上限成倍放大，所以它不是真正的限流，只是让单个实例上的死循环脚本得到 `isError` 而不是计算。

Vercel 将于 2026-10-01 弃用 Node 20 运行时，本项目 `engines` 允许 ≥20.9，Vercel 默认选 24。

## 排错

- **widget 不出现或一块空白**：先确认启动时设了 `BASE_URL` 且与连接器地址一致（Vercel 上绑了自定义域名却没设 `BASE_URL` 是最常见的原因，日志里会有 `[base-url]` 警告）；改过版本号要重连连接器；然后 Claude 桌面版 Help → Troubleshooting → Enable Developer Mode，Ctrl+Shift+I 看内层 iframe 控制台。其他原因：`/_next/*` 被 403、ngrok 免费版、Vercel Deployment Protection 没关。先用 `ping` 判断传输层是否正常。
- **widget 有图但不能缩放 / 悬停，并显示「本地重算不可用」**：沙箱里编译表达式失败。把控制台里的异常贴到 issue；服务器给的静态图仍然正确。
- **resources/read 报 `widget fetch failed for <url>`**：服务器推算出的公网地址它自己访问不到。检查隧道、`x-forwarded-host`、`BASE_URL`。
- **日志里出现 400**：Claude 有些请求带 `mcp-protocol-version: 2026-07-28`，路由会降级为 SDK 支持的版本再处理。每个 POST 打一行 `[mcp] <method> ...` 日志。
- **连接器无法连接**：URL 带 `/mcp`、是 https、cloudflared 还活着。Claude 出口 IP 段见 <https://platform.claude.com/docs/en/api/ip-addresses>。
- **工具返回 isError**：文字里点名了哪个参数或哪个表达式有问题（例如 `xy` 会提示写成 `x*y`，漏传 `locale` 会点名 locale；一阶方程里写了 `x` 会说 “write t instead of x”，把 `dy/dt =` 一起贴进来会说只输入右端）。参数越界由 zod 校验，同样以 isError 结果返回，不会 500。
- **isError 说超出 2 秒预算或 Too many requests**：前者是单次调用太贵（缩小范围 / tSpan / density），后者是这个实例一分钟内已处理 240 次调用，几秒后再试。

## 决策记录

日常决策见 `docs/NIGHT-decisions.md`（A–E）和 `docs/FG-decisions.md`（S/F/G）。骨架期的两条：

- 2026-09-02：不用 mcp-handler，直接用 sdk 1.x（ext-apps 只兼容 sdk 1.x）。隧道用 cloudflared。Vercel Deployment Protection 有意关闭。
- 2026-09-02：widget 走 `assetPrefix`（BASE_URL / Vercel 系统变量），不在请求时改写地址。`/mcp` 对 GET/DELETE 返回 405；对不认识的协议版本头降级。

## 路线图

- ~~P1 计算内核~~、~~P2 MCP 工具~~、~~P3 widget 静态渲染~~、~~P4 网页外壳~~：2026-09-02 夜跑完成。
- ~~S 沙箱探针~~、~~F 微分形式与类型识别~~、~~G 双语 / 等比视口 / 缩放平移 / hover / widget 本地计算~~：2026-09-03 完成。
- ~~H1 上线准备~~、~~H2 数学优先拍板~~、~~H2 对抗式审查 14 条修复~~：2026-09-03 完成（tags `h1-deploy-ready`、`h2-math-done`、`h2-reviewed`）。
- 下一步：部署 Vercel（绑域名后设 `BASE_URL`）；Claude 实机验证 widget 交互（版本 h-2，重连连接器）；看 `locale` 必填后模型是否按规则传参；`docs/H-open-questions.md` 里的拍板项。
- P5：绑子域名，按 endpoint 限流（不要按 IP：MCP 请求全部来自 Anthropic 云端的少数几个 IP）。
