# 向量场教学工具：完整工程记录

更新日期：2026-09-10。工程位置：`E:\project\vector-field-tool`。本轮修改基于提交 `568eeaa`。

本文是后续维护的集中入口：先说明当前结构与本轮修复，再按时间顺序收录 `docs/` 中原有 16 份阶段记录的全文。历史部分只降低标题级别以便统一排版，不删减决策、失败记录、验证过程、提交号或待决事项。原文件保留用于来源核对。

历史记录中的“当前版本”“已部署”“测试数量”“未解决”等均指当时的状态；与本文当前记录冲突时，以本节和本轮代码为准。历史中保留的命令是记录，不是要求重新执行的操作。

## 阅读导航

- [当前工程结构](#current-architecture)
- [必须保持的数学与交互约定](#current-contracts)
- [2026-09-10：前三项问题修复](#current-fixes)
- [验证结果与发布状态](#current-validation)
- [当前保留的限制](#current-limits)
- [历史记录索引与来源校验](#history-index)
- [完整历史记录](#history-archive)

<a id="current-architecture"></a>

## 当前工程结构

这是一个无账号、无数据库的微分方程教学工具。Next.js 16.3.4 / React 19.2.8 提供页面与 MCP HTTP 入口；mathjs 负责受限表达式解析；确定性数学计算放在 `lib/core`。网页和 MCP 小组件使用同一计算内核、`Scene` 数据契约、交互 hook 和画布组件。

| 层次 | 文件或目录 | 职责 |
|---|---|---|
| 站点路由 | `app/page.tsx`、`app/help/page.tsx` | 首页与帮助页，服务端读取链接语言 |
| 网页及嵌入入口 | `app/vector-field/page.tsx`、`app/embed/page.tsx` | 服务端解码 URL，向共享应用传初始状态 |
| 应用编排 | `components/VectorFieldApp.tsx` | 方程输入、预设、初值、查询、语言、URL、PNG |
| 解析与降阶 | `lib/core/parse.ts`、`slope-field.ts`、`second-order.ts` | 白名单 AST、安全编译、统一坐标与二维系统 |
| 数值算法 | `lib/core/integrate.ts`、`equilibria.ts`、`jacobian.ts`、`classify.ts` | RK4 / Dormand–Prince、平衡点定位、误差与分类 |
| 一阶分析 | `lib/core/detect-form.ts`、`exact.ts`、`uniqueness.ts` | 教科书类型探测、数值势函数、唯一性证据 |
| 解查询 | `lib/core/query.ts`、`lib/query-panel.ts` | 指定时刻求值、坐标命中、误差及停止说明 |
| 数据契约 | `lib/scene.ts` | 两个外壳共同消费的方程、场、曲线、分析和查询数据 |
| 共享交互 | `components/useInteractiveScene.ts`、`lib/interactive.ts` | 视口、重采样、特征重算、预览、固定轨迹 |
| 轨迹和手势 | `lib/trajectory-store.ts`、`trajectory-hit.ts`、`gestures.ts` | 初值派生曲线、增删撤销、屏幕命中、鼠标/触控 |
| 几何与绘制 | `lib/render/`、`components/VectorFieldCanvas.tsx`、`drawScene.ts` | 世界/屏幕映射、箭头、等值线、双画布、PNG 共用绘制 |
| MCP | `app/mcp/route.ts`、`server.ts`、`tools.ts` | 无状态传输、七个工具（六个数学工具 + ping）、Scene 与文本摘要 |
| 小组件 | `app/widget/page.tsx` | 宿主工具消息、本地编译与交互、编译失败时静态降级 |
| 文案及链接 | `lib/labels*.ts`、`site-text.ts`、`url-state.ts` | 双语表、误差与状态措辞、链接编码和校验 |
| 本地验证 | `*.test.ts`、`scripts/smoke.mjs`、`scripts/mock-host/` | 数学/协议回归、HTTP 检查、跨来源小组件宿主 |

### 一次计算如何经过各层

网页：URL → `decodeState` → 表单 → 编译/降阶 → `useInteractiveScene` → 核心计算结果 → `Scene` → 底层画布。指针事件经过坐标转换和手势状态机回到同一 hook；预览与高亮画在覆盖层。

MCP：POST → 每请求新建 server / transport → 工具输入 schema → 预算和参数检查 → 相同核心 → 完整文本摘要 + `structuredContent: Scene` → widget 本地编译 → 相同 hook 和画布。

`Scene` 是适配层组装的数据，数学内核本身不依赖 React、Next.js、MCP 或时钟。超时通过外部注入的 `checkpoint` 实现。

<a id="current-contracts"></a>

## 必须保持的数学与交互约定

1. **坐标含义**：一阶 `dy/dt=g(t,y)` 和 `M(t,y)dt+N(t,y)dy=0` 使用 `variables: "ty"`；学生的 `t` 是 `Vec2.x`，不是积分参数。二维系统使用 `xy`，另有物理时间 `t`。二阶通过 `y=x'` 化成二维系统。
2. **微分形式**：转换为 `(dt/ds,dy/ds)=(N,-M)`，不先除以 N；N=0 可表示合法垂直切线，M=N=0 才是方向未定义点。绘制无方向线段。
3. **数值诚实**：类型识别、连续平衡点集和唯一性探测是有限采样证据；纯虚特征值为“中心或弱螺旋”，近零行列式为“非双曲”。误差、域边界、搜索上限和 caveat 必须完整传递。
4. **三种范围**：`homeBox` 为输入范围；`viewport.box` 为显示范围；`featuresBox` 为分析范围。在原始视图按输入范围分析，平移缩放后等待 250 ms 按显示范围分析。等比例扩出来的边缘不改变原始特征列表。
5. **轨迹规则**：初值是保留轨迹的数据来源；固定轨迹每方向积分跨度 50、停止框为输入范围的 20 倍。预览每方向最多两条画布对角线，另有跨度和步数安全上限。8 屏幕像素内点击删除一组正反向曲线；撤销深度 20。
6. **重算和重置**：方程或 seed 数组引用改变时重置；快照时间改变时从当前保留初值重算，删除的 seed 不能复活。查询随方程、输入范围、快照或被查询初值的删除失效。
7. **查询算法**：二维系统指定时间是绝对时间；一阶指定 t 映射核心 x 坐标事件。事件按时间使用 Brent 细化，试探时重新积分，不把画出的折线插值当解；误差是估计值。
8. **语言与存储**：默认英文，中文由 URL 或界面选择给出，不读取浏览器语言。用户文案集中双语维护。URL 保存方程、输入范围、视图选项、快照和轨迹初值，不保存曲线点集及查询结果。
9. **小组件部署**：构建时公开 origin、`assetPrefix`、资源 `<base>`、CSP 来源一致；保留 iframe history 补丁。改 widget 版本需同步资源 URI / 测试 / smoke，部署后宿主连接器需要重新连接。
10. **修改边界**：原内核冻结继续适用于无关算法与阈值；2026-09-10 用户明确授权本次非自治零速度误停修复，为该问题的窄范围例外。无需由旧冻结记录推导额外许可步骤。

<a id="current-fixes"></a>

## 2026-09-10：前三项问题修复

本轮用户要求修复探索报告中的前三项，并把完整工程记录集中到一个文档；第 4 项（网页状态与 URL 接受范围不一致）不在本轮修改范围。

### 1. 非自治系统在瞬时零速度处提前停止

修复前经本地生产 MCP 复现：`x'=0, y'=t`、`(x(0),y(0))=(0,0)`，两方向均在 0 步以 `reached_equilibrium` 停止；查询 `t=1` 得到 `stopped_before_target`。积分可直接推导 `x(t)=0, y(t)=t²/2`，因此 `y(1)=1/2`，原停止规则不适用于此处。

**修复**：在两种积分器共用的 `Run` 中，使用现有 `mentionsTime(sys.spec)` 静态 AST 规则，每次积分开始时判断一次。`xy` 系统含独立时间 t 时，跳过起点和接受步的低速度平衡停止；`ty` 一阶坐标系统及自治系统继续使用原规则。参考速度仍用于原有异常场判定；没有改动数值阈值。

**回归证据**：先补测试，观察新增 7 项回归失败、2 项原规则保护通过，再修实现。覆盖 RK4 / 自适应、正反向、非零起始时刻、时间出现在任一分量、中途接受步速度为零，以及自治/ty 的真平衡停止。查询测试直接核对 `t=±1` 时 `y=1/2`。MCP 旧测试中“非自治零速度应停止”的预期改为完成所给时段，并用 `y=sin(t)` 核对到达和经过 π/2 的数值结果。

涉及 `lib/core/integrate.ts`、`integrate.test.ts`、`query.test.ts`、`app/mcp/tools.test.ts`。这是用户明确要求修复的特定错误，不构成其他内核启发式阈值的解冻。

### 2. 实时 Scene 丢失数学诊断

修复前 `computeFeatures` 已生成平面场的 `singularPoints`、`underflowPlateau`，hook 组装 Scene 时漏传；一阶组装 FirstOrderView 又漏掉 `resolution`、`zeroPlateaus`。例如 logistic 在 y 范围 [-0.5,2] 上核心扫描分辨率为 2.5/400=0.00625，而前端特征对象缺少该字段。

**修复**：`lib/interactive.ts` 的一阶结果加入 `resolution`、`zeroPlateaus`；`components/useInteractiveScene.ts` 重建实时 Scene 时加入 `singularPoints`、`underflowPlateau`。仍由现有双语 notices 负责展示，不增加第二套计算或诊断文案。

**回归证据**：对 `computeFeatures` 核对 logistic 的 0.00625 分辨率，以及 `exp(-y²)` 在 [-30,30] 的两段下溢零平台。新增 `lib/interactive-scene.test.ts` 用真实 React 服务端渲染调用 hook，验证最终 Scene 和两个外壳实际使用的提示文本；不是只验证孤立 helper 或扫描源码字段名。先观察到字段缺失导致的失败，再补齐传递。

浏览器实测：一阶 `exp(-y²)` 显示零平台提示和 `Δy=0.15`；系统 `x'=xy/(x²+y²), y'=y-x` 显示方向相关奇异点而不声称平衡点；`x'=y, y'=exp(x)` 在负大数范围显示下溢提示。

### 3. 一阶查询丢失原始方程与非唯一提示

修复前 `query_solution` 的 first/diff 场景只留下归一化系统，没有原始 FirstOrderSpec；工具跳过一阶非唯一标记。widget 随后按平面系统探测，`(1,sqrt(y))` 没有平衡点，因此不能识别一阶 `y=0` 的非唯一性，摘要还会显示内部的 `x'=1`。

**修复**：为 Scene 添加可选 `firstOrderSpec`，独立保存原式及 params；查询没有进行完整特征分析，因此不伪造 `FirstOrderView`。工具 → widget → hook → 重建的实时 Scene 都保留该字段，旧分析场景的 `firstOrder.spec` 仍兼容。widget 复用 `sceneEquationText` 显示 `dy/dt=...` 或 `M dt+N dy=0`，PNG 方程文字使用同一 helper。

`query_solution` 的 first/diff 初始曲线调用现有 `markNonUnique` 曲线范围探测；后续悬停和点击也使用原式检查一阶常值解。探测可发现显示范围外、曲线自身到达的 `y=0`，不受当前特征列表是否存在影响。`NonUniqueProbe` 新增可选 checkpoint 并传入相关循环、常值解/平衡点搜索和唯一性检查；预算回调的原异常向外传播，不能被“不显示诊断”的兜底 catch 吞掉。

**回归证据**：真实 MCP SDK 测试验证 first/diff、两种语言、params、显示范围外 sqrt(y) 非唯一曲线；真实 hook 测试在 `withFeatures=false` 时调用 `addTrajectory`，两个一阶模式均保留原式，并只标记接触非唯一常值解的方向；展示 helper 测试验证原式。预算中断测试验证不吞调用方异常。

小组件资源版本从 `o-1` 升为 `o-2`，同步 server 测试、smoke 与 README。新增 mock-host 场景 `query_first_sqrt`、`query_diff_sqrt`、`query_zero_speed`，便于重跑本轮实际界面路径。

### 工程记录整理

集中收录 P0、NIGHT、FG、H、IJKL、MNO 的 16 份记录，按阶段排列总结、决策、待决事项。来源索引记录原文件路径和 SHA-256，用于验证整合过程中没有漏文件或替换来源；历史正文完整保留，原文件不删除。

<a id="current-validation"></a>

## 验证结果与发布状态

修改前基线：`npm test` 为 36 个文件、883 通过 + 2 个既有预期失败；`npm run typecheck`、`npm run build` 通过。本地 smoke 19 项 PASS、1 项因未设置 BASE_URL 而 SKIP，脚本合计 20/20。

本轮完整验证结果：

| 检查 | 实际结果 |
|---|---|
| `npm test` | 37 个文件通过；906 个测试 = 904 通过 + 2 个既有预期失败；约 32.7 秒 |
| `npm run typecheck` | 通过 |
| `BASE_URL=http://localhost:3510` 下 `npm run build` | Next.js 16.3.4 生产构建通过；未修改用户的持久环境变量 |
| `npm run smoke -- http://localhost:3510/mcp` | 22/22 PASS，无 SKIP；包含绝对资产 URL、CSP、o-2 URI、first/diff 查询非唯一标记、零初速非自治查询 |
| 跨来源 mock-host | host:3520、sandbox:3521、Next:3510；widget 完成宿主连接及水合，实际显示画布与查询标记 |
| 显式一阶 query | 英文显示 `dy/dt = sqrt(y)` 与完整非唯一提示；画布点击新增曲线后 Undo 启用，新逆向曲线带非唯一提示 |
| 微分形式 query | 中文显示 `(-sqrt(y)) dt + (1) dy = 0`，无内部 x'=1 记号泄漏；保留两侧停止原因与非唯一提示 |
| 零初速 query | 实际界面显示 `t=1`、`(x,y)=(0,0.5)`，两方向完成 ±2 时段 |
| 网页诊断 | 实测一阶零平台/扫描分辨率、系统方向奇异点、下溢平台均可见 |
| 静态检查和独立审查 | `git diff --check` 通过；复核无循环依赖、checkpoint 不吞异常、原式完整通过实时 Scene、无伪造分析数据 |
| 归档完整性 | 16/16 来源全部收录；原文件 SHA-256 与索引一致；按正文转换规则逐份核对全文 |

本轮没有提交、推送或部署。临时测试页面与服务在验收后关闭。发布时需要重新以生产 BASE_URL 构建；部署 o-2 后在 Claude 中断开并重新连接连接器，使宿主读取新的 widget URI。真实 Claude 与触屏不在本轮已验证清单中。

<a id="current-limits"></a>

## 当前保留的限制

- 两个原有预期失败分别涉及尖点根定位导致的非唯一轨迹漏报、`x''=-x+x'/x'` 定义域边缘极限点被当作平衡点。本轮不调整这些根搜索机制。
- 用户指定不处理第 4 项：网页可构造 URL 解码器不能完整恢复的状态，例如超过 20 个轨迹初值。仅改输入范围时旧固定轨迹的停止框也仍沿用原积分数据。
- 类型识别、唯一性、连续平衡点识别和二阶仿射检测依赖有限采样；坐标查询不保证捕获相切事件或一步内偶数次穿越。
- 原轨迹、域边界和极端尺度性能的历史问题保留在原文中；本轮只对明确授权的三项提供修复结论。
- 真实 Claude 客户端、真实触屏、Google Sites 的实际嵌入尺寸与生产域名可达性属于独立验收环境；没有实测的项目不能据本地测试宣称已通过。

<!-- HISTORY_INDEX -->

<a id="history-index"></a>

## 历史记录索引与来源校验

共 16 份原始记录，以下 SHA-256 按原文件字节计算。归档正文仅统一换行并降低 Markdown 标题层级，代码围栏内的内容保持原样。

| 顺序 | 原始文件 / 归档位置 | SHA-256 |
|---|---|---|
| 1 | [P0-handoff.md](P0-handoff.md) · [本文全文](#history-p0-handoff) | `158dcedb6ae8b0603226fa6c3525bafa2a599ef81bd6ba285bf7e731de50eb42` |
| 2 | [NIGHT-summary.md](NIGHT-summary.md) · [本文全文](#history-night-summary) | `66e7cf0b0c1e8afca7e26ada3fc3c7c6163e0ede2288025b936d08a79f9eb838` |
| 3 | [NIGHT-decisions.md](NIGHT-decisions.md) · [本文全文](#history-night-decisions) | `7ec2c5d3667cbf68f829ade6087e58ad975f0d41886afefd35b84697348a49a3` |
| 4 | [NIGHT-open-questions.md](NIGHT-open-questions.md) · [本文全文](#history-night-open-questions) | `eca6f2c568f04045a5f3838f9859e22f48af9ed083ad0a685538420bd14d3aa2` |
| 5 | [FG-summary.md](FG-summary.md) · [本文全文](#history-fg-summary) | `6677ac556b5082c18c98b7a0b28cadc15c3955056ec7d2aff09a9823aa5739c7` |
| 6 | [FG-decisions.md](FG-decisions.md) · [本文全文](#history-fg-decisions) | `855f77c6685de51fd98f97ced61104632b526442ffb9fae0e6bd4dc734d6a6ea` |
| 7 | [FG-open-questions.md](FG-open-questions.md) · [本文全文](#history-fg-open-questions) | `2f690dde9ab711137387789f20c32111c436742bdf006ac0d110a95296d6b8b1` |
| 8 | [H-summary.md](H-summary.md) · [本文全文](#history-h-summary) | `83175d0fdb296b1dcf9342529a164d317b4dc670946fd369e56cf45a8fabd48d` |
| 9 | [H-decisions.md](H-decisions.md) · [本文全文](#history-h-decisions) | `10781bd06fe681ba8c3765cf15bc16a8fbb89d996eccaf803787e44664859f8a` |
| 10 | [H-open-questions.md](H-open-questions.md) · [本文全文](#history-h-open-questions) | `c51213764d46f5b2a92fcd56277042aacd6f56fccc0b86da5a45cc0e84f0cdac` |
| 11 | [IJKL-summary.md](IJKL-summary.md) · [本文全文](#history-ijkl-summary) | `455f80653b66f5b6e8e3bba47cc8317cf472746219b1f4b80f8d9a4e96fe61f0` |
| 12 | [IJKL-decisions.md](IJKL-decisions.md) · [本文全文](#history-ijkl-decisions) | `09e20450a6058620d8cc0607785ce4f23644fdbc918e41c3cdf84813e68d622e` |
| 13 | [IJKL-open-questions.md](IJKL-open-questions.md) · [本文全文](#history-ijkl-open-questions) | `445dc9c512fcec4aaaae9e7f155e37d4794e60005ca605ff658b268b307dc438` |
| 14 | [MNO-summary.md](MNO-summary.md) · [本文全文](#history-mno-summary) | `0a893a051e345ccebbdccb48385a32d5c30a509516ec77af8e5dcd53166318a0` |
| 15 | [MNO-decisions.md](MNO-decisions.md) · [本文全文](#history-mno-decisions) | `3427ee6cefff40320713c252139f83d15f6bda41a4dd82f1f57301d731ab1aeb` |
| 16 | [MNO-open-questions.md](MNO-open-questions.md) · [本文全文](#history-mno-open-questions) | `556fa57ad0de6c6e8add2d98431bb906211ddf28d672dc0c80b12b5c6c7ed6f3` |

<a id="history-archive"></a>

## 完整历史记录

<!-- BEGIN SOURCE P0-handoff.md -->
<a id="history-p0-handoff"></a>

## 历史 1：P0-handoff.md

来源：[P0-handoff.md](P0-handoff.md)。下文为阶段原记录，时间和状态保持当时口径。

### P0 交接：骨架轮完成（2026-09-02）

#### 状态

- **P0 验收线已过**：本地 `next start` 经 cloudflared 隧道接入 Claude 自定义连接器，调用 `ping` 工具后 widget 在对话里渲染出「connected to host」和 `{"message":"hello"}`。
- 未做：推到 GitHub（还没有 remote）、部署 Vercel。两者都是用户手动步骤，README 有说明。
- 仓库 `E:\project\vector-field-tool`，分支 main，6 个 commit，工作区干净。

#### 现有文件

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

#### 技术栈（已验证可装可跑）

next 16.3.4 · react 19.2.8 · @modelcontextprotocol/sdk ^1.30.0 · @modelcontextprotocol/ext-apps ^1.7.5 · zod ^4.5.4 · typescript ^5.9.3 · vitest ^4.1.11 · Node 24（≥20.9）。**不用 mcp-handler**：ext-apps 只兼容 sdk 1.x。

#### 这一轮学到的、下一轮必须遵守的

1. widget 资源地址是 `ui://vector-field-tool/ping.html?v=<版本>`。**改了 widget 就要改版本号，改了版本号 Claude 侧必须断开重连连接器**（它缓存工具列表里的资源地址，读旧地址会得到「Resource not found」并静默失败）。
2. 公网地址必须在构建时已知（`assetPrefix`）。隧道调试：`$env:BASE_URL="https://xxx.trycloudflare.com"; npm run dev`，隧道地址变了就重启。**不要在请求时改写 HTML 里的资源 URL**，Turbopack 按构建前缀识别 chunk，改了就静默不水合。
3. 资源 `_meta.ui.csp` 要声明 `connectDomains`、`resourceDomains`、`baseUriDomains`（都填自己的公网源）。
4. 根布局的 history 补丁不能删：Next 水合后的 `replaceState` 在 iframe 里抛 SecurityError，React 19 会卸载整棵树。
5. Claude 的请求特征：多个子客户端（Anthropic、Anthropic/Toolbox、Anthropic/ClaudeAI、claude-ai）各自 initialize，协议 2025-11-25；会先发一个带 `mcp-protocol-version: 2026-07-28` 的 `server/discover` 探测。
6. `lib/core` 的纯度由测试强制；工具 description 是给 AI 看的 prompt（P2 重点）。

#### 本地验证命令

```
npm test            # 10 个单测
npm run typecheck
npm run build
```

JSON-RPC 手测见 README「手动验证 MCP 端点」。不依赖 Claude 复现 widget 水合问题的方法见 README 排错一节。

#### 下一轮（P1）范围提示

按原始路线图：mathjs 解析、网格采样、RK4、数值求平衡点、雅可比特征值与稳定性分类，全部放进 `lib/core/`，用课本上有解析解的例子（线性系统、简谐振子、Lotka-Volterra）写 vitest。P1 不碰 MCP 工具和 widget（那是 P2/P3）。

<!-- END SOURCE P0-handoff.md -->

---

<!-- BEGIN SOURCE NIGHT-summary.md -->
<a id="history-night-summary"></a>

## 历史 2：NIGHT-summary.md

来源：[NIGHT-summary.md](NIGHT-summary.md)。下文为阶段原记录，时间和状态保持当时口径。

### 夜跑总结（2026-09-02 夜）

仓库已推到 GitHub：<https://github.com/Qscxds/vector-field-tool>（public，44 个提交、7 个 tag 与本地一致，2026-09-03）。

**跑到了哪个阶段**：A、B、C、D、E 五个阶段全部完成，之后又根据后台审查修了计算内核的 13 处 bug（`[A-fix]` 系列提交）。
**最后一个已知良好的 tag**：`night-final`（指向本总结的文档提交；最后一次代码提交是 `e93d525`，三绿验证就在它上面跑的）。分阶段回滚点：`p0-verified` → `a-core-done` → `b-tools-done` → `c-render-done` → `d-webshell-done` → `e-widget-done`。
**你需要手动验证**：(1) ~~Claude 里断开重连连接器后调用 `analyze_system`~~ 早上已验证通过（相图渲染正确）；随后修了一处抖动，资源版本现为 `widget.html?v=e-2`，重连后再次验证通过（图稳定、不抖）；(2) 用 `ping` 判断链路；(3) 推 GitHub、部署 Vercel（未做）。

#### 各阶段

| 阶段 | 内容 | 验证 | tag |
|---|---|---|---|
| A | `lib/core/`：parse、field、integrate（RK4 + Dormand–Prince）、jacobian、classify、equilibria、slope-field | 119 个单测（收工时全套 179 个），期望值全部手推 | `a-core-done` |
| B | `app/mcp/tools.ts` 四个工具 + ping；`lib/scene.ts` 结果契约；SDK 内存传输的协议级测试；`scripts/smoke.mjs` | 135 个单测；HTTP 冒烟 15/15 | `b-tools-done` |
| C | `lib/render/`（视口、箭头、刻度、颜色）+ `components/VectorFieldCanvas.tsx` | 155 个单测；tsc + build | `c-render-done` |
| D | `app/vector-field/` 网页外壳，7 个预设，点击加轨线 | 内置浏览器逐个点预设：画布非白像素 1.9 万到 2.6 万、平衡点列表与手推一致、错误横幅可读、控制台无 error | `d-webshell-done` |
| E | `app/widget/page.tsx` 用 Scene 渲染；四个工具挂 `_meta.ui.resourceUri`；版本号 `e-1` | 冒烟 15/15；本地模拟主机（不同源沙箱 iframe + 规范 CSP）中 `analyze_system` 与 `analyze_first_order` 两种场景渲染成功、握手与 size-changed 正常 | `e-widget-done` |
| 修复 | classify 容差与溢出、equilibria 二重根、slope-field 极点与自治性、integrate 边界情况、parse 安全加固 | 180 个单测；tsc；build | `night-final` |

所有偏离原文档的决定：`docs/NIGHT-decisions.md`。需要你拍板的事：`docs/NIGHT-open-questions.md`。

#### 审查结论

A 阶段结束后起了一组只读的对抗式审查子智能体，四个视角：数学正确性 14 条、数值积分 11 条、测试诚实性 17 条、解析器安全 9 条，共 51 条。我逐条核对后：

- **已修复（会影响学生所见的）**：classify 的绝对容差下限（慢系统误判非双曲）、星形/退化判据不一致、重根分支特征值不一致；equilibria 二重根被拆成多个假双曲点、盒边平衡点被丢、中心的迹精度依赖 tol；slope-field 把极点当平衡解、自治性探测可被绕过、切触型判据过严；integrate 的 `max_steps` 与恰好落点冲突、`atol=0` NaN 死循环、极小初始步误报、起点在盒外、选项不校验；parse 的 `x^1e-13` CPU 拒绝服务、深层嵌套抛 RangeError、参数名劫持、函数参数个数不检查、比较运算 1e-12 模糊带、非有限字面量。
- **测试收紧或补充**（没有放宽任何容差）：能量漂移 < 1e-8、一步 RK4 精确等于四阶泰勒、爆破测试下界、步长缩小只比控制器步、雅可比测试让固定步长必然失败、分类边界、孤立非双曲点、盒边点、解析器加固全套。
- **有意不修**（见 open-questions）：FSAL 未利用、盒外场无定义时的状态归类、`maxSpeed` 判据对刚性解、连续解集启发式、超大矩阵溢出、mathjs 的 `50%` / `2e-3x` 语法。
- **交叉验证已完成**（每条发现由一个「质疑者」和一个「复现者」独立判定）：**41 条被驳回**，其中绝大多数是因为验证时代码已经修好、无法复现，等于对上面那批修复的独立确认；**2 条有争议**（残差容差的机制描述、积分器跨过极小无定义区域），都属于已记录的已知限制；**8 条确认仍存在**，其中 1 条今晚随即修了（classify 在元素约 1e154 以上时行列式溢出，把双曲矩阵报成非双曲并附错误的 caveat；现在所有判定都在按最大元素归一化的矩阵上做，`9e56ea9`），其余 7 条是有意不修或只影响文档/测试的项：连续解集启发式、盒外场无定义时的状态归类、`maxSpeed` 对刚性解、FSAL 未利用、mathjs 的 `%` 与 `#` 语法、一条针对旧版雅可比测试的意见（新版测试已让固定步长必然失败）、以及「自适应误差与 rtol 成比例」这条我有意没写的测试。

#### 完整验证（收工前最后一次运行）

```
$ npx tsc --noEmit
(no output: ok)

$ npm test
 Test Files  11 passed (11)
      Tests  179 passed (179)
   Duration  1.68s (transform 690ms, setup 0ms, import 10.85s, tests 623ms, environment 1ms)

$ npm run build
✓ Compiled successfully in 252ms
┌ ○ /
├ ○ /_not-found
├ ƒ /mcp
├ ○ /vector-field
└ ○ /widget
```

```
$ git log --oneline
e93d525 [A-fix] parse: harden the public expression endpoint
1849cd4 [A-fix] jacobian tests: make the relative step and the explicit step observable
9b0bf86 [A-fix] integrate: option validation, exact-landing max_steps, atol=0 guard, tiny initial steps
563c38a [A-fix] slope-field: poles are not roots; stronger autonomy probe; polished multiple roots
8979edf [A-fix] equilibria: converge on step size too; keep edge equilibria
e5e1195 [A-fix] classify: purely relative tolerance; star/degenerate decided at the sqrt(tol) level
510a8e7 [E] widget: render tool Scenes with VectorFieldCanvas; all tools linked to the widget resource
2727980 [D] docs: decisions and open questions through the web-shell stage
1abbb5c [D] labels: never print -0
1346417 [D] web shell: /vector-field page with presets, click-to-trace, equilibria list
3028614 [D] labels: shared Chinese labels for classifications, statuses, stabilities; tools use them
fb597e3 [C] docs: decisions for the render stage
0d32e46 [C] components: VectorFieldCanvas draws a Scene (data props only)
ec2afaa [C] render: viewport mapping, arrow geometry, 1-2-5 ticks, magnitude colours
efb884c [B] chore: drop a review agent's scratch probe test that git add -A swept into 9d569e4; ignore lib/**/__probe__
35b86e8 [B] smoke: accept isError results for schema violations; decisions for the tools stage
9d569e4 [B] tools: analyze_system, trace_trajectory, sample_field, analyze_first_order
f4457cc [A] docs: decisions for the core stage
fb73203 [A] slope-field: dy/dx = g as x'=1, y'=g; equilibrium solutions of autonomous first-order equations
cdd3993 [A] equilibria: grid-seeded damped Newton with LM fallback, dedupe, classification
eda978d [A] classify: trace/determinant classification with honesty caveats
0904fff [A] jacobian: relative-step central differences, closed-form 2x2 eigenvalues
19191b5 [A] integrate: fixed-step RK4 and adaptive Dormand-Prince 5(4)
5e3a6b0 [A] field: regular-grid sampling with singular-sample bookkeeping
142354f [A] parse: mathjs AST whitelist compiler (types, compileSystem, compileScalar)
8ebccca [A] deps: add mathjs 15; start night-run decision log
d23b07c docs: P0 handoff, connector reconnect note after widget version bump
698845d chore(mcp): log one line per request in all environments (method, uri/tool, protocol version, UA)
a733236 docs: BASE_URL workflow and the three sandbox root causes
823b02b fix(widget): make the widget hydrate inside MCP host sandboxes
d511e0a fix(widget): declare csp.baseUriDomains and absolutize /_next asset URLs
7a11f5c fix(mcp): accept newer mcp-protocol-version headers, log requests in dev
6e0f4f5 feat: P0 skeleton - Next.js MCP server with ping tool and MCP Apps widget
```

```
$ git tag
a-core-done
b-tools-done
c-render-done
d-webshell-done
e-widget-done
p0-verified
```

#### 早上给你的验证清单（按最快发现问题排序）

1. **`npm test`**（几秒）。180 个全过才往下走。红了：`git reset --hard e-widget-done` 回到修复之前（五个阶段都在），或 `git bisect` 定位。
2. **`npm run dev`，打开 http://localhost:3000/vector-field**，逐个点 7 个预设：简谐振子应是同心圆的场、阻尼振子是内旋螺旋、Lotka–Volterra 有鞍点叉和 (1,1) 的问号圆、Van der Pol 从原点附近点击应出现极限环、单摆有交替的问号圆和叉、Logistic 有 y=0 红虚线和 y=1 绿实线。图不对：`git reset --hard d-webshell-done`。
3. **widget**：另开终端 `cloudflared tunnel --url http://localhost:3000`（如果原来的 cloudflared 还活着就用原地址），然后 `$env:BASE_URL="https://<隧道地址>"; npm run dev`。Claude 设置里把 vector-field-tool **断开再重连**，新对话说「用 analyze_system 分析 x' = x - x*y, y' = x*y - y，范围 -0.5 到 3」。应看到相图 widget。只有文字或空白：先用 ping 判断传输层，再看 README 排错一节；widget 弄坏了链路就 `git reset --hard d-webshell-done`（ping 仍在，widget 回到 P0 版）。
4. **`npm run smoke`**（要先起服务器）：15 项，含 widget HTML、CSP、版本号。
5. 想换回 P0 实机验证过的状态：`git reset --hard p0-verified`。

回滚只会动工作区里的代码；`node_modules` 不用重装。

#### 补记（写完总结后的三个提交）

上面「完整验证」里的 `git log` 是在这三个提交之前抓的，它们不改变验证结论（提交前又跑了一遍 vitest 和 tsc，179 个全过）：

- `[A-fix] classify: repeated-root branch reports the real repeated eigenvalue it decided on`
- `[A-fix] integrate tests: blow-up tests get a derived lower bound (t > 0.9, x > 9)`
- `docs: README and CLAUDE.md for the post-night state; ignore root-level review probes`

这三处改动其实一直在工作区里、也一直被每次门禁覆盖，只是早先那一轮 `git commit` 链因为 tsc 撞上审查子智能体的临时文件而中断，没有提交成功。`night-final` 标签已移到包含它们的最后一个提交。

<!-- END SOURCE NIGHT-summary.md -->

---

<!-- BEGIN SOURCE NIGHT-decisions.md -->
<a id="history-night-decisions"></a>

## 历史 3：NIGHT-decisions.md

来源：[NIGHT-decisions.md](NIGHT-decisions.md)。下文为阶段原记录，时间和状态保持当时口径。

### 夜跑决策记录（2026-09-02 夜）

所有偏离《多阶段无人值守夜跑》文档的决定和理由。按时间顺序追加。

#### 开工

- **停掉了本会话后台跑着的 `next start`（端口 3000）。** 夜里要反复 `npm run build`，构建会覆盖 `.next`，正在运行的生产服务器会读到半成品文件。隧道（cloudflared）没有动，早上重启服务器即可恢复连接器（README 有命令）。
- `git tag p0-verified` 打在 `d23b07c`（P0 交接文档那个 commit，也是 Claude 实机验证通过时的代码）。

#### A 阶段：计算内核

- **`eval(p, t = 0)` 多了一个可选的时间参数。** 文档白名单允许符号 `t`，但签名 `eval(p: Vec2)` 没地方传时间；与其让 `t` 永远等于 0 误导使用者，不如让积分器把当前时间传进去，非自治系统也能正确积分。所有下游模块都默认 `t = 0`。
- **解析白名单比文档略宽也略窄。** 放行 `ConditionalNode` 和比较运算符（`x > 0 ? 1 : -1` 这类分段右端在课上有用）；拒绝字符串字面量、`mod`、逻辑运算 `and/or/not`、阶乘等一切可能在求值期抛异常的构造。求值再包一层 try/catch，保证「eval 永不抛」。
- **参数名校验**：必须是合法标识符，不能与 `x y t pi e` 或白名单函数同名，值必须是有限数。
- **`left_box` 会保留越界的那个点**，这样画出来的轨线能碰到边框；文档只说「离开时停」，没说要不要保留。
- **自适应积分器步长塌缩到 `1e-12 * tSpan` 以下时报 `blew_up`**，因为这通常意味着解在有限时间内奇异；枚举里没有更贴切的状态。拒绝步（误差过大）不计入 `maxSteps`，但有 20 倍的总尝试上限防死循环。
- **`Trajectory` 多了 `steps` 字段**（接受的步数），自适应对比定步长的测试需要它。
- **classify 的容差按矩阵规模缩放**：实部比较用 `tol * scale`，行列式和判别式用 `tol * scale²`（它们是元素的二次量）。`scale = max(1, 最大元素绝对值)`。
- **caveat 用中文写**。它最终由 Claude 读给中文课堂的学生，中间少一次翻译。
- **雅可比含非有限值时 classify 返回 `non_hyperbolic` 加专门的 caveat**，不抛异常（文档没规定这种情况）。
- **equilibria 的连续解集判据**：找到 ≥3 个点且其中 ≥60% 是 `non_hyperbolic`（连续解集上雅可比必然奇异）→ `possible_continuum`；超过 `maxPoints`（默认 30）但大多数是双曲的 → `hit_limit`。两种都截断到 `maxPoints`。种子撒在格子中心而不是格点上，避开常见的边界奇点。牛顿收敛判据是残差 `|F| ≤ tol * max(1, 场强中位数)`，`tol` 默认 1e-9。
- **新增 `firstOrderEquilibria(expr, yRange)`**：文档要求 Logistic 方程给出 `y=0`、`y=1` 两条平衡线，但 `findEquilibria` 对 `x'=1, y'=g` 永远找不到平衡点（`f=1` 不为零）。一阶方程的平衡解是另一个概念（常数解），所以单独实现：先数值检查 g 与 x 无关，再在 y 上扫描符号变化并二分，对切触型零点做牛顿抛光，并按两侧符号给出 stable / unstable / semi_stable。
- **一处测试预期写错并改正**（不是改容差）：原本期望 `1/x` 在 `x=0` 处的中心差分给出非有限值，实际上差分模板取的是 `±h` 两点，结果是 `1e12` 这种有限大数；改为用 `sqrt(x)` 在 0 处（模板左点落在负数域）来测「非有限值不抛异常」。

#### B 阶段：MCP 工具层

- **工具注册放在新文件 `app/mcp/tools.ts`**，`server.ts` 只留 widget 资源、ping 和一行 `registerTools(server)`。文档说 B 只改 `server.ts`；拆文件是为了让 E 阶段改版本号时不用在几百行工具描述里翻找。`route.ts` 未动。
- **四个新工具用 SDK 的 `server.registerTool`，不带 `_meta.ui`**（B 阶段 widget 还不认识它们的结果）；E 阶段再切到 `registerAppTool` 并挂上资源地址。`ping` 保留原样，`structuredContent` 多了 `kind: "ping"` 便于 widget 分流。
- **结果契约 `lib/scene.ts`**：每个可视化工具的 `structuredContent` 都是一个 `Scene`（kind、system、box、field、trajectories、equilibria、firstOrder…），widget 和网页外壳都只消费这个类型。`analyze_system` 顺带返回一份场采样，这样 widget 一次调用就能画出完整相图。
- **参数越界的报错形式**：SDK 1.30 把 zod 校验失败转成 `isError: true` 的工具结果（文字里点名字段），而不是 JSON-RPC 错误对象；两种都是规范允许的，冒烟脚本和单测都按「二者之一」验收。表达式解析失败和盒子颠倒是我们自己抛的，也走 `isError` 结果，并说明是 f 还是 g 出错。
- **轨线点数上限 1000/方向**（均匀抽稀，保留末点），`trace_trajectory` 默认自适应积分、双向、观察盒 ±3 且离开盒子即停，防止 `tSpan=1000` 时返回十万个点。
- **结果摘要用中文**（分类名、状态解释、caveat 原文），description 用英文（给模型的指令）。
- **工具层测试不走 HTTP**：用 SDK 的 `InMemoryTransport` 连一个真实 `Client`，覆盖 tools/list、每个工具的正常与异常路径；HTTP 传输层由 `scripts/smoke.mjs`（`npm run smoke`）对 `next start` 验证。

#### B 阶段补记：误提交的审查探针文件

- A 阶段结束后我在后台起了一组只读的审查子智能体，它们按约定把临时测试放在 `lib/core/__probe__/`。我在 B 阶段用 `git add -A` 提交时把其中一个探针文件（`probe.test.ts`）一起扫进了 `35b86e8`（`b-tools-done` 所指的 commit）。已在 `efb884c` 从索引移除并把 `lib/**/__probe__/` 加进 `.gitignore`；没有改写历史，因为那个 commit 上 `npm test` 仍然是绿的，可二分性不受影响。之后所有 commit 都用显式路径 `git add`。

#### C 阶段：渲染核心

- **`arrowPolygon` 只返回箭头头部的三角形**（顶点、左翼、右翼），箭杆由渲染层画线；零长度或非正的 headSize 返回空数组。
- **`scaleArrows` 的输出类型**是 `ScreenArrow { from, to, color, mag, singular }`（屏幕坐标，以采样点为中心），奇异样本 `from === to` 并带 `singular: true`，由渲染层画成灰色小圆环；零向量画成小点。方向换算考虑了 x、y 两个方向不同的像素比例。
- **视口把盒子拉伸到整个画布**（x、y 可以不等比），不保留等比缩放：学生自己设范围，等比缩放会让范围和画面对不上。
- **刻度**只取 1、2、5 乘以 10 的幂，用对数距离选最接近目标数量的一档。
- **平衡点标记**：鞍点画叉；稳定画实心圆；不稳定画空心圆；星形/退化结点按迹的符号归入稳定或不稳定；`center_or_weak_spiral` 与 `non_hyperbolic` 画虚线圆加问号，表示「有保留」。
- 一阶方程的平衡解画成横线：稳定实线绿色、不稳定虚线红色、半稳定点线橙色。
- React 组件今晚只过 tsc 和 build，没有视觉验证（按文档）；D 阶段会用内置浏览器实际看图。

#### D 阶段：网页外壳

- **中文标签抽到 `lib/labels.ts`**（分类名、积分状态、平衡解稳定性、警告文案、数字/特征值格式化），MCP 工具摘要和网页外壳共用，避免两份文案漂移。`tools.ts` 相应改为引用它（这是 D 阶段对 B 文件的唯一改动）。
- **网页外壳在浏览器里直接跑 lib/core**（mathjs 打进客户端包），不经过 `/mcp`。两个外壳共用的是 core 与组件，不是彼此。
- **点击画布**从该点正、逆各积分 t = 50（自适应积分，离开盒子即停）；更换系统或类型时自动清空轨线。多次点击可叠加多条轨线。
- **没有安装 playwright**（150MB 浏览器下载，无人值守夜里不想赌它在 Windows 上能装上）。改用会话自带的浏览器面板做了等价的冒烟：打开 `/vector-field`，用脚本逐个点击 7 个预设，读取画布像素（每个预设非白像素 1.9 万到 2.6 万，采样 28.7 万），检查无错误横幅、平衡点列表内容与手推结果一致（阻尼振子 -0.25±0.968i，Van der Pol 0.5±0.866i，单摆 2kπ 中心/(2k+1)π 鞍点，Logistic y=0 不稳定 y=1 稳定），点击画布后轨线条数变为 1 且像素增加，输入 `xy` 时错误横幅显示可读的中文加提示。控制台无 error。
- 首页 `app/page.tsx` 没有加链接（文档要求 D 不改现有文件）；访问路径写在 README。

#### E 阶段：widget 接线

- **四个分析工具改用 `registerAppTool` 并挂 `_meta.ui.resourceUri`**，ping 不变。资源地址从 `ui://vector-field-tool/ping.html?v=p0-5` 改为 `ui://vector-field-tool/widget.html?v=e-1`，所以 **Claude 里必须断开重连连接器**。
- **widget 页面按容器宽度自适应画布**（ResizeObserver，320 到 760 像素，高度 0.68 倍），因为主机给 iframe 的宽度未知。
- **widget 只做静态渲染**（按文档），`VectorFieldCanvas` 没有传点击回调；网页外壳有点击加轨线。
- **E 阶段的验证超出了文档要求**：除了冒烟脚本（HTML 结构、版本号、CSP 齐全），还用一个扮演 MCP Apps 主机的本地页面（应答 `ui/initialize`、推送真实的 `tools/call` 结果作为 `ui/notifications/tool-result`）在不同源的沙箱 iframe 里加载 widget，验证了 `analyze_system`（Lotka–Volterra）和 `analyze_first_order`（Logistic）两种场景：握手完成、画布有内容、平衡点列表和 caveat 正确、`size-changed` 上报。Claude 实机仍需早上人工验证。

#### E 之后：对后台审查发现的核心 bug 的修复（`[A-fix]` 系列）

审查子智能体在 A 阶段结束后启动，三个视角（数学、数值、测试诚实性）在 E 阶段完成时返回了 42 条发现；安全视角与交叉验证在我收工时仍未返回。我自己核对后，确认为真 bug 且影响学生所见结论的，按「前面阶段的 bug 单独 commit 修」处理：

- **classify 容差改为纯相对**：原来的 `max(1, |J|)` 下限让系数很小的双曲系统（如 diag(-1e-5, -2e-5)）被判成非双曲。零矩阵仍报非双曲。
- **星形 / 退化结点判据改到 `sqrt(tol) * scale`**，与判别式容差（二次量）一致；重根分支统一报实重根 tr/2，避免「退化结点」旁边挂着一对复特征值。
- **equilibria 的牛顿收敛同时看步长**（≤ 1e-13 × 盒子尺度）：只看残差时，二重根（x'=x², y'=-y）会停在 ±√tol 处并被拆成多个「鞍点 / 结点」。盒边容差放宽到与去重半径相同，避免恰好落在边上的平衡点被丢掉。
- **slope-field 三处**：二分得到的候选必须满足 |g| ≤ tol，否则是极点（1/y 曾把 y=0 报成平衡解）；自治性探测改为盒子 x 范围内 7 个无理分数位置、以有限值最多的一列为基准、至少 3 次可比较，否则报「无法确认自治」；直接命中的样本也做牛顿抛光；切触型判据允许相等。工具和网页外壳都把盒子的 x 范围传进去。
- **integrate 四处**：全部选项做校验；恰好用满步数并落在终点报 `completed` 而非 `max_steps`；`atol = 0` 且分量恒为零时误差刻度加下限，避免 NaN 死循环；`hMin` 只在控制器确实缩过步之后才触发（用户给的极小初始步不再被误报 `blew_up`）；`hMax` 也约束第一步；起点在盒外直接报 `left_box`。
- **测试补强**（都是收紧或补充，没有放宽）：能量漂移再加一条 < 1e-8（可推导值约 1e-10）；一步 RK4 精确复现四阶泰勒多项式；步长缩小测试只比较控制器步（排除最后一步落点余量）；爆破测试加下界 t > 0.9（解在 t=0.999 前都很温和）；雅可比测试改到 x = 1e6 让固定步长必然失败，显式步长测试改用 x³ 让步长可观测；分类测试补齐中心 / 螺旋边界、慢系统、零矩阵、星形 / 退化边界；平衡点测试补孤立非双曲点、盒边点、中心的迹精度。
- **三处测试期望写错并改正**（推导错误，不是容差）：`f=x-1, g=y` 的雅可比是单位矩阵，是星形结点不是不稳定结点；`(y-1)^3` 的 y=1 是不稳定不是稳定；箭头多边形左右翼的正负号只是约定，改为比较集合。

#### 文档

- README 全面改写为夜跑后的状态；CLAUDE.md 加模块地图、诚实性与容差纪律、`git add` 显式路径的约定。

#### 安全视角返回后：解析器加固（`[A-fix] parse`）

- **`pow` 换成 JS 的 `**`**：mathjs 自带的 pow 对负底数会用 fraction.js 探测指数是否为有理数，`x^1e-13` 在 x<0 时单次 35 毫秒，采一张 20×20 的场要十几秒，是 7 个字符的 CPU 拒绝服务。JS 运算符对负底非整数幂直接给 NaN，与 predictable 模式的语义一致。
- **比较运算精度**：mathjs 默认 relTol 1e-12 的模糊带会让 `x < 1` 在 x = 1 - 1e-13 时为假。改为 relTol 1e-15、absTol 0，即机器精度。不能再低：floor/ceil/round 用 relTol 推小数位数，超过 15 位会抛异常（试过 1e-300，floor 直接失败）。
- **函数参数个数检查**、**参数名黑名单**（mathjs 常量与 Object.prototype 成员）、**非有限字面量拒绝**、**链式比较拒绝**、**所有解析/编译异常统一转 ParseError**（深层嵌套原来抛 RangeError）、**表达式长度上限 500**。
- **接受 `50%`**：mathjs 把它解析成 50/100 的普通除法节点，无法与除法区分，也无害。`#` 注释被 mathjs 解析器直接丢弃，同样无害。`2e-3x` 按 mathjs 语义是 0.002·x。
- **两处测试期望写错并改正**：`min(3, 1, 2)` 是 1 不是 0；`50%` 从「应拒绝」改为「应等于 0.5」。
- **tsconfig 排除 `lib/**/__probe__`**：审查子智能体在跑交叉验证时会不断创建、删除探针文件，tsc 曾因此报「文件不存在」。

#### 交叉验证返回后

- **classify 改为在按最大元素归一化的矿阵上判定**：元素约 1.3e154 以上时 a·d、b·c、tr² 会溢出，原先把双曲矩阵报成非双曲并附「特征值为零」的 caveat，与事实相反。分类对正数缩放不变，归一化后不可能溢出；特征值按比例缩回，`trace`/`determinant` 字段仍直接由 J 计算（极端情况下可能是 ±Infinity，字段注释已说明）。测试用课本表乘 1e200 与 1.4e154 推导期望值。
- 其余 7 条确认项有意不修，理由在 open-questions。41 条被驳回的发现几乎全是「验证时已修复、无法复现」，可视为对修复的独立确认。

#### 早上：Claude 实机验证后的 widget 抖动修复（`[E-fix]`）

- **E 阶段在 Claude 实机里渲染通过**（analyze_system 的 Lotka–Volterra 相图、平衡点列表、caveat 都出现）。
- **抖动原因**：画布宽度按带内边距的容器外宽减 2 计算，横向溢出 18 像素；widget 内一旦出现纵向滚动条又会吃掉约 15 像素宽度，画布随之变窄变矮、内容装得下、滚动条消失、宽度回涨、再溢出，形成振荡，每轮还向主机上报一次尺寸。
- **修法**：画布宽度取一个无内边距的内层容器；widget 文档 `html, body { overflow: hidden }`（主机靠 size-changed 调高，不需要内部滚动条）；宽度变化不足 4 像素不重绘。资源版本升到 `e-2`，需要重连连接器。

<!-- END SOURCE NIGHT-decisions.md -->

---

<!-- BEGIN SOURCE NIGHT-open-questions.md -->
<a id="history-night-open-questions"></a>

## 历史 4：NIGHT-open-questions.md

来源：[NIGHT-open-questions.md](NIGHT-open-questions.md)。下文为阶段原记录，时间和状态保持当时口径。

### 夜跑待决事项（2026-09-02 夜）

需要你拍板的事、被标记的失败测试、性能异常、工具安装情况。没有的项写「无」。

#### 需要你拍板

- **`possible_continuum` 的判据是启发式的**：找到 ≥3 个点且 ≥60% 非双曲就报连续解集。一个真有 3 个以上退化平衡点的系统会被误报（审查也指出了这一点）。可选改法：加几何判据（点是否共线）或去掉这条规则只保留数量上限。
- **`maxSpeed = 1e6` 的爆破判据**会把 x' = -1e7·x 这类速度极大但有界衰减的刚性解在起点就判成 `blew_up`。课堂例子里遇不到，但如果要教刚性方程需要换判据（例如只看位置是否非有限）。
- **场在观察盒外无定义的系统**（如含 sqrt 的右端）离开盒子时，可能因为积分级在盒外求值失败而报 `blew_up` 而不是 `left_box`；积分器也可能一步跨过一个很小的无定义区域而报 `completed`。都不影响课堂例子，记录在此。
- **caveat 与结果摘要用中文、工具 description 用英文。** 如果有英文学生，caveat 需要双语。
- **网页外壳把 mathjs 打进了浏览器包**（几百 KB）。在意首屏体积可以改走 `/mcp`。
- **对角化矩阵在容差带内会被叫成星形结点**：`diag(1+1e-6, 1-1e-6)` 的两个特征值相差 2e-6，我们在 1e-9 相对精度下称之为重根并报星形结点。这是「分不清就诚实地归为重根」的选择，但和「它明明有两个不同特征值」的直觉相反，你可能想在文案里说明。

#### 被标记的失败测试

无。171 个测试全部通过，没有 `it.skip` / `it.fails`。夜里有五处测试期望被改动，全部是推导错误的改正或收紧，逐条记录在 NIGHT-decisions.md（雅可比奇异点选错、SDK 错误包装形式、单位矩阵是星形结点、(y-1)³ 不稳定、箭头翼正负号约定）。

#### 后台审查里没有处理的发现

审查（数学 / 数值 / 测试诚实性三个视角）共 42 条，已修复的见 NIGHT-decisions.md「A-fix」一节。以下有意未动：

- integrate：`accept()` 会重复求一次场值、DOPRI5 的 FSAL 性质没用上（每步多算一次右端）。性能问题，n 最多几千，可读性优先。
- integrate：缺「自适应全局误差与 rtol 成比例」的测试。控制器的比例关系不是严格可推导的，怕写成凑数的期望值，没加。
- ~~classify：元素大到 1e154 以上时行列式溢出会误报非双曲~~ 已修（按最大元素归一化后再判定，`9e56ea9`）。
- equilibria：`possible_continuum` 启发式（见上）。
- 安全视角已返回并处理（见「补记」）。

#### 性能

- 全套 `npm test` 约 2 到 3 秒；`next build` 约 30 秒。`analyze_system` 在 12×12 种子、20×20 网格下单次约 50 到 300 毫秒。没有做基准测试。

#### 工具安装

- **playwright：未安装**（150MB 浏览器下载，无人值守夜里不赌它在 Windows 上能装好）。改用会话自带的浏览器面板做了等价的冒烟，步骤与结果见 NIGHT-decisions.md「D 阶段」。

#### 其他

- `b-tools-done` 所指 commit 里混进了一个审查子智能体的临时探针测试文件，下一个 commit 已移除并加了 `.gitignore`（`lib/**/__probe__/`）。历史未改写。
- 我在夜里停掉了会话后台的 `next start`（端口 3000）和 cloudflared 没动。早上要重新 `$env:BASE_URL=<隧道地址>; npm run dev`（或 build + start）才能恢复连接器；如果 cloudflared 也重启了，隧道地址会变，连接器 URL 要一起改。

#### 补记：安全视角已返回

安全视角共 9 条，除以下两条外都已修复（见 NIGHT-decisions.md「解析器加固」）：

- mathjs 的隐式乘法语义 `2e-3x` = 0.002·x、`50%` = 0.5、`#` 后为注释。这是 mathjs 的既定语法，没有改；如果要对学生隐藏这些，需要在 parse.ts 里对原始字符串做额外拒绝。
- 51 条发现的两两交叉验证已完成：41 条驳回（多数因已修复而无法复现）、2 条有争议、8 条确认。确认项里 classify 的大数溢出已修（`9e56ea9`），其余 7 条就是本文件「后台审查里没有处理的发现」一节列出的那些。

<!-- END SOURCE NIGHT-open-questions.md -->

---

<!-- BEGIN SOURCE FG-summary.md -->
<a id="history-fg-summary"></a>

## 历史 5：FG-summary.md

来源：[FG-summary.md](FG-summary.md)。下文为阶段原记录，时间和状态保持当时口径。

### S/F/G 轮总结（2026-09-03）

- **做到哪了**：推 GitHub、S 探针、F（微分形式 + 类型识别 + 恰当方程隐式解）、G（双语文案表 + `locale` 参数 + 等比视口 + 缩放/平移/复位 + hover 预览 + widget 本地计算）全部完成，加一个 `[G-fix]`；tsc 0 错误、252 个测试全绿、build 通过；main 线性、每阶段有 tag；已推 origin。
- **待人工**：Claude 实机重连连接器（widget 版本 e-2 → g-1），在对话里验证 widget 的滚轮 / 拖动 / 悬停 / 点击；看 Claude 是否按规则传 `locale`。
- **有风险的地方**：G 阶段决定「平衡点列表跟随可见范围」「固定轨线按可见范围三倍积分」「hover 400 步预算」，都在 FG-open-questions 里列出等你拍板；英文文案无母语校对。

**S 结论（单独一行）**：沙箱里 `new Function` 被 CSP 挡住，但 mathjs `compile()` 不依赖 eval，编译 < 1 毫秒、RK4 2000 步 13.2 毫秒 —— 走「eval 可用」路线，widget 直接用 `lib/core`，不写解释器。

---

#### 各阶段与 tag

| 阶段 | 内容 | tag / 提交 |
|---|---|---|
| 前置 | 推 GitHub（<https://github.com/Qscxds/vector-field-tool>），README / NIGHT-summary 顶部写入仓库地址 | 首推 44 提交 7 tag |
| S | 沙箱探针（结果见上、详见 FG-decisions）；探针文件已删，不入库 | `s-spike-done` |
| F | `FirstOrderSpec` 微分形式底层、常数解沿直线检验、方向场奇点、`detect-form` 七种形式 + caveat、`exact` 势函数 + `contours` 等值线、`analyze_first_order` 接受 `expr` 或 `M`+`N` | `f-forms-done` |
| G1–G5 | `lib/labels.ts` zh/en 键表 + 键集合测试；classify caveat 改 key；工具 `locale` 参数；网页外壳语言切换、微分形式输入；`fitViewport` / `zoomAt` / `panBy` / `resetViewport`（光标不动不变量测试）；两层 canvas、hover 节流、点击固定、双击复位；共用 hook `useInteractiveScene` | `g-render-done`（提交 e83e780） |
| G6 | widget 本地编译 Scene 里的方程，缩放 / 平移 / 悬停 / 点击，编译失败退回静态图；`WIDGET_VERSION` g-1 | `g-widget-done`（提交 0432189） |
| G-fix | 常数解穿过奇点时不再因探测点恰好落在奇点上而被整条否定（widget 平移时发现） | `g-widget-done` 之后的 `[G-fix]` 提交 |
| 文档 | 本文件、FG-decisions、FG-open-questions、CLAUDE.md、README | `[G] docs` 提交 |

回滚：`git checkout <tag>` 或 `git reset --hard <tag>`。`f-forms-done` 是 G 之前的最后一个稳定点（widget 版本 e-2，只有中文文案）；`g-render-done` 是 widget 改动之前的点（网页外壳已有全部交互，widget 仍为静态 e-2）。

#### 验证输出（最终状态）

```
$ npx tsc --noEmit
(无输出) exit 0

$ npx vitest run --exclude "**/__probe__/**"
 Test Files  17 passed (17)
      Tests  252 passed (252)
   Duration  2.98s

$ npm run build
✓ Compiled successfully
  Finished TypeScript
┌ ○ /
├ ○ /_not-found
├ ƒ /mcp
├ ○ /vector-field
└ ○ /widget
```

测试数变化：F 结束 218 → G 结束 252（labels 键表 7、viewport 8、interactive 6、tools locale 4、slope-field 奇点 3，以及若干改写）。

##### 浏览器实测（网页外壳，本地 `next start`，Chromium）

- 页面按 `navigator.language` 以中文打开，右上角可切英文。
- 简谐振子：悬停出现经过光标的圆（预览），滚轮向上后「实际显示范围」从 x∈[−4.154, 4.154] 缩到 x∈[−2.21, 3.087]（光标侧不动），页面 `scrollY` 保持 0（滚轮没有滚动页面）；拖动后范围平移到 x∈[−0.444, 4.853]；双击后回到 x∈[−4.154, 4.154]，y∈[−3, 3]。
- 双击原来会多加两条轨线（第一版实测「清除轨线（2 条）」），加 220 毫秒单击延迟后为 0 条；单击一次为 1 条。
- 「圆族 x dx + y dy = 0」预设：无向线段 + 紫色等值线 + 奇点圆环，指针放在原点处 overlay 只画提示文字、不画曲线（脚本检查 overlay 像素）；离开原点后出现预览圆。类型列表：可分离、齐次、Bernoulli（n ≈ −1）、恰当，各带证据和 caveat。

##### widget 模拟主机实测（`harness_e.py`，规范 CSP，不同源 iframe，工具 `analyze_first_order` M = 2xy, N = x²+y², locale zh）

```
probe: {"cspViolation":"script-src","blocked":"eval"}        <- zod 启动时的已知探测，无害
<- ui/initialize (app {"name":"vector-field-tool-widget","version":"0.3.0"})
<- initialized; sending tool-input then tool-result
probe: {"harness":"after-3s","canvas":true,"canvasSize":[640,435],"nonWhite":8978,
        "text":"vector-field-tool\nconnected to host\n\n实际显示范围（等比缩放后）：x∈[-2.943, 2.943]，y∈[-2, 2] · 悬停预览解曲线 · 点击固定 · 滚轮缩放 · 拖动平移 · 双击复位\n\n(2*x*y) dx + (x^2 + y^2) dy = 0\n\n..."}
<- size-changed {"width":680,"height":748}
```

「实际显示范围」这一行只在本地编译成功的交互路径上出现，说明 widget 在沙箱 CSP 下编译并重算成功。之后在 iframe 里滚轮、拖动、悬停：视图放大并平移、出现悬停预览曲线，host 收到 size-changed 更新。

#### 明早检查清单

1. **重连连接器**：Claude → Connectors → Vector Field Tool → 断开 → 重新添加 `https://academic-airplane-silk-hanging.trycloudflare.com/mcp`（夜里旧隧道已断，我重新起了 cloudflared 得到这个新地址，本地 `next start` 已用它作 BASE_URL 重新构建并在 3000 端口运行，隧道 GET /mcp 返回 405、smoke 全过；cloudflared 若再重启地址还会变，那就改 BASE_URL 重建）。
2. 对话：「用 analyze_system 分析 x' = x - x*y, y' = x*y - y」→ widget 里滚轮、拖动、双击、悬停、点击各试一次；再用英文问一次同样的问题，看摘要是否英文（`locale` 默认 en）、用中文问看是否传了 `zh`（服务器日志里 tools/call 一行看不到参数，看摘要语言即可）。
3. 对话：「分析 2*x*y dx + (x^2 + y^2) dy = 0」→ 应出现紫色等值线、奇点 (0,0)、常数解 y = 0（稳定性随 x 变化）、四种形式各带 caveat。
4. 看 FG-open-questions 里 G 阶段的 8 条待拍板项。
5. 若 widget 交互在 Claude 里有问题而网页外壳没有：先看 iframe 控制台是否出现 `localComputeUnavailable` 文案（编译被挡）；回滚点 `g-render-done`（widget 回到静态 e-2，需再次重连连接器）。

<!-- END SOURCE FG-summary.md -->

---

<!-- BEGIN SOURCE FG-decisions.md -->
<a id="history-fg-decisions"></a>

## 历史 6：FG-decisions.md

来源：[FG-decisions.md](FG-decisions.md)。下文为阶段原记录，时间和状态保持当时口径。

### F/G 轮决策记录（2026-09-03）

所有偏离《推 GitHub + F/G 两阶段》文档的决定和理由。按时间顺序追加。

#### 前置：推 GitHub

- 仓库 <https://github.com/Qscxds/vector-field-tool>，public。推之前自检：工作区干净；`git grep` 扫描 token / 密钥 / 隧道地址，只找到文档里的占位符 `xxxx.trycloudflare.com` 和测试里的 `example.trycloudflare.com`，没有真实地址；`.gitignore` 覆盖 `node_modules`、`.next`、`lib/**/__probe__/`、`__probe*`。推完核对：远端 44 个提交、7 个 tag，与本地一致。
- 用户留言时我已经推完（gh 在会话开始前就是已认证状态），没有中断 S 阶段。

#### S 阶段：沙箱里能不能本地算

实测环境：E 阶段的本地模拟主机（不同源沙箱 iframe，`sandbox="allow-scripts allow-same-origin"`，CSP 按 MCP Apps 规范默认值构造：`script-src 'self' 'unsafe-inline' <resourceDomains>`，**没有 `unsafe-eval`**）。探针临时加在 widget 页面里，读完结果后已删除，没有进入任何提交。

| 探测 | 结果 |
|---|---|
| `new Function('return 1+1')()` | **被挡**：`EvalError: Evaluating a string as JavaScript violates the following Content Security Policy directive because 'unsafe-eval' is not an allowed source of script` |
| mathjs `compileScalar('x^2+y^2')({x:1,y:2})` | **成功，返回 5**。mathjs 15 的 `compile()` 把 AST 编成闭包，不生成代码字符串；仓库里 `grep "new Function("` 在 mathjs 运行时代码中零命中（之前看到的 `new FunctionNode` 是构造函数调用，不是 eval） |
| 编译一次 | < 1 毫秒 |
| RK4 2000 步（简谐振子，h = 0.01，共 1.6 万次表达式求值） | **13.2 毫秒**，status completed |
| 唯一的 CSP 违规报告 | zod 启动时的 `new Function` 探测（已知、无害，zod 自己捕获） |

**结论与路线**：`unsafe-eval` 确实不可用，但我们唯一依赖的东西（mathjs 编译求值）不需要它。**走「eval 可用」那条路**：F 和 G 照文档正常做，widget 直接用 `lib/core`，不实现解释器，`compileSystem` 不加 `mode` 参数。文档里为「eval 被挡」准备的解释器方案不需要了；若将来 mathjs 改用代码生成，`lib/core/parse.ts` 头部注释已写明这个依赖。

**hover 预算**：2000 步 13 毫秒 ≈ 每步 6.6 微秒（含两次表达式求值和 RK4 四级）。一帧 16 毫秒里留一半给绘制，hover 曲线正逆各 ≤ 400 步（约 5 毫秒），用 `requestAnimationFrame` 节流；缩放平移后重采样 20×20 场（400 次求值，约 0.5 毫秒）可以每帧做。

**注意**：这是在模拟主机的规范默认 CSP 下测的，不是 Claude 实机；Claude 只可能更严（去掉 `unsafe-inline` 等），而 mathjs 编译路径不依赖任何 CSP 放行，所以结论对 Claude 同样成立。E 阶段在 Claude 实机里已经证明 widget 的 JS 能跑（包括 mathjs 所在的同一份 bundle 中的 ext-apps 代码），只是当时没有调用 compile。

#### F 阶段：一阶方程重构

- **`FirstOrderSpec` 两种变体都带可选 `params`**（文档的类型里没有），与 `SystemSpec` 一致；`toSystem` 输出 `x' = N, y' = -(M)`，显式形式给出与旧行为完全一致的 `x' = 1, y' = g`。旧的 `firstOrderToSystem(expr, params)` 保留为薄封装，网页外壳还在用它，G 阶段再改。
- **常数解判据按文档改为逐条直线检验**：候选来自参考列 x_ref 上 M(x_ref, c) 的零点，再在盒子 x 范围内 7 个无理分数位置逐个核对 M(x, c) = 0 且 N(x, c) ≠ 0。于是非自治方程（如 dy/dx = x(y−1)）的常数解也能找到；稳定性在各探测 x 上不一致时报新增的 `varies`。`autonomous` 标志保留为信息字段，不再是前置条件。
- **方向场奇点直接复用 `findEquilibria`**：M = N = 0 恰好是系统 x' = N, y' = −M 的平衡点；把它给出的分类丢掉（对方向场没有意义），只留位置和截断警告。显式形式 N = 1 永远没有奇点。
- **类型识别的容差**：直接求值的恒等式（可分离、自治、齐次）用相对偏差 1e-8；含有限差分的（对 y 线性、恰当、积分因子）用 1e-6。采样点在盒子的无理分数位置（0.2137、0.3819、0.5773、0.7071、0.866、0.4472、0.6281 等）。少于 5 个有效点的形式不报（既不肯定也不否定）。
- **Bernoulli 的判法**：对固定 x，把 g/y 拟合成 a + b·y^(n−1)：用三点比值方程在 m = n−1 ∈ [−6, 6] 上扫描符号变化再二分，排除平凡根 m = 0，用另外两点核对，并要求三个不同 x 处的 n 一致（差 ≤ 1e-6），且 b 不为零（否则是线性）。指数 n 写进证据和 `details.n`。
- **恰当优先于积分因子**：恰当时 μ = 1 平凡，不再重复报两种积分因子。
- **证据与 caveat 的双语文案放在 `lib/core/detect-form.ts` 里**（按 `locale` 参数），与 classify 的 caveat 同一做法：core 可以包含面向学生的字符串。`detectForms` 的 `locale` 默认 `en`（与 G1 的工具默认值一致），F5 的工具层暂时传 `zh`，G1 加 `locale` 参数后改为透传。
- **F4 做完了，包括等值线**：势函数用复合 Simpson（每段默认 64 格，多项式被积函数精确）沿两条路径积分，路径差作为恰当性的独立自检；等值线用 marching squares（`lib/render/contours.ts`，60×60 网格，鞍点格用中心值消歧）。只在 `detectForms` 报恰当且路径自检通过时才把等值线放进 Scene。
- **`Scene.fieldStyle`** 加在 Scene 顶层而不是 firstOrder 里，因为渲染层对任何 Scene 都要知道画箭头还是线段。`FirstOrderView.expr` 从「g 的表达式」变成人可读的方程文本（显式：`dy/dx = g`；微分：`(M) dx + (N) dy = 0`），widget 的摘要直接显示它。
- **工具的两种输入互斥**：`expr` 或 `M`+`N` 恰好给一个，否则返回可读的 isError；解析失败时点名是 g、M 还是 N。

#### G 阶段：双语、等比视口、缩放平移、hover、widget 本地计算

- **文案表结构**：`lib/labels.ts` 变成 `LABELS.zh` / `LABELS.en` 两张同构表（`classification`、`stability`、`status`、`warning`、`caveat`、`form`、`tool`、`ui`），`labels(locale)` 查表，`fill()` 填 `{name}` 占位符。`lib/labels.test.ts` 用递归键路径比较两张表的键集合、检查每个叶子非空、检查占位符两边一致。`classify` 的 `caveat` 从中文句子改为 key（`center` / `nonHyperbolic` / `notFinite`），展示层查表；`detect-form` 的证据与 caveat 仍按 F 阶段决定留在 core 里按 `locale` 生成（它们含具体数字，不适合模板表）。
- **`locale` 参数**：四个工具都加 `locale: z.enum(["zh","en"]).default("en")`，description 里写「学生用中文提问就传 zh，否则 en」；Scene 带 `locale`，widget 据此选表。错误信息（参数校验、解析失败）仍是英文——那是给模型看的，不是给学生看的。
- **网页外壳语言**：初始 `en`，挂载后按 `navigator.language` 切换（组件状态，不用 localStorage，按文档），右上角下拉可改。预设名称与说明双语。
- **等比视口**：`fitViewport` 以盒子中心为中心、取两轴中较小的像素比例、把短的一边对称扩大。输入 x∈[−3,3]、y∈[−3,3] 在 720×520 画布上实际显示 x∈[−4.15,4.15]，图下用一行小字给出「实际显示范围」。
- **缩放不变量**：`zoomAt(v, p, k)` 保持屏幕点 p 下的世界坐标不动（测试直接断言 `screenToWorld` 前后相同，误差 1e-9）；缩放倍数相对原始盒子限制在 1/50..50（`ZoomLimits`），`panBy` 让内容跟着鼠标走，`resetViewport` 回到 `fitViewport`。滚轮系数 `exp(−deltaY·0.0015)`，每次夹在 0.5..2。
- **视图变化时算什么**：场每次视图变化都重采样（密度²次求值，亚毫秒）；平衡点 / 一阶特征（常数解、奇点、类型、等值线）对**可见范围**重算，但在停止操作 250 毫秒后才做（`FEATURE_DEBOUNCE_MS`），因为恰当方程的等值线要几百毫秒。于是平移出去能发现新的平衡点，列表跟随视野。
- **hover**：`onHoverWorld` 只记录最新位置并用 `requestAnimationFrame` 节流；一帧里若指针移动不到 3 像素就不算；正逆各最多 400 步（S 阶段实测 2000 步 13 毫秒）；指针在方向场奇点 8 像素内不画曲线，改在光标旁写「此处靠近方向场奇点，方向无定义」。预览画在单独的 overlay canvas 上，底层（场、等值线、固定轨线、标记）只在 Scene 或视口变化时重画。
- **固定轨线**：点击时用可见范围每边各扩一倍（三倍大小）的盒子做停止条件，tSpan 50，正逆各一条；这样之后缩小视野轨线仍在。**单击延迟 220 毫秒**报告，双击时取消——浏览器实测双击会先触发两次 pointerup，不延迟就会在复位前多画两条轨线。
- **共用 hook**：交互状态机 `components/useInteractiveScene.ts` 由网页外壳和 widget 共用（架构规则 3）；纯计算部分（`computeFeatures`、`expandBox`、`traceBoth`）放在 `lib/interactive.ts` 并有测试。网页外壳只剩表单。
- **widget 本地计算**：Scene 已带 `system` 与 `firstOrder.spec`，widget 用同一份 `compileSystem` 编译；编译抛异常（沙箱不允许）时退回服务器给的静态图并显示 `ui.localComputeUnavailable`。`WIDGET_VERSION` e-2 → g-1，widget `appInfo.version` 0.3.0。在本地模拟主机（规范 CSP，不同源 iframe）验证：握手正常、画布有内容、滚轮缩放、拖动平移、悬停预览都工作，size-changed 正常上报；唯一的 CSP 违规仍是 zod 启动时那次已知的 `new Function` 探测。
- **两处测试期望修正（不是容差）**：`labels.test` 原来断言每条 caveat > 60 字符，中文的 `notFinite` 只有 43 字却是完整句子，改为「> 30 字且以句号结尾」；`interactive.test` 原来断言离盒轨线终点 ≤ 6.1，但积分器（A 阶段起）记录第一个盒外点，f = 1 的自适应步长到边界时已长到约 1.8，改为「末点在盒外、倒数第二点在盒内」。
- **提交拆分**：文案表迁移迫使 tools、网页外壳、widget、画布在同一提交里改（旧导出没了就编不过），所以 G1 与 G2–G4 的界面部分合在 `45df4de` 一个提交；纯函数（viewport）和 hook/widget 各自独立提交。tag `g-render-done` 打在 hook 提交上，`g-widget-done` 打在 widget 提交上。

#### G-fix：穿过奇点的常数解

在 widget 里平移 2xy dx + (x²+y²) dy = 0 时发现：原始范围 [−2,2]² 报「没有常数解」，平移后的范围却报「y = 0，稳定性随 x 变化」。推导：沿 y = 0 有 M = 0、N = x² ≠ 0（x ≠ 0），dy = 0 在奇点 (0,0) 两侧都成立，y = 0 确实是常数解；x > 0 一侧吸引（斜率 ≈ −2y/x）、x < 0 一侧排斥，所以 `varies` 是对的。原代码要求每个探测 x 处 N ≠ 0，对称范围的中点探测 x = 0 正好落在奇点上，于是整条线被否定——答案随范围是否对称翻转，这不能接受。修正：探测点上 M = N = 0 视为「线穿过奇点」而跳过（既不算反例也不算证据），要求至少 3 个有效探测点，稳定性也只在有效探测点上比较；`y dx + y dy = 0` 这种整条线都奇异的情况仍然不报。新增 3 个测试，期望值来自上面的推导。提交 `[G-fix] slope-field: ...`，在 `g-widget-done` 之后。

<!-- END SOURCE FG-decisions.md -->

---

<!-- BEGIN SOURCE FG-open-questions.md -->
<a id="history-fg-open-questions"></a>

## 历史 7：FG-open-questions.md

来源：[FG-open-questions.md](FG-open-questions.md)。下文为阶段原记录，时间和状态保持当时口径。

### F/G 轮待决事项（2026-09-03）

需要你拍板的事、被标记的失败测试、性能异常。没有的项写「无」。

#### 需要你拍板

##### F 阶段

- **类型识别的容差**（直接恒等式 1e-8、差分恒等式 1e-6）是我定的。太严会漏掉真形式（例如含 exp 的表达式在大参数下的舍入），太松会误报；课本例子全部正确通过，但没有大规模验证。
- **Bernoulli 指数搜索范围 [−6, 6]**、步长 0.05：课本上 n 一般是 2、3、−1、1/2，够用；更怪的指数会被判成「不是」。
- **恰当方程的等值线只在路径自检通过时才画**；若判定恰当但路径差超 1e-6（数值噛合不好的表达式），图上就没有紫线，摘要也不提。可以考虑把这种情况明确告诉学生。
- **`varies`（稳定性随 x 变化）是新加的稳定性取值**，网页外壳和 widget 的文案表都补了；如果你不想让学生看到这个概念，可以在工具层折叠成「无法一言概括」。

##### G 阶段

- **工具默认语言 `en`**：文档要求「中文提问用 zh，其他一律 en」，description 里写了这条规则；但 Claude 是否每次都记得传 `locale` 要看实际对话。若发现它经常漏传，可以考虑默认改成 `zh`（你的学生主要是中文使用者）。
- **英文文案是我写的**，术语按英式拼写（centre、linearisation）；没有母语者校对。
- **缩放后平衡点列表跟随可见范围**（停止操作 250 毫秒后重算）。教学上这意味着「平移出去就能找到新的平衡点」，但也意味着列表和 Claude 最初报告的那份结果可能不一致（范围不同）。另一种做法是列表固定为输入范围，只让图动。我选了前者。
- **固定轨线的积分范围是可见范围的三倍**（每边各扩一倍），超出就停。放大很多倍再点击时，轨线会在离视野很近的地方停下（显示为「离开了观察范围」）。是否改为按输入范围或更大范围积分，请你决定。
- **hover 预算 400 步/方向**：足够画出屏幕上的一段曲线，但刚性方程或极快的场里预览曲线会比固定轨线短（预览和固定后的曲线长度不同）。可以调高，代价是低端机上 hover 卡顿。
- **网页外壳 y 轴保持等比**，输入 x∈[−3,3]、y∈[−3,3] 在 720×520 的画布上实际显示 x∈[−4.15,4.15]。这是文档要求的，但学生会看到「实际显示范围」和输入不同，我在图下面用一行小字说明了。
- **单击延迟 220 毫秒**（为了区分双击复位）。因为悬停已经在实时预览同一条曲线，这个延迟看不出来；但如果以后加「点击其他东西」的交互要留意。

#### 被标记的失败测试

无。有两处是测试期望写错（不是容差问题），已按推导改正并在 FG-decisions 里记录：`labels.test` 的 caveat 长度阈值改为「以句号结尾且 > 30 字」；`interactive.test` 的离盒终点改为「最后一点在盒外、倒数第二点在盒内」（积分器记录第一个盒外点，这是 A 阶段就定下的行为）。

#### 性能

- 网页外壳与 widget 的 hover：每帧最多正逆各 400 步（约 5 毫秒）；缩放/平移时每帧重采样 20×20 场（约 0.5 毫秒）；平衡点 / 一阶特征在停止操作 250 毫秒后重算（恰当方程含等值线约 0.3 到 0.6 秒，这段时间图先动、列表后更新）。没有做低端机测试。
- `analyze_first_order` 服务器端耗时同 F 阶段（恰当方程 0.3 到 0.6 秒）。

#### 其他

- **常数解穿过奇点时的判定**（见 FG-decisions「G-fix」）：2xy dx + (x²+y²) dy = 0 的 y = 0 是常数解，但它穿过奇点 (0,0)。修正前只要某个探测 x 恰好落在奇点上（对称范围时 x = 0 正好是探测点）就整条否定，结果随范围是否对称而翻转；修正后奇点处的探测点跳过、要求至少 3 个有效探测点。这一修正是 G 阶段在 widget 里平移时发现的。
- Claude 实机验证 widget 的交互（滚轮、拖动、悬停、点击）还没做；本地模拟主机在规范 CSP 下验证过。见 FG-summary 的清单。

<!-- END SOURCE FG-open-questions.md -->

---

<!-- BEGIN SOURCE H-summary.md -->
<a id="history-h-summary"></a>

## 历史 8：H-summary.md

来源：[H-summary.md](H-summary.md)。下文为阶段原记录，时间和状态保持当时口径。

### H 轮总结（2026-09-03）

- **做到哪了**：H1（上线准备）、H2（数学优先重新拍板，十条全部）完成；对抗式审查确认的 14 条全部修复；tsc 0 错误、337 个测试全绿、build 通过、隧道 smoke 15/15；main 线性，已推 origin。
- **最后一个良好 tag**：`h2-reviewed`（审查修复之后）；之前的回滚点依次是 `h2-math-done`、`h1-deploy-ready`。
- **你要手动做的**：去 Vercel 导入仓库、关 Deployment Protection、绑域名、在项目环境变量设 `BASE_URL=https://tools.<域名>` 后重新部署；Claude 里断开重连连接器（widget 版本 h-2）；看 `docs/H-open-questions.md` 里的拍板项（最要紧的是积分器默认 `atol`）。

**H1 完成，可以部署了。** 步骤在 README「部署到 Vercel」；绑完域名不设 `BASE_URL` 会静默白屏，日志里会有 `[base-url]` 警告提醒。

---

#### H1：上线准备（tag `h1-deploy-ready`）

| 项 | 做了什么 | 提交 |
|---|---|---|
| H1.1 | `base-url.ts` 改成纯函数 `resolveConfiguredBaseUrl(env)`：显式 `BASE_URL` 优先级最高（压过所有 Vercel 系统变量，无 scheme 时补 https 并警告），Vercel 生产环境无 `BASE_URL` 时回退到 `VERCEL_PROJECT_PRODUCTION_URL` **并打一行警告**说明自定义域名必须显式设置；预览部署用分支 / 部署地址；本地无配置。`base-url.test.ts` 7 个用例覆盖优先级。README 新写「部署到 Vercel」一节讲清这个坑 | c798bc0 |
| H1.2 | 参数上界复查（density ≤ 60、tSpan ≤ 1000、盒子 ≤ 1e6、表达式 ≤ 200 字符对 f/g/expr/M/N 一视同仁、步数 20000/方向、种子 12×12、等值线 8×60×60）；**每次调用 2 秒墙钟预算**：`checkpoint` 回调穿过 `integrate` / `findEquilibria` / `exactPotential` / 等值线循环（内核自己不读时钟，保持纯），超时给可读的 `isError`；**进程内滑动窗口限流** 240 次/分钟/实例，注释和 README 都写明在 serverless 上只是尽力而为 | 20819d0 |
| H1.3 | 首页加 `/vector-field` 入口和一句说明，MCP 说明退到第二段 | 73cab0c |

最贵的合法调用（恰当方程 + 8 条等值线，density 60，盒子 100×100）在测试里实测 < 2 秒（一般 0.3–0.6 秒）。

#### H2：按数学优先重新拍板（tag `h2-math-done`）

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

widget HTML 有改动（摘要文字、范围说明；审查修复后又改了一次），`WIDGET_VERSION` g-1 → h-1 → h-2，Claude 里必须重连连接器。

#### 验证输出（最终状态）

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

##### 隧道 smoke（最终构建，BASE_URL = 隧道地址）

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

#### 验证清单（按「最快发现问题」排序；每步失败回滚到哪个 tag）

1. **本地 `npm test`、`npm run typecheck`、`npm run build`** —— 30 秒内知道代码是否完整。失败：`git checkout h1-deploy-ready`（H2 之前）。
2. **Claude 重连连接器（隧道地址见上），问「用 ping 发 hello」** —— 链路。失败：与代码无关，先查隧道 / BASE_URL；代码回滚点 `g-widget-done`。
3. **问「分析 x' = x - x*y, y' = x*y - y」并注意：摘要语言是否随提问语言变化；漏传 locale 会不会看到 isError（说明 description 规则没被遵守）** —— H2.9。失败：回滚 `h1-deploy-ready` 恢复默认 `en`。
4. **问「从 (1,0) 出发积分 x' = -1e7 x, y' = 0」** —— 应看到「达到步数上限（解仍有界）」或「趋近平衡点」，绝不是「发散」。失败：`h1-deploy-ready`。
5. **widget 里：悬停一条慢场和一条快场的预览长度是否一样；放大 10 倍再点击、然后双击复位，轨线是否延伸到视野外很远** —— H2.2 / H2.3。失败：`h1-deploy-ready`。
6. **问「分析 2*x*y dx + (x^2 + y^2) dy = 0」和「分析 -y/(x^2+y^2) dx + x/(x^2+y^2) dy = 0」** —— 前者紫色等值线 + 四种形式各带偏差；后者恰当性通过但「路径自检失败」并给出偏差、没有等值线。失败：`h1-deploy-ready`。
7. **问「dy/dx = y + x*sqrt(y) 是什么类型」** —— Bernoulli，指数 n = 1/2（精确分数），不是 0.4999997。失败：`h1-deploy-ready`。
8. **问「分析 x' = (x^2-1)^2, y' = (y^2-1)^2」** —— 四个非双曲平衡点、提示「多个孤立的退化平衡点」而不是「连续解集」。失败：`h1-deploy-ready`。
9. **部署 Vercel 后**：先用 `*.vercel.app/mcp` 跑 `npm run smoke -- <url>`；绑域名 + 设 `BASE_URL` 后再跑一次，`widget asset URLs are absolute` 必须 PASS 且指向你的域名。失败：查构建日志里的 `[base-url]` 警告。

#### 对抗式审查（在冻结的 `h2-math-done` 上）

- **怎么跑的**：6 个视角（积分器 / 类型识别 / 平衡点与分类 / 学生所读文本 / 交互 UI / 成本与部署）各自在冻结工作树里查找并用探针复现，共 44 条；按严重度取前 14 条，每条由 3 个独立反驳者（数学重推、代码复现、学生可见性）验证，默认「驳回」。结果 **14 条全部确认、0 条被驳回**，30 条未验证（其中 15 条顺手修了，其余记在 H-open-questions）。48 个智能体，33 分钟。
- **14 条确认项及修复**（都影响学生所见结论，5 个 `[H2-fix]` 提交，每条有从推导来的测试）：

| # | 问题 | 修复 | 提交 |
|---|---|---|---|
| C0 高 | 汇点在 (1,1) 时永远「completed」、在原点时「reached」：控制器越过稳定区放大偏差 | 每步 h·L ≤ 1（L 由最后两级估计）；平移不变、与 RK4 一致 | a61ff69 |
| C8 高 | 绝对速度阈值 1e-8：x' = 1e-9 x 在起点就是「平衡点」 | 相对参考速度 max(起始速度, 尺度/tSpan) 的 1e-8 | a61ff69 |
| C10 中 | 出盒点整步越出，出盒时间随步长变化；20 倍停止盒被叫「观察范围」 | 出盒线段插值切到边界；停止盒有单独文案 | a61ff69 |
| C11 中 | max_steps 文案硬说刚性；rk4 tSpan > 200 静默截断 | 文案改写；rk4 步数按 tSpan 给足 | a61ff69 |
| C12 中 | 预览长度被 50 时间单位限制，慢场预览短 | 预览用自己的时间上限，只由屏幕弧长结束 | a61ff69 |
| C13 中 | 定义域边界报成「无定义/无穷大」；rk4 与自适应结论相反 | 新状态 domain_edge；RK4 在边界对半折步；两者一致 | a61ff69 |
| C1 高 | 两个采样点落在 y = −x 上，(x−y)/(x+y) 的判定随盒子翻转 | 采样集避开 y = ±x；零阈值用 75 百分位 | e05d302 |
| C2 高 | Richardson 估计对周期函数混叠，sin(2πy) 的恰当性随盒子翻转 | 非整数步长倍数 + 与最小步一致性检查 + 三模板外推 | e05d302 |
| C3 高 | LM 微步被当收敛：x' = −x³ 报 2–3 个平衡点 + 连续解集 | 只认 Newton 步收敛；Marquardt 缩放；差分步随 Newton 步缩小 | d77f4c5 |
| C4 高 | 判零下界取整盒中位数：大盒子上 O(1) 鞍点被判非双曲 | 下界 = 该点雅可比差分误差的 10 倍 | d77f4c5 |
| C5 高 | 共线的孤立退化根被当连续解集 | 加连通判据：相邻点之间场必须为零 | d77f4c5 |
| C6 高 | 路径自检除以 max(1, |F|)：dθ 乘 1e-8 就「恰当」并画等值线 | 相对势函数自身量级 | 5a99dd9 |
| C7 高 | 常数解 / 自治用绝对下界：e^(−x) 在 [30,40] 有几百个常数解 | 相对 M、N、斜率实测量级；无定义探测点跳过 | 5a99dd9 |
| C9 高 | 课本恰当方程默认参数就超 2 秒预算，且报错怪错对象 | 网格采样一次复用于所有等值线；各阶段加 checkpoint；文案改写 | d3fc151 |

- **修完后的门禁**：tsc 0 错误、337 个测试全绿、build 通过、隧道 smoke 15/15；tag `h2-reviewed`。widget 版本 h-2（重连连接器）。
- **审查里学到的规律**（已写进 CLAUDE.md）：内核里每个相对容差都必须相对于实测量级，C6、C7、C8 三条全是「除以 max(1, ·)」这种绝对下界。

```
$ git log --oneline -8
d3fc151 [H2-fix] budget: sample the potential once for all level curves; checkpoints in every first-order stage (review C9) + small review items; widget h-2
5a99dd9 [H2-fix] exact and slope-field: scale-free path check and constant-solution tolerances (review C6, C7)
d77f4c5 [H2-fix] equilibria: Newton-sized LM steps, error-based zero floor, connected continua (review C3, C4, C5)
e05d302 [H2-fix] detect-form: asymmetric samples, robust zero floor, alias-proof derivatives, honest Bernoulli wording (review C1, C2)
a61ff69 [H2-fix] integrate: relative equilibrium rule, stability-capped steps, exact border cuts, domain edges (review C0, C8, C10, C11, C12, C13)
003c779 [H2] docs: H summary, decisions, open questions; CLAUDE.md and README for the H state
31c0e38 [H2] locale is required; American spelling; results state their range; widget h-1
be58eff [H2] equilibria: a continuum needs geometry, not just a count; classify: repeated-root caveat and a field-scale floor
```

<!-- END SOURCE H-summary.md -->

---

<!-- BEGIN SOURCE H-decisions.md -->
<a id="history-h-decisions"></a>

## 历史 9：H-decisions.md

来源：[H-decisions.md](H-decisions.md)。下文为阶段原记录，时间和状态保持当时口径。

### H 轮决策记录（2026-09-03）

所有偏离《H 阶段：上线 + 按数学优先拍板》文档的决定和理由，以及文档没有规定、由我拍板的细节。按条目顺序。

#### H1：上线准备

- **H1.1 `base-url.ts`**：显式 `BASE_URL` 本来就在最前面，这次把解析改成纯函数 `resolveConfiguredBaseUrl(env)` 并加 7 个测试锁定优先级。没有 scheme 的 `BASE_URL` 补 `https://` 并警告，而不是拒绝。自检警告在模块加载时用 `console.warn` 打一次，所以构建日志和函数日志里都能看到（next.config.ts 和 route.ts 都 import 它）。
- **H1.2 成本上限**：没有做分布式限流（按文档）。核心的三个长循环（积分器每次尝试、平衡点搜索每个种子、势函数每个路径检验点、等值线每条）接受一个 `checkpoint` 回调，由工具层注入「过了截止时间就抛 `BudgetExceeded`」；内核自己不读时钟，保持纯函数和确定性。预算 2000 毫秒。限流器是进程内滑动窗口 240 次/60 秒，`tryAcquire(now)` 显式传时间以便测试；注释和 README 都写明它在 serverless 上只是尽力而为。表达式上限：zod 层 200 字符对 f/g/expr/M/N 一致，解析器另有 500 硬上限；测试覆盖五个字段。
- **H1.3 首页**：中英双语一句说明 + 交互页面链接，MCP 说明退到第二段。

#### H2：按数学优先重新拍板

##### H2.1 爆破判据

- `maxSpeed` 删除；新增 `maxPosition`，默认 1e6 × max(1, |起点|, 盒子范围)。只有位置非有限或超出该界才报 `blew_up`。
- **新增两个状态**（文档没有要求，但不加就要说谎）：`singular`——位置有限但向量场在此无定义/无穷大/不连续（起点在奇点上、RK4 某级非有限、自适应步长被压到 hMin 以下）；`arc_length`——按弧长停止（H2.2 用）。文案表两种语言都补了。
- **`x' = e^x` 越过爆破时刻的状态是 `singular` 而不是 `blew_up`**：位置到 709 时 `exp` 就溢出成 Infinity，而位置本身远小于界。按「只看位置」的规则这是「场无穷大」，不是「位置发散」。测试里明确记录了这一点。
- **（审查后已被 C0 的修复取代，见文末）默认 `atol = 1e-9` 下刚性衰减的终态曾是 `max_steps`**：`x' = -1e7 x` 的平衡判据要求 x < 1e-15，但绝对容差让控制器分辨不了 1e-9 以下的位置，于是在那里抖动到步数上限。这是有界解撞步数上限，按文档说实话。`atol = 0`（纯相对控制）时精确到达平衡点。是否改默认值见 open-questions。
- **通过工具调用永远看不到 `blew_up`**：位置界 ≥ 观察范围，所以总是先 `left_box`。`trace_trajectory` 的测试期望相应改为 `left_box`（x² 的解在 t = 1 − 1e-5 离开 [−1e5, 1e5]）。

##### H2.2 hover 预算

- `HOVER_DIAGONALS = 2` 条画布对角线的**屏幕**弧长，度量用当前 viewport 的 `worldToScreen`（仿射，所以最后一段可以精确线性插值切到限长，时间一并插值）。步数只作兜底 `HOVER_STEP_CAP = 4000`。
- **预览停止盒改为可见范围的 7 倍**（每边扩 3 倍；审查后为覆盖非正方形画布再扩到 9 倍）：3 倍时直线解在 1.5 个半宽处就撞盒，比两条对角线短，测试抓出来了。
- 测试：快场（×100）与慢场同一屏幕长度（精确到 1e-6）；4 倍缩放后屏幕长度不变而世界长度变为 1/4；到达平衡点的预览按自身规则更短。

##### H2.3 固定轨线

- 停止盒 = 输入范围每边扩 9.5 倍（整体 20 倍），`fixedStopBox(homeBox)`；`tSpan = 50` 仍然是时间上限。hook 里点击用 `traceFixed`（依赖 home box），悬停用 `tracePreview`（依赖 viewport）。
- 网页外壳与 widget 不再用「可见范围三倍」。

##### H2.4 类型识别三档

- 判定：`consistent` 偏差 < 阈值/10；`borderline` 在 [阈值/10, 阈值×10]；`inconsistent` > 阈值×10。**加了第四档 `untestable`**（有效采样点 < 5：值无定义，或舍入误差大到分辨不了阈值）——文档只说三档，但「没测到」和「不通过」必须区分。
- **始终返回全部 8 种形式**，每种带 `verdict`、`maxRelDeviation`（untestable 时为 null）、`threshold`、`samples`、`dropped`。工具摘要：通过的形式逐条列出，临界的用单独模板并附临界 caveat，不通过的压成一行（带偏差），不可检验的压成一行。恰当时积分因子两条自动成立（μ = 1），返回但标 `details.trivial`，摘要不列。
- **偏差相对于被比较两项的量级**（`relDev(a, b)` 除以 max(|a|,|b|)，低于 1e3·eps·g 的量级视为零）。自治检验以前除以 max(|ref|, 1)，那是绝对量，改掉了。
- **线性检验改法**：原来的「小步长二阶中心差分」看不到 y + 1e-3 y²（截断误差比一阶项小得多）；改为在三个相距很远的 y 处检验线性插值恒等式，偏差 = ε(y₂−y₁)(y₃−y₂)/max|g|，测试按此推导。
- **导数类检验（恰当、积分因子）带误差估计**：四阶中心差分在 h 与 h/2 做 Richardson 外推，误差估计 = 两者之差/15 + 舍入下界 8·eps·(Σ|f|)/(12h)；在 h、10h、100h（不超过盒子的 15%）里取误差估计最小的。某点的不确定度超过阈值/10 × 量级就丢弃该点并计数（exp(10x) + y 在 x ≳ 1.65 处全部丢弃，剩 6 个可用点仍能判定）；两边都在自身不确定度内为零时视为恒等式成立。
- 采样点从 7 个增加到 13 个无理分数位置。
- **测试推导中的两处更正**（不是容差改动）：(1) 显式形式只缩放 g 不是等价方程（M 变 N 不变），所以恰当性的缩放不变性用微分形式 M、N 同乘常数来验证；(2) 线性方程 g = xy + sin x 恰好满足 Bernoulli 模板 n = 0（g/y = x + sin(x)/y），数学上是对的，但课本定义要求 n ≠ 0, 1，所以 n ∈ {0, 1} 报为「线性方程，不算 Bernoulli」（verdict inconsistent，证据里说明）。

##### H2.5 Bernoulli

- 搜索区间 [−12, 12]，步长 0.05 + 二分。找到 n 后尝试贴到分母 ≤ 6 的既约分数（|p/q − n| ≤ 1e-7），**贴合后用贴合的指数重新拟合并要求偏差 < 阈值/10** 才采用，`exponent` 字段给 "1/2"、"-1"、"7" 这样的字符串，证据里写明是贴合的；贴不上就报 `n ≈ 1.414214（数值近似…）`。
- 测试：y + x√y → 1/2；y + y^1.5 → 3/2；x/y + y → −1；y + y⁷ → 7（旧区间找不到）；y + x·y^1.41421356 → 不贴合。

##### H2.6 恰当方程路径自检失败

- `FirstOrderView.implicitCheck = { pathDeviation, tol, passed }` 在检测到恰当（consistent 或 borderline）时总是给出；`passed` 为假时不画等值线，摘要、网页外壳、widget 都显式说明并报出实测偏差与阈值（新增文案 `exactPathCheckFailed`，两种语言）。
- `exactPotential` 的基点若落在奇点上（例如 (x dy − y dx)/(x²+y²) 在含原点的盒子上，中心就是原点），退到一个无理分数位置的基点，否则所有路径积分都是 NaN、偏差是 Infinity、学生看不到数字。
- 测试用的正是 dθ：局部恰当性判据通过（∂M/∂y = ∂N/∂x 处处成立，除原点），但在含原点的盒子上没有单值势函数，两条路径绕原点的圈数不同——这是「闭形式但不恰当」的经典例子，本身就值得教。

##### H2.7 连续解集

- 几何判据两条，满足其一即可：非双曲点的协方差矩阵特征值比 ≤ 1e-6（共线），或 ≥ 6 个点且 ≥ 80% 的点与其 4 个最近邻局部共线（比值 < 0.02，即落在一条光滑曲线上——直线判据抓不住圆）。计数判据（≥ 3 个点、≥ 60% 非双曲）**与**几何判据同时满足才报 `possible_continuum`；只满足计数报新增的 `multiple_non_hyperbolic`，文案说明「孤立的退化平衡点，需逐个做非线性分析」。几何证据放在 `EquilibriaResult.geometry`。
- **顺带修了一个真问题**：`classify` 原来是纯相对的（按最大元素归一化），于是 f = (x²−1)², g = (y²−1)² 的四个二重根处，Newton 停在离根 4e-13 的地方，差分雅可比是 3e-12·I，被判成漂亮的星形结点。现在 `findEquilibria` 把问题自身的雅可比尺度（典型场强 / 盒子尺寸）传给 `classify`，最大元素低于 1e-9 × 该尺度的雅可比视为零 → `non_hyperbolic`。不传该参数时行为不变（纯相对），「慢但双曲的系统保持类型」的旧测试仍通过。
- 测试：x 轴（共线）、单位圆平衡集（曲线判据，共线性 > 0.1）、四个孤立二重根（不报连续集，报 multiple_non_hyperbolic）。

##### H2.8 星形结点容差带

- 重根分支里判别式**不精确为零**时挂 `repeatedRoot` caveat（两种语言的完整句子）；精确为零（diag(2,2)、Jordan 块）不挂。注意 [[1, −1e-12],[1e-12, 1]] 的判别式在双精度下就是精确的 0（1e-24 对 1 消失），所以它不带 caveat；测试改用 ±1e-6。

##### H2.9 `locale` 必填

- 去掉 `.default("en")`，description 写 REQUIRED。测试 helper 在测试没给 locale 时自动补 `en`，另有专门测试对四个工具验证漏传即报错并点名 `locale`。`scripts/smoke.mjs` 补上 locale。

##### H2.10 美式拼写

- 正则整词替换：centre(s)→center(s)、linearisation→linearization、colour→color、behaviour→behavior、normalised→normalized、recognised→recognized、analyse→analyze、grey→gray、neighbour→neighbor、honour→honor 等，作用于 labels、detect-form、tools（含 description）、server、presets、首页和相关测试。`lib/core` 内部注释里的英式拼写没有全部动（不面向用户）。

##### 「不改的」里要求的一条

- 平衡点 / 一阶特征列表跟随可见范围保持不变，但网页外壳和 widget 的列表上方现在有一行 `featuresBox`：「以下结果按当前可见范围 x∈[…], y∈[…] 计算；缩放或平移后会重新计算，结论依赖于所考察的范围」。

#### 提交粒度上的偏离

- `[H2] forms` 一个提交里同时有 H2.4、H2.5、H2.6：三条都改 `detect-form.ts` 的返回结构和 `labels.ts`、`tools.ts` 的同一段摘要代码，拆开会出现编不过的中间提交。
- `[H2] equilibria … classify` 一个提交里同时有 H2.7 和 H2.8：两条都往 `labels.ts` 的表里加键，同一文件不好拆。
- `[H2] locale required; American spelling; results state their range` 一个提交：同上，都改 `labels.ts`。


#### 对抗式审查之后的修复（tag `h2-reviewed`）

审查在冻结的 `h2-math-done` 上跑：6 个视角各自查找（可以在工作树里写探针并运行），44 条发现按严重度排序取前 14 条，每条由 3 个独立反驳者（数学重推、代码复现、学生可见性）验证，**14 条全部确认、0 条被驳回**，30 条未验证（记在 open-questions）。全部 14 条都影响学生所见结论，按模块分 5 个 `[H2-fix]` 提交修复，每条都有从推导来的测试。

- **C0 平衡点判定随平移变化**（`a61ff69`）：默认误差控制在 |x|≈1 处只分辨 1e-6，控制器在误差达标后放大步长、越过 DOPRI5 稳定区，用放大解的步把偏差卡在 1e-6 附近，原点处的汇点（atol 恰好逼出相对精度）能「到达」、(1,1) 处的同一个汇点永远「completed」。修法：每步接受后用最后两级估计局部 Lipschitz 常数 L，令 h·L ≤ 1——在 |z| ≤ 1 处数值衰减因子与 e^(−h) 相差 1e-5，到达时间准确到一步之内（取 3 虽然稳定，但 R(−3) = 0.565 对 e^(−3) = 0.05，到达时间会晚很多）。平移后的汇点与 RK4 给同一状态、同一到达时间，接受的步不再远离汇点。
- **C8 绝对速度阈值 1e-8 把慢场当平衡点**（同一提交）：`reached_equilibrium` 改为速度降到参考速度 max(起始速度, 问题尺度/tSpan) 的 1e-8 以下。方程整体缩放不改变判定；x' = 1e-9 x 正常积分到指定时间；恰好从平衡点出发仍立即返回。
- **C10 离盒点整步越出**（同一提交）：出盒线段按第一条被越过的边线性插值切到边界（点与时间一起插值），出盒时间不再随步长变化。网页外壳与 widget 对点击轨线的 20 倍停止盒用单独文案「跑到输入范围的 20 倍以外」，不再叫「观察范围」。
- **C11 max_steps 文案硬说刚性；rk4 在 t = 200 静默截断**（同一提交）：文案改为「在到达指定时间前停止（步数或步长耗尽），解仍然有界」；rk4 的步数上限按 tSpan/0.01 给足。
- **C12 预览长度受 CLICK_TSPAN = 50 限制**（同一提交）：预览用自己的时间上限 1e4，只靠屏幕弧长、步数兜底和位置界结束；x' = 0.1y, y' = −0.1x 与单位振子预览长度相同。
- **C13 定义域边界报成「无定义/无穷大」**（同一提交）：新增状态 `domain_edge`（最后一点场有限，再往前无定义）；RK4 在级求值失败时把步长对半折（最多 40 次）逼近边界，而不是提前一步宣布；步长塌缩时按最后一点的场判定：场相对参考速度爆炸 → `singular`，见过无定义级 → `domain_edge`，否则 → `max_steps`。x' = −√x 两种积分器都在 t = 2 到达平衡点 x = 0；x' = −(√x + 1) 两种都在 t = 2(1 − ln 2) 报 domain_edge。悬停停止盒扩到 9 倍以覆盖非正方形画布；起点极大时位置界不再溢出成 Infinity。
- **C1 采样点落在 y = −x 上**（`e05d302`）：13 个采样点里两个满足 FX + FY = 1，在以原点为中心的盒子上正好压在 (x−y)/(x+y) 的极点上，极点的舍入噪声进了 gMax、浮点零阈值随之失真，线性/齐次判定随盒子尺寸翻转。采样分数、线性检验的 y 三元组、自治参考列、积分因子网格全部避开 y = x 和 y = −x；零阈值改用 |g| 的 75 百分位数。
- **C2 Richardson 误差估计对混叠失明**（同一提交）：两个彼此一致的差分模板不是精确的证据（步长等于 sin(2πy) 周期时两个都读到 0）。步长倍数改为非整数（1、4.3、18.7、81、350，基准 1e-4 盒边，上限 0.0731 盒边），较大的步只有与最小步的估计在误差范围内一致时才采用；每个估计用三个模板做两次 Richardson 外推、以两次外推之差为误差。
- **Bernoulli 文案与边界**（同一提交）：n ∈ {0, 1} 的情况说「按定义不属于该形式」而不是把 1e-16 的偏差叫「明显超出阈值」；盒子没有 y > 0 时报 untestable 而不是到盒外采样；贴合门限放宽到 1e-4（贴合后的重新核对才是判据）；英文列表用 ASCII 括号。
- **C3 LM 微步被当成收敛**（`d77f4c5`）：退化根附近雅可比近奇异，LM 分支的步被 λ 压到 1e-20 却能通过步长收敛判据，不同种子停在离根 4e-6 处的不同位置，x' = −x³ 报出 2–3 个平衡点外加「连续解集」。修法三处：只有 Newton 分支的步算收敛；LM 用 Marquardt 对角缩放，弱方向的步保持 Newton 量级；**雅可比差分步长随 Newton 步长缩小**——固定 1e-6 的截断误差 h² 在 x < 6e-7 处压过真导数 3x²，迭代会爬行（这一条是修 C3 时才发现的）。迭代上限 60 → 200。
- **C4 判零下界用了整盒中位数**（同一提交）：`classify` 的 fieldScale 改为 `zeroFloor` = 该点差分雅可比误差估计（h 与 2h 的 Richardson 差 + 舍入）的 10 倍，是局部量，不随盒子变化。x' = y, y' = −x − y + x⁷ 在 [−100,100]² 上 (1,0) 仍是鞍点、行列式 −6。
- **C5 共线的孤立退化点被当成连续解集**（同一提交）：几何判据之外加连通判据：相邻非双曲点弦中点出发的 Newton 抛光必须落在两点严格之间（≥ 80% 的最近邻对），sin(πx)² 的七个二重根、(x³−x)² 的三个都改报 `multiple_non_hyperbolic`；直线、圆仍是连续解集。另外：判别式精确为零但非对角元非零的「星形结点」也挂 repeatedRoot caveat。
- **C6 路径自检除以 max(1, |F|)**（`5a99dd9`）：绝对下界让 dθ 乘 1e-8 后通过自检、画出不存在的势函数等值线并说「方程恰当」。改为相对势函数自身量级（带舍入下界）。
- **C7 常数解与自治检验的绝对下界**（同一提交）：|M| ≤ 1e-9·max(1, mScale) 让 dy/dx = e^(−x) 在 [30, 40] 上有几百个「常数解」并被判为自治。全部改为相对 M、N、斜率的实测量级；M 或 N 在探测点无定义时跳过该点（dy/dx = y/x 的 y = 0 在对称盒上找回来了）。
- **C9 课本恰当方程超 2 秒预算**（`d3fc151`）：势函数每点约 130 次求值，等值线阶段对 8 条水平线各自重采 61×61 网格（387 万次 M/N 求值），Zill §2.4 例 3 在默认参数下就超时，而报错却怪 density 和范围。改为采样一次网格、所有水平线复用（`sampleGrid` / `contourSegmentsFromGrid` / `potentialLevelsFromValues`），并给 sampleField、detectForms、firstOrderEquilibria、firstOrderSingularities 加上 checkpoint；预算报错文案改成说明哪些阶段可能贵。同一提交里：只有 exact 判定为 consistent 才算势函数（borderline 不再产生「方程恰当」句子和等值线）；解析错误按 M、N 各自编译归因；formatNumber 不再吞掉 1e30 的指数；缩放后清掉旧的悬停预览；widget 每次新结果都重置轨线；两个外壳「以下结果按范围…计算」用的是实际计算范围（防抖期间不再指着新范围）。widget 版本 h-2。

<!-- END SOURCE H-decisions.md -->

---

<!-- BEGIN SOURCE H-open-questions.md -->
<a id="history-h-open-questions"></a>

## 历史 10：H-open-questions.md

来源：[H-open-questions.md](H-open-questions.md)。下文为阶段原记录，时间和状态保持当时口径。

### H 轮待决事项（2026-09-03）

需要你拍板的事、被标记的失败测试、性能异常。没有的项写「无」。

#### 需要你拍板

- ~~积分器默认绝对容差 `atol = 1e-9` 让刚性衰减停在 `max_steps`~~ —— 审查项 C0 的修复（步长 h·L ≤ 1 的稳定性上限 + 相对参考速度的平衡判据）之后，默认容差下 `x' = -1e7 x` 也精确到达平衡点；不再需要改 atol。
- **`blew_up` 通过工具永远到不了**：位置界 ≥ 观察范围，解总是先离开范围（`left_box`，现在切在边界上）。状态保留在内核里（无盒子调用时可达），文案表也保留。要不要在工具摘要里对「离开范围且速度极大」的情形补一句「可能在有限时间内发散」？我没加，因为那又回到了用速度当证据。
- **`x' = e^x` 越过 t = 1 报 `singular`（场溢出）而不是 `blew_up`**：严格按「只看位置」是对的，但学生心里那是「爆破」。文案「向量场在这里无定义、无穷大或不连续」是准确的；要不要专门区分「溢出」再说。
- **第四档 `untestable`**：文档只有三档；我加了它来区分「没测到」和「不通过」。
- **临界带宽度 = 阈值两侧各一个数量级**（consistent < 阈值/10，inconsistent > 阈值×10）。这是我按文档「阈值附近一个数量级内」定的，可以收窄。
- **导数检验丢点规则**：某点的不确定度 > 阈值/10 × 量级就丢弃。exp(10x) + y 在 [0.3, 3] 上丢 7 留 6 仍可判定；在 [3, 6] 上全丢 → untestable。阈值/10 这个系数是我定的。
- **`classify` 的场尺度下界 1e-9 ×（典型场强 / 盒子尺寸）**：解决了多重根被判成星形结点的问题；系数沿用 classify 的 tol。极端情况：一个真正的、但相对场强弱 1e9 倍的双曲平衡点会被判成非双曲——我认为在双精度下这本来就分辨不了。
- **hover 停止盒 7 倍可见范围、步数兜底 4000**：前者由「两条对角线」推出（≥ 2√2 个半宽），后者是我定的。
- **连续解集的曲线判据参数**：局部协方差比 < 0.02、≥ 80% 的点、≥ 6 个点。圆上 60 个点全部通过、四个孤立点全部不通过，中间地带没有测。
- **Bernoulli 贴合分母 ≤ 6、贴合容差 1e-7**：课本例子全部贴上；1/7 之类贴不上，报数值近似值。

#### 被标记的失败测试

无。测试期望修正（不是容差改动）都记在 H-decisions：显式形式缩放 g 不是等价方程；n = 0 的 Bernoulli 模板即线性方程；[[1, −1e-12],[1e-12, 1]] 在双精度下判别式精确为零；工具层的 x² 例子先离开范围。

#### 性能

- `analyze_first_order` 多了 13 点 × 8 种形式的检验，其中导数类每点 3 个步长 × 2 个 Richardson 半步 × 4 次求值 ≈ 24 次/点/导数，仍在几十毫秒量级；恰当方程含等值线仍 0.3–0.6 秒（预算 2 秒）。
- hover 预览按屏幕弧长而不是步数，慢场里可能走到 4000 步兜底（约 25 毫秒），比之前的 400 步慢；没有在低端机上测。

#### 其他

- Vercel 部署仍需你手动做（导入、关保护、绑域名、设 `BASE_URL`、重新部署、重连连接器）。
- 对抗式审查在冻结的 `h2-math-done` 上跑，结果见 H-summary 末尾。


#### 审查未验证的 30 条（按严重度中/低；未跑反驳者，可能有错）

已顺手修掉的（在 `[H2-fix]` 提交里，有测试或直接理由）：Bernoulli n = 0/1 文案自相矛盾；解析错误归因到错误的字段；exact 为 borderline 时仍说「方程恰当」并画等值线；`analyze_first_order` 各阶段没有 checkpoint（一个合法输入跑了 9.2 秒）；极大起点让 maxPosition 溢出报错；极刚性衰减报成 singular；非正方形画布上悬停预览被 7 倍停止盒截短；formatNumber 把 1e30 打成 1e+3；缩放后悬停预览不刷新；widget 相同方程的新结果不重置轨线；「以下结果按范围」在防抖期间指错范围；rk4 tSpan > 200 静默截断（与 C11 同修）；英文摘要里的全角括号；y.max ≤ 0 时 Bernoulli 到盒外采样；dy/dx = y/x 的 y = 0 在对称盒上丢失（与 C7 同修）。

留给你拍板 / 以后做的：

- **两条平行直线、多条直线、采样稀疏的曲线组成的真连续解集**会被判成「孤立退化平衡点」。连通判据只看最近邻，平行线之间不连通是对的，但每条线内部应该连通——需要先按连通分量分组再判。
- **列表被截断时 `multiple_non_hyperbolic` 覆盖了 `hit_limit`**，`firstOrderSingularities` 随后把警告整个丢掉。建议 `EquilibriaResult` 加独立的 `truncated` 字段。
- **种子网格漏掉盒内平衡点**（x' = y, y' = −x − y + x⁷ 在 [−10,10] 上丢原点）：12×12 种子在大盒子上太稀。可按盒子大小自适应或加二次细化。
- **x' = e^x 越过爆破时刻报 singular（场无穷大）而不是「有限时间爆破」**：按「只看位置」规则是对的，已在 H2.1 决策里记录；要不要给「场相对参考速度爆炸」单独一个更直白的文案（例如「向量场在这里爆炸性增大，解很可能在有限时间内发散」），请你定。
- **奇点列表在两个外壳里丢了「已截断 / 连续」警告**。
- **Bernoulli「没有统一指数」分支的偏差数字**：现在报各 x 处拟合指数的相对差；某些 x 处完全拟合不出时报 excluded 且偏差为 1，这个 1 是占位不是实测。
- **病态缩放的线性系统**（特征值 1e10 与 −1）：审查说不是平衡点的点被列为平衡点并称连续解集、特征值被说成「数值上为零」——判零下界已改为局部误差估计，但没有专门验证这个例子。
- **定义域边界上的根**：x' = √x, y' = y 在原点有平衡点但 Newton 找不到（√ 在 0 处不可微）；dy/dx = √y 的 y = 0 稳定性被说成「一侧趋向」。需要单独处理定义域边界。
- **所有 isError 文本都是英文**，与必填的 `locale` 无关——有意为之（错误是给模型看的），记录在此。
- **`star_node` 在 sqrt(tol) 带内的判定**已加 caveat；带宽本身（√1e-9 ≈ 3e-5）是 A 阶段定的。

<!-- END SOURCE H-open-questions.md -->

---

<!-- BEGIN SOURCE IJKL-summary.md -->
<a id="history-ijkl-summary"></a>

## 历史 11：IJKL-summary.md

来源：[IJKL-summary.md](IJKL-summary.md)。下文为阶段原记录，时间和状态保持当时口径。

### I–L 轮总结（2026-09-08/09 夜跑）

- **做到哪了**：I（记号改为 dy/dt）→ J（数学正确性）→ K（网站完整化）→ L（MCP 收尾）四个阶段全部完成，四个 tag 都打了：`i-notation-done`（f562d39）、`j-math-done`（3dd4f27）、`k-website-done`（f7ab5ca）、`l-mcp-done`（1e825bc）。J 阶段跑了三轮对抗式审查（39 + 41 + 21 条发现）和三轮修复；K 阶段在会话自带浏览器面板逐条验收；L 阶段用本地模拟主机跑通 widget。最终门禁：tsc 0 错误、808 个测试通过 + 3 个标记为预期失败（共 811）、build 通过、本地生产构建 smoke 19/19。main 直线，`h2-reviewed..HEAD` 共 85 个提交。
- **最后一个良好 tag**：`l-mcp-done` = 1e825bc（main HEAD）。往前依次是 `k-website-done`（f7ab5ca）、`j-math-done`（3dd4f27）、`i-notation-done`（f562d39）、`h2-reviewed`。
- **你要手动做的**：(1) **推 origin 就是 Vercel 生产部署**（`git push origin main`）——编排者只在被告知时才会在会话末尾推，推没推看本文件末尾编排者追加的那一行，没有那行就是没推；(2) widget 版本 h-2 → l-1，**Claude 里必须断开并重新连接连接器**（否则旧的 URI 缓存会导致 widget 空白 / Resource not found）；(3) `BASE_URL` 已在 Vercel 设好，不用改；(4) 第一次部署后打开 `https://tools.studycase.net/opengraph-image`，看中文那行有没有变成方块（构建时 next/og 要联网取字体，见 open-questions）；(5) 部署后跑 `npm run smoke -- https://tools.studycase.net/mcp`；(6) 帮助页给的 iframe 高度（带控件 1280 px / 只读 1260 px）是代理在窄视口量的，嵌进 Google Sites 后按实际调；(7) Claude 实机测 widget 交互和「先调工具」规则（验证清单第 9–12 步），今晚没法替你做。

---

#### I 阶段：一阶方程的自变量改为 t（tag `i-notation-done` = f562d39）

| 项 | 做了什么 | 提交 |
|---|---|---|
| I.2 解析器 | `compileScalar(expr, params, { variables: "ty" })`：一阶模式下只认 `t`、`y`，`t` 绑定到内核横坐标 `p.x`；写 `x` 报 `ParseError.code = "x_in_first_order"`（"一阶方程的自变量是 t，请把 x 写成 t"）；以 `dy/dx =`、`dy/dt =`、`y' =`、`x' =` 开头的输入报 `lhs_in_expression`（"只需输入右端"），措辞按模式区分（一阶说 dy/dt，系统说 x'/y'）；`y = 0 ? 1 : -1` 这类比较号打错的情况提示"写 =="。`SystemSpec.variables?: "xy" \| "ty"`，`toSystem()` 产出的归约系统带 `"ty"`，Scene 随之携带，widget 本地编译零改动 | 502e737, d1f13ad, 2e1d9a6, f383b1a |
| I.2 内核文案 | detect-form 八种形式的名称、检验描述、证据、caveat 全部改为 t 记号（可分离 `dy/dt = f(t)·h(y)`、齐次 `g(kt, ky) = g(t, y)`（缩放参数改叫 k）、线性 `P(t)·y + Q(t)`、恰当 `∂M/∂y = ∂N/∂t`、积分因子 `μ(t)`）；自治 = "右端与 t 无关"；`FirstOrderView.expr` 为 `dy/dt = g` / `(M) dt + (N) dy = 0`；`firstOrderEquilibria` 选项 `tRange`（`xRange` 保留为弃用别名）；英文冠词修正（an exact equation） | e2145ed, 35307f5 |
| I.2 外壳与工具 | labels 双语：`tMin/tMax`、范围模板加 `{hv}` 占位（x 或 t）、`xInFirstOrder`、`lhsInExpression(+System)`、一阶语法提示；网页外壳按模式显示 `dy/dt = g(t, y)`、`M(t, y)`、`N(t, y)`、t 最小/最大；画布画坐标轴名（`lib/render/axis-names.ts`，横轴名放在轴线下方避免与常数解标签重叠）；预设改 t 记号；`analyze_first_order` 标题/描述/参数说明改 dy/dt（参数名 `xMin/xMax` 不改，描述说明是 t 的范围）；摘要 `t ∈ [..]`；README / CLAUDE.md / 首页改记号；"最近一条轨线"一行按模式区分（显式一阶报到达的 t 坐标而不是积分参数，微分形式不说方向） | 8a5a30d, c77ed95, a12a3c4, dbb61f2, 560bcb1, d80b86f, f562d39 |
| I.3 等比开关 | `fitViewport(box, w, h, { equalScale })`（默认等比；关闭时精确填满输入范围）；非等比时箭头按各向异性映射画（与画出的解曲线相切，`arrows.ts` 改用 `pixelScale(viewport)`）；hook 接 `equalScale`，切换即复位视图；网页外壳复选框（默认勾选）+ 常驻警告行"横纵比例不同，图上的角度不代表真实斜率。"+ 显示范围一行注明"等比缩放后 / 填满输入范围"；widget 本阶段保持等比（L.3 才加开关） | f02a2df, 85d8ca3, d232e2a |
| 复位时的特征盒 | 复位视图（未缩放/平移）时平衡点、常数解、类型识别按**输入范围**算，与等比与否、画布长宽比（手机/桌面）无关；缩放或平移后按可见范围算；说明文字相应改写 | 6a2faf1 |
| smoke | 本地无 `BASE_URL` 的构建对"资源地址是绝对的"这一项报 SKIP 而不是 FAIL | dd285d7 |
| docs | 等比开关、`{hv}` 约定、特征盒规则、测试数写进 README / CLAUDE.md | 5b48c50 |

测试 337 → 409，全部按推导给期望值。对抗式审查（5 视角，13 条发现 × 3 反驳者）13 条全部确认并修复（`[I-fix]` 提交）。

##### I 阶段浏览器验收（会话自带浏览器面板，`next dev`）

- 10 个预设逐个点击：画布非白像素 8–15%，平衡点/常数解/类型列表正确（阻尼振子 −0.25 ± 0.96825i、Lotka–Volterra 鞍点 + 中心或弱螺旋、单摆 kπ、logistic y=0 不稳定 / y=1 稳定、恰当方程 y=0 稳定性随 t 变化 + 奇点 (0,0) + 恰当/齐次一致）；无 `role=alert`。
- 输入 `dy/dx = y` → "只需输入方程的右端，「dy/dt =」这一部分是默认的。一阶方程的自变量是 t（dy/dt = g(t, y)），请把 x 写成 t。"；`x*y`、`xy` → 请把 x 写成 t；`y = 0 ? 1 : -1` → 提示写 `==`；系统模式 `x' = y` → 「x' =」「y' =」措辞。
- 等比复选框取消 → 警告行常驻、显示范围改为"填满输入范围"、特征盒一行仍是输入范围；重新勾选 → 警告消失。
- 英文界面恰当预设：`an exact equation`、`∂N/∂t`，无冠词错误。
- 控制台：修掉 `border`/`borderColor` 混用的 React 警告后无 error。

---

#### J 阶段：数学正确性（tag `j-math-done` = 3dd4f27）

**怎么做的**：J.1–J.5 分四个 worktree 并行实现（j1 平衡点 / j2 唯一性 / j3 非自治 / j4 二阶），rebase 后 `--ff-only` 合入，集成提交 90989ed。然后在冻结的 90989ed 上跑对抗式审查，修一轮（`[J-fix]`，35c6bbc）；再审（`[J-fix2]`，80559da）；K2/K3 合入后再审一轮并按课堂可能性分级（`[fix]`，3dd4f27）。**所以 `j-math-done` 在提交线上排在 K 的多数提交之后**：K1 是在 90989ed 上并行做的，先合入（61ee1e7）；J 的第二、三轮修复在它之后。tag 对应的是「J 的数学修完了」这个状态，不是「K 之前」。

##### J.1–J.5 首轮实现（集成于 90989ed，测试 409 → 538）

| 项 | 做了什么 | 提交 |
|---|---|---|
| J.1 平衡点会漏 | 种子密度按沿扫描线 f、g 的变号次数自适应（12..32/轴，尺度无关）；64×64 细网格上 \|F\| 的局部极小值作为独立自检，不靠近已找到平衡点且明显低于邻居的再跑一次 Newton；定义域边界上的根用单侧差分雅可比 + 回溯（步进入未定义区就折半）；`seeding: SeedingReport` 报出种子数和是否封顶。x' = y, y' = −x − y + x⁷ 在 [−10,10] 上找回原点 | 2dccce1 |
| J.5 连通分量 | 非双曲点先按 4 近邻 + 欧氏最小生成树的边分连通分量（相邻点弦中点的 Newton 抛光必须落在两点之间且是**新的**零点），每个分量内部再判几何；`EquilibriaResult.truncated` 独立字段，`hit_limit` 由它派生 | f9e18b3 |
| J.5 病态缩放 | `classify` 给了 `zeroFloor` 时按误差判零（\|det\| 相对特征值量级）；x' = 1e10 x, y' = 1e-10 y 在首轮里按单一误差模型判为 non_hyperbolic（后来 J-fix 的逐元误差改判为 unstable_node，见下） | b7093d0 |
| J.5 外壳 | 两个外壳和工具摘要显示「列表已截断（上限 {max}）」和 `domainEdge` caveat | 4002fc5 |
| J.2 唯一性探测 | `lib/core/uniqueness.ts`：在常数解 / 平衡点处取逐级缩小的距离 δ_k（1e-2·尺度起，每级 /4，8 级），差商对 log δ 拟合斜率 −α；α ≥ 0.25 且单调 → unbounded，0.1 ≤ α < 0.25 → borderline，否则 bounded_at_tested_scales（是测量，不是证明，所以没有「唯一性成立」的句子）；探测在已找到的根处减去残差 g(t, c)。sqrt(y) 的 α = 1/2、y^(1/3) 的 α = 2/3 都是推导值 | 37e211a |
| J.2 常数解 | 定义域边界上的常数解（sqrt(y) 的 y = 0）用二分到相邻双精度数找到（50 次二分不够：最后一个有限 y 处 \|M\| ≈ 1e-9 会被残差判据拒绝）；稳定性新增 `edge_approach` / `edge_leave`；每条常数解带 `uniqueness` | 285a928 |
| J.2 外壳与工具 | `TrajectoryView.nonUnique`：起点或途经被标记点的轨线（按线段而不只按顶点判）标出「数值解只是其中一条」；`uniquenessSentence()` 在 labels 里只写一次，工具和两个外壳共用；画布：非唯一常数解画 4 px 双线 + '!' 徽标，非唯一平衡点旁 '!'，边界线用点划线；`trace_trajectory` 也跑 findEquilibria + 唯一性探测来标记曲线 | 40df35c |
| J.3 时间依赖探测 | `detectTimeDependence`：对若干无理 t 值比较 F（首轮是数值判定；J-fix 改为静态规则，探测只作证据）；`Scene.timeDependent { snapshotT, maxRelDeviation }`；外壳在输入范围上只测一次，缩放平移不会翻转结论；快照时刻进 systemKey，换 t 就清轨线 | 5eda07f |
| J.3 工具与外壳 | 依赖 t 的系统不报平衡点和分类，摘要说明是 t = … 的快照；`analyze_system` / `sample_field` 加可选参数 `t`；画布标出 t；特征盒那行对非自治场景隐藏，换成快照说明 | ef6d53c |
| J.4 二阶降阶 | `reduceSecondOrder`：字符串层把 x''、x' 换成占位符，两边相减得 E，检验 E 对 x'' 仿射，F = −E(x''=0)/(E(x''=1)−E(x''=0))，mathjs simplify（`exactFractions: false`，化简串只在 9 个采样点复现到 1e-12 时采用）；降阶结果 `x' = y, y' = F` 作为字符串进 `analyze_system` 的全部逻辑并显示给学生 | b124d11 |
| J.4 工具 | `analyze_second_order`；`analyze_system` 的分析体抽成 `analyzePlanar` 共用；特征值期望相对 \|λ\| 的 1e-7（由中心差分雅可比误差推出） | 86d031a |
| J.4 外壳 | 网页外壳「二阶方程」输入模式 + `damped2` 预设（`x'' + 0.5*x' + x = 0`） | 4c59e01 |
| 集成 | `analyzePlanar` 统一承载时间依赖分支 → findEquilibria → 唯一性 → truncated，所以 `analyze_second_order` 也得到快照说明和唯一性句子；推导测试 x'' = −x + sin(t)：无平衡点、降阶句在第一行、t = 1.5 时每个采样的 y' 平移 sin 1.5 | 90989ed |

##### 审查第一轮（冻结在 90989ed）与修复（`[J-fix]`，HEAD 35c6bbc，测试 638）

- **怎么跑的**：多视角在冻结工作树里写探针复现，共 **39 条**发现，按严重度排序后每条派 3 个独立反驳者（数学重推 / 代码复现 / 学生可见性），默认「驳回」。**13 条被 3/3 确认**（equilibria 视角 9 条、uniqueness 视角 4 条），**其余 26 条没有验证**：验证智能体撞上账号用量上限，反驳者没跑完。这 26 条没有被驳回，只是没被复核；修复时按「复现了就修」处理，报告里把它们标为 `unverified->reproduced`。
- **13 条确认项**：#1 盒子级残差容差造成假平衡点（x' = y, y' = x⁸ + 1 在 [−100,100]² 上列出 14 个）；#2 一阶内核同样的盒子级容差（y⁸ + 1 有 11 条常数解）；#3 Marquardt 缩放的 LM 步把秩 1 雅可比的每个种子拉向原点（SI 模型丢两条轴）；#4 病态但可逆的雅可比被判奇异（1e8 与 1e-8）；#5 x⁷ 例子在 [−100,100]² 及更大盒子上仍丢原点；#6 定义域边界上的一条平衡线只报一个点（x' = sqrt(x)·y, y' = x）；#7 整矩阵单一误差掩盖可分辨的行列式；#8 相距小于 1e-6 × 盒子的两个单根被静默合并；#9 方向相关的奇点被当平衡点（x' = xy/(x²+y²), y' = y − x）；#10 y 范围下边缘的 y = 0 被说成「半稳定」；#11 sqrt|y|、|y|^(1/3) 的常数解只有网格点正好落上才找到；#12 光滑方程在大盒子上被判「导数无界、Lipschitz 失效」；#13 陡但 Lipschitz 的右端（tanh(1e6 y)）被判无界。

| 组 | 修了什么 | 提交 |
|---|---|---|
| A 平衡点 | 接受判据改为**局部**的：Newton 步小于位置容差（1e-13 × 盒子）或残差落到该点雅可比 + 舍入下界之内，盒子级统计一律不进判据（#1）；行缩放的 Newton 求解（#4）；去重用两次运行各自声称半径之**和**（#8，取 max 会把 x⁸ 的重根列两次）；**消失性检验**：Newton 停住的非根点做 F 连续性检验，不连续的进 `singularPoints` 而不是平衡点（#9）；两个外壳和工具报出奇点 | aa20d92, ff3a200 |
| A 雅可比 / 分类 | `jacobianWithError.errors` 逐元误差，判别式改算 (a−d)² + 4bc（tr² − 4det 会消成 4 eps 噪声，sin(πx), sin(πy) 的 121 个格点 caveat 随机）；det / trace / 判别式的判零全部基于误差；x' = 1e10 x, y' = 1e-10 y 改判 unstable_node（#7、#37） | 9833db8 |
| A 种子 | 秩亏时用截断伪逆步（#3，SI 模型报 possible_continuum，两条轴都在）；**变号四叉树**：在扫描格子角点上 f、g 同时变号的格子递归细分到深度 12 再跑 Newton（#5，x⁷ 在 [−3,3]² 到 [−1000,1000]² 及偏置盒上都找到原点 + 两个鞍点）；定义域边界种子（#6，sqrt(x) 线报为 ≥ 20 个边界点的连续解集）；逐元零下界；每个上限（REFINE_CELL_CAP 1024、VISIT 8192、ROOT 128、EDGE 256）都在 `seeding` 里报出 | 0a792c5 |
| B 唯一性 | 最细尺度判定：一直往下降（最多 60 级）直到差商停止变化（level-off → bounded，带当时的局部指数）或到达舍入下界（尾部 4 级拟合，≥ 0.25 unbounded、≥ 0.1 borderline）；判定在 3 个以上盒子上一致（#12、#13、#25、#35）；舍入下界改用 g 的局部量级 eps·(\|g(c+d)\| + \|g(c)\|)/0.1 而不是相邻级的统计（1 − exp(−100y) 在半宽 100 的盒子上曾判 untestable） | 401ba78, b69df72 |
| B 常数解 | 根的接受也改为局部的（两侧阶梯 \|M(c ± h·4^−k)\| 按 δ^β 下降、β ≥ 0.05；#2、#28）；尖点根用黄金分割求 \|M\| 极小再过消失性检验（#11、#27）；范围边缘外多探一格，从阶梯读出定义侧（#10、#36）；自治性第三态 `untestable`（#15）；y·log\|y\| 的根报为精确 0（#16） | 5a88fea |
| B 外壳 | 非唯一标记按曲线自身范围探测而不依赖输入盒子（#14、#29）；边界句子说明定义在哪一侧、`{side}` 占位、`edge_varies`；画布用 `stabilityShort` 词而不是内部键（#17、#32）；3·y^(2/3) 的负底数分数幂提示进句子和工具描述（#38） | c327b51, dbe9979 |
| C 二阶 | x'' 系数含 t 时在 5 个 t 值上采样、系数结构化提取（#18）；采样加盒子里的 13 个点（#21）；弯引号 / unicode 撇号 / 双撇号归一化，x''' 有自己的错误码（#22）；化简只用 simplifyCore + 两条精确改写，−9.81/0.1 按原样显示（#23）；10 个 `second_order_*` 错误码，网页外壳双语（#31） | d2ee294 |
| C 非自治 | **静态规则**：f 或 g 里出现 t 就是非自治，探测只作证据（#19、#20，见 decisions）；快照时刻加入探测时刻，sqrt(t − 5) 在 t = 10 报「定义域随 t 移动」 | d0b7550 |
| C 文案 | 「平衡点只对自治系统有定义」改为「本工具不对非自治系统做该分析」（#26）；奇点连续解集警告进 Scene（#30）；截断只说一次、sample_field 说明放在场数据前（#33、#39）；二阶语法提示写明数值检验的局限 | 419b76c, 8ee7f4c |
| 集成 | A 与 B 合并：消失性检验改用新的唯一性下降（minOffset）、奇点合并；C 合并：奇点句子统一走 `equilibriaNotices` | 2ea8f84, 35c6bbc |

##### 审查第二轮（冻结在 35c6bbc）与修复（`[J-fix2]`，HEAD 80559da）

- **41 条**发现，四个视角（equilibria / first-order / second-time-text / tools-mcp），每个视角先复核上一轮的修复（全部在 3 个以上盒子和 1e±6 缩放下复现为已修），再找新的。**验证再次被用量上限打断**：这一轮没有反驳者投票，41 条都是单一视角的复现记录。编排者按「课堂会遇到 / 极端盒子」分了三组修，极端盒子的明确跳过（列在 open-questions）。
- 上一轮 K1 已合入（61ee1e7，在 90989ed 上并行做的），所以这一轮的修复排在 K 提交之后。

| 组 | 修了什么 | 提交 |
|---|---|---|
| JA 平衡点 | `parse` 给每个表达式算**运行时舍入误差界**（每步运算加 eps，函数按 \|f'\| 传播）和下溢标志（#31，cos(x) − 1 这类消去的重根现在按表达式自身各项的舍入下界接受）；雅可比差分步相对盒子并按函数自适应，去掉绝对 1e-6（#33）；平衡点探测从该点的位置分辨率起步（#22，\|x\|^(1/3) 的 α 在 2/3 ± 0.05）；**耗尽的 Newton 运行不再按几何尾外推接受**，尾部只作半径（#29、#23）；方向相关奇点 x²/(x²+y²)（#35）；下溢平台（x' = y, y' = exp(x) 在 [−1000,1000]² 报 `underflowPlateau` 而不是连续解集，#30）；位置容差不低于 8 eps\|p\|（#34，sin 格点在 x0 = 999990 处仍完整）；`region_of_equilibria`（0/0、max(x−1,0) 这种在二维区域上为零的场，#37）；(x+y)² 线不再报奇点（#38）；格子角点上的可去奇点（x log\|x\|，#40）；顺带把 A1 留下的 J.8 `it.fails` 变成通过的测试（#41） | 18abaa7, b2365dd, c50399f, 02e7808 |
| JB 常数解 | 阶梯自适应下降到位置下界 / 60 级（#19，tanh(1e6 y) 在 [−2.5e5, 2.5e5] 上找到）；稳定性在最细可用级读符号（#20，(y−1)(y−1−1e-5)）；只在部分 t 范围有定义的线（#21，sqrt(t)·y）；下溢平台边缘不再报成解、有平台说明（#17）；全零扫描不再走「M ≡ 0」捷径（#18，y·exp(−100y²) 在 [−1000,1000] 找回 y = 0）；y·log(y) 的可去点精确报 0（#24）；一格两根做 deflation，并**总是显示扫描分辨率一行**（#25，只修了一半）；分数幂提示只在表达式确有分数幂时加（#27）；sin(1/y) 的 y = 0 不再列出、exp(−1/y²) 在三个盒子上一致（#4、#5） | 6c01cac |
| JC 二阶 / 文案 | unicode −、×、·、÷ 在所有模式归一化（#16）；仿射性在 x'' = −3.7…10 的 8 个值上探测，abs(x'')、max(x'', −1)、sqrt(x''²) 一律拒绝（#1、#10）；x' 出现在 x'' 系数里（(1 + x'²)·x'' = −x，#9）；x''(t) + x(t) = 0 记法（#11）；xx''、tx'' 报隐式乘积并给出提示，占位符永不泄漏（#12）；`formatNumber` 保留有效数字、只有精确 0 才打成 0（#3，(−1e-5, 0) 与 (1e-5, 0) 分得开）；按定义排除的 Bernoulli 单独一行说规则（#6）；奇点截断只说一次（#8）；非自治轨线句子按实际追踪方向措辞（#14、#15） | 675e784, c71882b, 8ac64af, c2eb08c |
| 集成 | 唯一性测试里打印的点改从 scene 推导（formatNumber 变化后） | 80559da |

##### 审查第三轮（冻结在 18eef51，K2/K3 之后）与最后一轮修复（`[fix]`，HEAD 3dd4f27 = `j-math-done`，测试 797）

- **21 条**发现，四个视角（kernel-classroom 6、site-embed-url 4、gestures-text 10、tools-mcp 1），**每条带课堂可能性标签**：classroom 15、edge 5、extreme 1。这一轮不再派反驳者，由编排者按标签分诊：classroom 和 edge 全修，extreme 的 1 条（#20，下溢平台句子说「两侧连续趋近」只是浮点证据）留着。
- kernel-classroom 的三条 high 都是课堂例子：展开形式的重根 y(1−y) − 1/4 找不到（分解形式能找到）；秩亏雅可比的平衡点漏掉（logistic 猎物的捕食模型丢 (1,0)、x' = xy, y' = x² − y 报 none_found 且跑 1–1.5 s）；这些点附近停住的 Newton 运行被说成「场不连续，不是平衡点」，44–47 句。

| 组 | 修了什么 | 提交 |
|---|---|---|
| FA 平衡点 | 奇异雅可比阈值改为**实测**的 detTol = max(16 eps, 2(ρ₀ + ρ₁))（ρ 为行噪声 / 最大元），绝对的 1e-8 退出搜索路径；残差下界和差分行噪声计入坐标量化 \|J_ij\| eps \|p_j\|；步的接受看「残差下降或带下界的残差下降」；停住点按各自声称半径聚类，最多一句；\|c\| ≤ 分辨率的坐标在算雅可比前**贴到 0**（7.36e-322 那种不再打给学生）。竞争模型、x' = xy, y' = x² − y、x' = y, y' = x² − y 在 1×/10× 盒子和 1e±3 单位下都列出 (1,0) 或 (0,0) non_hyperbolic、零奇点；cos(x) − 1 在 [−100,100] 上 ±14·2π 的根曾丢失，差分步扩到行噪声 10% 修回。**#5「同样输入两次结果不同」没有复现**：Duffing 和阻尼单摆各跑 20 次深度相等，内核无模块级可变状态，保留为回归测试 | 648814e |
| FA 文案 | `repeatedRoot` caveat 改为在误差判定模式下也为真的说法（特征值在数值精度内重合、判别式在估计误差内为零、精确重根与近重根数值上分不清） | 701e7a4 |
| FB 常数解 | 消去型重根：零到精度的带有一格宽的毛边，改用**上升检验**（四分点处 \|M\| 超过舍入界 10 倍）判零集是否连通；y(1−y) − 1/4 → 0.5、y² − 2y + 1 → 1，半稳定，盒子与尺度不变；dy/dt = 0 / M ≡ 0 报「右端恒为 0」专用句子；**一阶方程的自治性也改静态规则**（表达式提到 t 就非自治，t·sqrt(y) 在 [−4,0] 上不再「untestable」）；连续零采样之间 M 上升就拆开（y(1−y)(2−y) 在 [−200,200]、[−400,400] 上三个根都在）；`hasFractionalPower` 认 pow(y, 2/3) | 6d7bdb6, 592bb56 |
| FC 手势与外壳 | 双指缩放的中点平移不再丢（pan + pinch 合成一次函数式更新）；右键菜单和 12 px 提示只对触摸指针（鼠标行为逐字节不变）；`(pointer: coarse)` 下网页外壳和 widget 都换触屏提示；第三指抬起不结束 pinch，pan/pinch/长按清掉双击记忆；两个外壳按定义排除的 Bernoulli 不再混在「未通过」里、截断句只说一次；`<html lang>` 跟随语言 | e6f800f, e08a645 |
| FC 站点文案 | 帮助页悬停颜色（青色一条，固定后才分蓝/橙）、标记图例补星形/退化结点和奇点中心点、「未通过的形式」句子、logistic 卡片（y(0) > 0 的解趋向 y = 1）；**嵌入高度按实测**：logistic 例子在 960 px 宽 1267 px、800 px 单列时 1809 px、无表单 1243 px → 常数 1280 / 1260 并在文案里写明单列约 1820 px | 7202576 |
| 集成 | FB 与 FC 各自加了「右端恒为 0」句子，重复了，删掉 FC 的 `lib/labels-forms.ts` 那份 | 3dd4f27 |

##### J 阶段之后仍然开着的（详见 open-questions）

- 3 个 `it.fails`：`y − 1e-20` 贴 0 的旧期望（新行为报 1e-20 并有新测试）；平面尖点平衡点从不含原点的盒子出发标不出来；x'' = −x + x'/x' 在定义域外的点 (1, 0) 仍列出平衡点。
- x' = xy, y' = x² − y 仍要 1–2 s（四叉树沿 x 轴每个格子都细分到底，1024 次封顶的运行各爬约 80 步）；sin(100y) 在 [−10,10] 上 637 个根只列 165 个（只靠「扫描分辨率」那行说实话）；sin(1/y) 无穷多根的子集随盒子变（明确 SKIP）。
- 第二轮里明确按「极端盒子」跳过的：x⁷ 在半宽 ≥ 1.5e5 的盒子丢原点；K ≥ 1e9 的病态线性系统；大盒子上紧贴极点的根；部分枚举的格点被判连续解集（#36）；相距 2e-10 的两个单根合并（#39）；#26（y − 1e9 − 0.5 在 [1e9, 1e9+1] 上）报告里没有提到，视为未处理。
- 第三轮 extreme 的 #20（平台句子的措辞）未改。

---

#### K 阶段：网站完整化（tag `k-website-done` = f7ab5ca）

K1（URL 状态 + 组件抽取 + embed + 预设）先在 90989ed 上做；K2（文案 / 首页 / 帮助 / 元信息）和 K3（触屏 / 响应式 / PNG）并行 worktree，rebase 后 ff 合入（c9965a1、18eef51）。

| 项 | 做了什么 | 提交 |
|---|---|---|
| K.1 组件抽取 | 页面主体原样移到 `components/VectorFieldApp.tsx`（纯移动，便于 `/vector-field` 和 `/embed` 共用） | 2ddb00b |
| K.1 URL 状态 | `lib/url-state.ts`：`AppState`、`encodeState` / `decodeState` / `buildShareUrl`；参数 `m`（first / diff / system / second）、`g` / `f` / `M` / `N` / `eq`、`tmin/tmax`（一阶）或 `xmin/xmax`（系统、二阶）、`ymin/ymax`、`loc`、`eqs`（只在关闭等比时写 0）、`d`（5..40）、`arrows`、`t0`、`traj`（`x,y;x,y`，≤ 20 条，6 位有效数字）；默认值一律省略；解码走同一套解析器白名单，永不抛错，非法项逐个记入 `problems`（reason：queryTooLong / invalidExpression / notANumber / invertedRange / badChoice / tooMany / malformedPair …）；查询串上限 4096 字符、表达式 200 字符、数值 ≤ 1e6 | 978b8ad |
| K.1 同步与复制 | `history.replaceState` 防抖 500 ms，只在状态能编译时写、只写输入范围、embed 模式不写；「复制链接」用剪贴板，失败退回只读输入框；顶部显示「链接里这些参数无效，已忽略并使用默认值：…」；`/vector-field` 改为在服务端解码 `searchParams` 的动态路由 | 6df5ffe |
| K.2 嵌入 | `/embed` 路由（复用同一组件，`embed` / `controls` props）、`robots: noindex`、顶栏只有语言下拉 + 「打开完整页面」（带当前状态）、`controls=0` 时方程以文字显示；`next.config.ts` 的 `headers()` **只给 `/embed`** 加 `Content-Security-Policy: frame-ancestors *`，`/widget`、`/vector-field` 不加任何 frame 头（curl 验证）；画布按容器尺寸（ResizeObserver，300..900 px，高 = 宽 × 0.72），完整页面也这样（手机上固定 720 px 会溢出）；800 px 以下单列 | db99f2e |
| K.5 预设库 | 9 个章节组、20 个预设（可分离 / 线性 / 恰当 / Bernoulli / 齐次 / 解不出来的 / 唯一性失效 / 二阶与系统 / 非自治），`<select>` 分组，每个预设就是一条可分享链接（`presetUrl`）；简谐振子等于默认状态，链接只剩 `?traj=1,0;2,0` | 9105538 |
| 文档 | README「分享链接与嵌入」一节、CLAUDE.md | 61ee1e7 |
| 测试门禁 | vitest 排除 `lib/**/__probe__`（审查智能体的探针不进门禁） | bac644a |
| K.3/K.4 文案 | `lib/site-text.ts` 双语长文 + 键集合一致性测试 | 9e5b8f0 |
| K.3 首页 | 面向学生和老师：一句话说明、入口按钮、4 张示例卡片（logistic、阻尼振子二阶写法、恰当方程、Lotka–Volterra，都是 `/vector-field?…` 链接）、能做什么 + 明确边界（二维、数值非符号）、底部 GitHub / 帮助 / 「本站不使用 cookie、不做任何追踪」；`?loc=` 在服务端读，首屏就是链接语言，没有时客户端跟浏览器语言 | 6584572 |
| K.4 帮助页 | `/help` 六节：记号约定（函数列表来自 `ALLOWED_FUNCTIONS`）、操作说明（鼠标 + 触屏）、结果怎么读、已知限制、嵌入（iframe 片段 + Google Sites 步骤 + 复制按钮）、连接 Claude（放最后） | ae5fc59 |
| K.8 元信息 | 每页 `<title>` / description、Open Graph（`app/opengraph-image.tsx` 用 next/og 生成 1200×630 PNG，66.9 KB）、`app/icon.svg`、`robots.txt`（Disallow `/embed`、`/mcp`，带 sitemap）、`sitemap.xml`（/、/vector-field、/help） | c9965a1 |
| K.6 触屏 | `lib/gestures.ts` 纯状态机（tap / 双击 / 长按 / 单指平移 / 双指缩放；触摸 8 px 阈值，鼠标保持 3 px）；画布只对 `pointerType === "touch"` 走触屏路径，鼠标路径逐字节不变；`touch-action: none` 只在画布上；画布绘制抽到 `components/drawScene.ts`（不进 `lib/render`，保持其纯几何） | 5f2c204, 80bfc32 |
| K.6/K.7 | `(pointer: coarse)` 下控件 ≥ 44 px、触屏版提示文字；「下载 PNG」：`exportScenePng` 2× 离屏画布 + 页脚一行（方程、当前显示范围 3 位有效数字、站点地址），文件名带时间戳；导出的是**当前视口**（缩放后就是缩放后的图） | 18eef51 |
| 验收修复 | 链接切换模式但表达式无效时，回退值曾是系统模式的 `-x`（一阶里 x 被拒绝，页面既有提示又有解析错误、没有图）→ `MODE_DEFAULT_EXPRESSIONS`（first: `y*(1 - y)`，diff: `t` / `y`，second: `x'' + 0.5*x' + x = 0`）+ 3 个推导测试 | f7ab5ca |

测试：K1 在自己的分支上 574；K2/K3 合入后 775（772 通过 + 3 预期失败）。浏览器验收见「网站验收结果」。

---

#### L 阶段：MCP 层收尾（tag `l-mcp-done` = 1e825bc）

| 项 | 做了什么 | 提交 |
|---|---|---|
| L.1 触发规则 | 五个分析工具的 description **都以 "CALL THIS TOOL FIRST …" 开头**，按工具定制（一阶：「标准的恰当或可分离方程正是你最想跳过的情形」；二阶：「有特征方程的线性振子正是你最想跳过的情形」；trace_trajectory：具体系统 + 具体起点；sample_field：只要方向场不要平衡点分析），共用尾句「即使能求出闭式解也要调用本工具，用数值结果核对推导并把图展示给学生，不要仅凭符号推导作答」，然后才是 "WHAT IT COMPUTES"（原文）和原有的 USE THIS / 表达式规则 / 范围 / locale；`ping` 不动。补了两句：二阶方程必须对 x'' 仿射（系数可含 x、x'、t，x''²、sin(x'') 拒绝）；负底数分数幂的提示在每个工具的语法规则里都说一遍。测试锁定前缀、顺序和逐工具措辞 | 06deb55 |
| L.2 J 成果的暴露 | 读 `tools.ts` 加协议级测试，全部一次通过（没有发现缺口，所以没有改工具或文案）：奇点句、下溢平台（只说一次）、`region_of_equilibria`、右端恒为 0 + 扫描分辨率、降阶句在第一行、三个工具的快照 t、平衡点唯一性 / 非唯一轨线 / 截断句的中文版 | 3b777d7 |
| L.3 widget | `WIDGET_VERSION` h-2 → **l-1**（URI `ui://vector-field-tool/widget.html?v=l-1`，server.test 锁定，smoke 检查 resources/list 和 resources/read 都带它）；widget 本来就通过与网页外壳相同的 helper 渲染 J 的全部新内容（唯一性句、非自治说明、降阶句、奇点 / 连续 / 截断句、边界虚线和 '!' 标记来自共用的 `drawScene.ts`），补了两处缺口：等比开关（共用 hook，常驻警告，范围行「等比 / 填满」）和每个平衡点的 "tr = …, det = …"；CSP 块（connectDomains / resourceDomains / baseUriDomains）、assetPrefix、根布局 history 补丁都没动 | e7b98bf |
| L.4 模拟主机 | E 阶段的 harness 从没进过仓库，新写 `scripts/mock-host/`（`npm run mock-host`）：host.html 在 :3520（转发 POST /mcp、应答 ui/initialize、收 initialized / size-changed、推 tool-input / tool-result），sandbox.html 在 :3521 **按 URL** 加载 widget HTML 到嵌套的 sandboxed iframe，CSP 头由 `_meta.ui.csp` 生成（无 eval）。srcdoc 方式不能让 Next 水合（chunk 相对 about:srcdoc 解析），真实主机也是按沙箱域名 serve 的，所以模拟主机照做 | 1e825bc |

**模拟主机实测**（`BASE_URL=http://localhost:3510 npm run build` + `next start -p 3510`）：smoke 19/19（含「资源地址是绝对的」PASS 而不是 SKIP、l-1 URI）；握手 ui/initialize（vector-field-tool-widget 0.3.0）→ initialized → 「已连接，等待工具调用…」；`analyze_first_order sqrt(y)`（y ∈ [−0.3, 1.5]，zh）走本地编译路径（「实际显示范围」一行出现）、y = 0 边界句「方程只在这条线的上方有定义，该侧的解离开它」、唯一性句（δ^−0.5、Lipschitz）、等比开关、4 种形式 + caveat，底图全画、y = 0 线画出；`analyze_system y / −x + sin(t)`，t = 1.5：无平衡点、「t = 1.5 时刻的快照」、「解曲线从 t = 1.5 出发」；`analyze_second_order x'' + 0.5x' + x = 0`（en）：降阶 `x' = y, y' = -(0.5 * y + x)`，"(0, 0) stable spiral … tr = -0.5, det = 1"；悬停 → 覆盖层 0 → 3733 个已画像素；滚轮 → 范围收窄（x ∈ [−1.987, 2.856]）；拖动 → 平移；双击 → 复位；取消等比 → 「filled to the entered range」+ 警告，再勾回；`size-changed` 3 次（如 {width: 720, height: 989}）iframe 随之调整；主机页控制台无 error，widget 内只有已知无害的 zod script-src/eval CSP 探测。

回滚：`git checkout k-website-done`；从那个 tag serve 的 widget 是 ?v=h-2，回滚后同样要重连连接器。

---

#### 网站验收结果（编排者在会话自带浏览器面板实测，`next dev`，2026-09-09 上午）

环境：Windows 本机 dev server（localhost:3000），跨源测试用 Node 静态页（localhost:3601）。浏览器面板在隐藏状态下视口为 0，因此高度类测量不可靠（见末尾）。

**预设逐个点击**（`select[name=preset]`，9 个章节组、20 个预设）
- 20 个预设全部画出图（画布非白像素 9%–13%），无 `role=alert`，模式自动切换正确（explicit / differential / system / second）。
- 结果核对：logistic y=0 不稳定 / y=1 稳定；阻尼振子（系统与二阶两种写法）都是 (0,0) 稳定螺旋 −0.25 ± 0.96825i；Van der Pol 不稳定螺旋 0.5 ± 0.86603i；Lotka–Volterra 鞍点 + 中心或弱螺旋；单摆 kπ；星形结点带"重根或近重根"caveat；非自治 `x' = y, y' = −x + sin t` 显示快照说明、不报平衡点；恰当方程 (0,0) 奇点 + 齐次/恰当一致；`t dt + y dy = 0` 与 `(t+y)/t` 按静态规则报"右端含有 t，方程不是自治的"。
- 每个预设的特征计算 1–3 s 内完成（含 250 ms 防抖）。

**分享链接往返**
- 从 `?m=system&f=y&g=-x-0.5*y&…&traj=1,0;2,1&loc=en` 进入：2 条固定轨线还原（"Clear trajectories (2)"）。
- 改 xMax→4、取消等比、密度→25、语言→中文后 500 ms 内地址栏变为 `?g=-x-0.5*y&xmax=4&loc=zh&eqs=0&d=25&traj=1,0;2,1`（默认值全部省略）。
- "复制链接"：沙箱里剪贴板不可用，走兜底只读输入框，内容为完整 URL。
- 用该 URL 重新打开：表达式、范围、语言（`<html lang="zh-CN">`）、等比关闭 + 常驻警告、密度 25、2 条轨线全部还原。

**非法链接**
- `?m=first&g=x*y&tmin=5&tmax=1&d=abc&traj=NaN,1;1,1;2,2&loc=zh&eqs=9&arrows=zzz` → 200，页面显示可读提示："链接里的这些参数无效，已忽略并使用默认值：g（表达式无法解析）、tmin（范围下限不小于上限）、tmax（…）、eqs（不是允许的取值）、d（不是整数）、arrows（不是允许的取值）、traj（有格式错误的轨线起点，已跳过）。"
- 发现并修复：切换到一阶模式但 g 无效时，原回退值是系统模式的 `-x`（一阶里 x 被拒绝），页面既有提示又有解析错误、没有图 → `MODE_DEFAULT_EXPRESSIONS` + 3 个推导测试（f7ab5ca）。
- 5000 字符查询 → 200 + 提示；`g=<script>alert(1)</script>` → 200，页面里不含原样脚本，只有提示；`m=second&eq=abs(x'')=x` → 200 + 提示。

**跨源嵌入**
- `curl -I /embed` → `Content-Security-Policy: frame-ancestors *`，无 `X-Frame-Options`；`/widget`、`/vector-field` 无任何 frame 头。
- localhost:3601 的静态页用两个 `<iframe>` 加载 localhost:3000/embed（不同源）：截图可见 iframe 内画布与表单正常渲染（不是白屏）；`controls=0` 的 iframe 同样加载。
- 直接打开 `/embed?…&controls=0`：无表单、无输入框，顶栏只有语言下拉 + "Open full page"（链接带当前状态），方程以文字显示，画布非白像素 11.6%。

**窄视口（375 px 预设）**
- 单列布局（`.vf-columns` flex-direction: column，表单在上、画布在下）；画布不超出视口、无横向滚动；所有按钮/下拉/输入最小高度 44 px；画布 `touch-action: none`；提示文字改为触屏版（"轻点预览解曲线 · 长按固定 · 双指缩放 · 拖动平移 · 双击复位"）。

**PNG 导出**
- 点击"下载 PNG"（拦截 `URL.createObjectURL`）：得到 `image/png` blob 309 KB，尺寸 1440×1080 = 2 × (720 × (518 + 22 px 页脚))；文件名 `vector-field-explicit-<时间戳>.png`。

**首页 / 帮助页 / 元信息**
- `/`：中文首页，入口按钮、4 个示例卡片链接（logistic、阻尼振子二阶、恰当方程、Lotka–Volterra，均为 `/vector-field?…` 可分享链接）、"本站不使用 cookie…"、GitHub 与帮助链接；`/help?loc=en` 六节：Notation / Controls / How to read the results / Known limits / Embedding / Connecting Claude (optional)，iframe 片段带 Copy 按钮，函数列表来自 `ALLOWED_FUNCTIONS`。
- curl：`/robots.txt`（Disallow /embed、/mcp，含 sitemap）、`/sitemap.xml`（/、/vector-field、/help）、`/icon.svg`、`/opengraph-image`（image/png 66 KB）、首页 og:title / og:description / og:image 均 200。

**控制台**
- 无新的 error：只有 dev 模式的 HMR websocket 沙箱失败，以及 I 阶段修复前残留在同一标签页缓冲区里的 14 条旧警告（重新导航后计数不再增加）。

**未能在本机验收的**
- 帮助页推荐的 iframe 高度（带控件 1280 px / 只读 1260 px）是代理在窄视口测量的；隐藏面板视口为 0 无法复测桌面宽度下的真实高度。站长嵌入到 Google Sites 后按实际调整。
- `npm run smoke -- https://tools.studycase.net/mcp`（线上）未跑：未推送、未部署；本地生产构建 smoke 见下。
- 真机触屏手势（双指缩放、长按）未测；只测了纯状态机与 375 px 布局。

**响应头与 smoke（生产构建，`next start`）**

```
（最后一轮修复后，3dd4f27，port 3570）
GET /vector-field -> 200; GET / -> 200; GET /help -> 200
/embed:        HTTP/1.1 200 OK, Content-Security-Policy: frame-ancestors *, no X-Frame-Options
/widget:       HTTP/1.1 200 OK, no CSP header, no X-Frame-Options
/vector-field: HTTP/1.1 200 OK, no CSP header, no X-Frame-Options
node scripts/smoke.mjs http://localhost:3570/mcp: 18/18 passed
  (1 SKIP: widget asset URLs absolute — BASE_URL unset locally; widget uri …?v=h-2)   exit 0

（L 阶段之后，1e825bc，BASE_URL=http://localhost:3510 npm run build + next start -p 3510）
node scripts/smoke.mjs http://localhost:3510/mcp: 19/19 PASS
  incl. "widget asset URLs are absolute" PASS, "resources/list and resources/read carry the l-1 widget URI", CSP check PASS
```

---

#### 验证输出（main = 1e825bc，2026-09-09 17:03，写本文档前重跑）

```
$ npm run typecheck        （tsc --noEmit）
(无输出) exit 0

$ npm test                 （vitest run，v4.1.11）
 Test Files  30 passed (30)
      Tests  808 passed | 3 expected fail (811)
   Duration  32.64s
exit 0

$ npm run build            （Next.js 16.3.4 Turbopack，本地无 BASE_URL）
✓ Compiled successfully in 425ms
Route (app)
┌ ƒ /
├ ○ /_not-found
├ ƒ /embed
├ ƒ /help
├ ○ /icon.svg
├ ƒ /mcp
├ ○ /opengraph-image
├ ○ /robots.txt
├ ○ /sitemap.xml
├ ƒ /vector-field
└ ○ /widget
exit 0

$ git log --oneline h2-reviewed..HEAD
1e825bc [L] scripts: two-origin mock MCP Apps host for exercising the widget without Claude
e7b98bf [L] widget: version l-1, equal-scale toggle, tr/det in the equilibria list
3b777d7 [L] tools: derived exposure tests for the Phase J results in both locales
06deb55 [L] tools: every analysis tool description starts with the call-first rule
f7ab5ca [fix] url-state: a link that switches the mode falls back to that mode's expressions
3dd4f27 [fix] integrate: drop the duplicate identically-zero line in both shells
7202576 [fix] site-text: hover color, embed heights, marker legend, failed forms, logistic card
e08a645 [fix] shells: excluded forms, single truncation sentence, identically-zero line, html lang
e6f800f [fix] gestures+canvas: pinch as one update, touch-only context menu, touch hint
592bb56 [fix] integrate: shells pass identicallyZero to noConstantSentence
6d7bdb6 [fix] slope-field: cancellation-aware double roots, identically-zero right-hand side, static autonomy, zero runs
701e7a4 [fix] labels: repeated-root caveat true in both regimes
648814e [fix] equilibria: rank-deficient roots, stall vs discontinuity, coordinate snap
18eef51 [K] app: 44 px targets, PNG export with footer
80bfc32 [K] canvas: touch gestures, drawScene extraction
5f2c204 [K] gestures: pure touch state machine
c9965a1 [K] meta: site metadata, OG image, favicon, robots and sitemap
ae5fc59 [K] help: /help with notation, controls, reading the results, limits, embedding, Claude
6584572 [K] home: bilingual home page with example cards and the site shell
9e5b8f0 [K] site-text: bilingual copy of the site pages with key-parity tests
80559da [J-fix2] integrate: derive the uniqueness test's printed point from the scene after the formatNumber change
c2eb08c [J-fix2] tools/labels: excluded forms say their rule, truncation said once, direction-aware non-autonomous sentence
8ac64af [J-fix2] labels: formatNumber keeps significant digits; only an exact 0 prints as 0
c71882b [J-fix2] second-order: probe x'' at both signs, x' inside the coefficient, x(t) notation, implicit products, no placeholder leaks
675e784 [J-fix2] parse: normalize unicode minus, ×, · and ÷ before parsing in every mode
6c01cac [J-fix2] slope-field: adaptive vanishing ladder, partial-t-range lines, zero plateaus, deflation, honest notes
02e7808 [J-fix2] equilibria: no extrapolated roots, term-based floor, underflow plateau, units, corners
c50399f [J-fix2] uniqueness: a point's location resolution bounds the equilibrium probe
b2365dd [J-fix2] jacobian: step relative to the box and adapted to the function, no absolute 1e-6
18abaa7 [J-fix2] parse: running rounding-error bound and underflow flag per expression
bac644a [K] vitest: exclude lib/**/__probe__ from the gate
61ee1e7 [K] docs: share links, /embed and the preset library in README and CLAUDE.md
9105538 [K] presets: chapter library with shareable links
db99f2e [K] embed: route, frame-ancestors header, container-sized canvas
6df5ffe [K] app: URL sync, copy link, initial trajectories
978b8ad [K] url-state: AppState, encodeState / decodeState / buildShareUrl with validated links
2ddb00b [K] app: page body moved into components/VectorFieldApp (pure move)
35c6bbc [J-fix] integrate: singular-point lines flow through equilibriaNotices (main ff3a200 + j3 C.7)
8ee7f4c [J-fix] labels: second-order syntax hint documents the numerical check
419b76c [J-fix] labels+scene+shells: non-autonomous wording, singularities warning, truncation sentences, bilingual second-order errors
d0b7550 [J-fix] time-dependence: static rule (t present = non-autonomous), probe as evidence, snapshot t honored
d2ee294 [J-fix] second-order: t-dependent coefficients, box samples, prime normalization, conservative simplification, error codes
2ea8f84 [J-fix] integrate: vanishing test on the new uniqueness descent (minOffset), singular-point merge
b69df72 [J-fix] uniqueness: rounding floor from the local magnitude of g
dbe9979 [J-fix] labels+canvas: domain-edge wording, short stability tags
c327b51 [J-fix] interactive: curve-based non-unique flag
5a88fea [J-fix] slope-field: local root acceptance, cusp roots, box-edge domain edges, autonomy untestable
401ba78 [J-fix] uniqueness: finest-scale verdict, box-independent probe
0a792c5 [J-fix] equilibria: rank-one pseudo-inverse step, sign-change quadtree, domain-edge seeds, per-entry zero floors
9833db8 [J-fix] jacobian+classify: per-entry errors, error-based determinant/trace/discriminant decisions
ff3a200 [J-fix] shells: report the field's singular points found by the equilibrium search
aa20d92 [J-fix] equilibria: local acceptance criterion, row-scaled Newton solve, resolution-based dedupe, vanishing test
90989ed [J] integrate: analyze_second_order shares the non-autonomous snapshot branch through analyzePlanar
4c59e01 [J] shell: second-order input mode and preset
86d031a [J] tools: analyze_second_order; analyze_system body shared as analyzePlanar
b124d11 [J] second-order: reduction x'' = F(x, x') -> planar system at the string level
ef6d53c [J] tools+shells: snapshot semantics for non-autonomous systems, no equilibria or stability claims
5eda07f [J] time-dependence: numerical probe for non-autonomous systems
40df35c [J] interactive+tools+shells: non-unique trajectories and uniqueness sentences
285a928 [J] slope-field: domain-edge constant solutions, one-sided stability, uniqueness per solution
37e211a [J] uniqueness: difference-quotient growth probe for Lipschitz failure
4002fc5 [J] shells+tools: show truncated lists and the domainEdge caveat
b7093d0 [J] classify: error-based zero decisions for ill-scaled Jacobians
f9e18b3 [J] equilibria: connected components before the continuum test; independent truncated flag
2dccce1 [J] equilibria: adaptive seeds and a |F| local-minimum self-check; domain-edge roots
f562d39 [I-fix] axis names: the horizontal name sits below the axis line, clear of constant-solution labels
d80b86f [I-fix] shell: selected preset uses a full border, not borderColor over the shorthand
5b48c50 [I-fix] docs: equal-scale toggle, {hv} convention, features-box rule, test count
dd285d7 [I-fix] smoke: skip the absolute-URL check on a local build without BASE_URL
6a2faf1 [I-fix] interactive-scene: features box is the entered range at the home view
560bcb1 [I-fix] shells: mode-aware last-trajectory line via lib/labels-trajectory
dbb61f2 [I-fix] shell: mode-aware left-hand-side explanation, differential compile order
35307f5 [I-fix] detect-form: English articles inside FORM_NAME.en
f383b1a [I-fix] slope-field: left-hand-side check on the raw g / M / N before wrapping
2e1d9a6 [I-fix] parse: mode-aware left-hand-side message, comparison typo, assertNoLeftHandSide
d232e2a [I] shell: equal-scale toggle with persistent warning
85d8ca3 [I] interactive-scene: equalScale input
f02a2df [I] viewport+arrows: optional non-equal scale, anisotropic arrow directions
a12a3c4 [I] docs: README, CLAUDE.md, home page in t notation
c77ed95 [I] tools: analyze_first_order in dy/dt notation
8a5a30d [I] labels+shell: t notation, t min/t max, readable x and left-hand-side hints, axis names
e2145ed [I] core: first-order notation dy/dt = g(t, y), M dt + N dy = 0 in detect-form, exact, scene
d1f13ad [I] slope-field: first-order specs compile in variable mode t,y; tRange option; dy/dt notation in tests
502e737 [I] parse: first-order variable mode t,y; x and left-hand sides rejected with readable hints
8e52630 [H2-fix] docs: mark the atol question resolved by C0, test count, widget h-2

$ git tag
a-core-done b-tools-done c-render-done d-webshell-done e-widget-done f-forms-done
g-render-done g-widget-done h1-deploy-ready h2-math-done h2-reviewed i-notation-done
j-math-done k-website-done l-mcp-done night-final p0-verified s-spike-done
```

测试数变化：H 结束 337 → I 结束 409 → J 集成 538 → J-fix 638 → J-fix2 + K2/K3 775 → 最后一轮修复 797 → L 结束 811（808 通过 + 3 个 `it.fails`）。

#### 验证清单（按「最快发现问题」排序；每步失败回滚到哪个 tag）

先说明 tag 的一个特殊之处：`j-math-done`（3dd4f27）在提交线上排在 K 的绝大多数提交**之后**（J 的第二、三轮修复晚于 K 合入），所以「退掉 K 但保留 J」没有对应的 tag；退掉 K 只能退到 `i-notation-done`（J 和 K 一起退）或无 tag 的提交 35c6bbc（J 第一轮修复之后、K1 之前）。

1. **本地三绿** `npm run typecheck` / `npm test` / `npm run build` —— 1 分钟内知道代码是否完整；`npm test` 应是 808 通过 + 3 expected fail。失败：`git checkout k-website-done`（L 之前）；再不行 `j-math-done`。
2. **打开 `/vector-field`**：预设下拉应有 9 个章节组；每个章节点一个（logistic、`-2*t*y`、`-y + sin(t)`、恰当方程、Bernoulli、齐次、Riccati、`sqrt(y)`（应有唯一性失效句子和 '!' 标记）、二阶阻尼振子、非自治 `x' = y, y' = -x + sin(t)`（应只说快照、不报平衡点））；画布有图、没有红色错误框、控制台无 error。失败：预设或图坏 → `i-notation-done`；只有 J 的句子不对 → 同样 `i-notation-done`（J 在 K 里面）。
3. **分享链接往返**：改表达式、范围、语言、取消等比、密度，点「复制链接」，新标签页打开 → 全部还原（含固定轨线）。失败：`i-notation-done`（K.1 之前没有 tag；只想退掉验收修复 f7ab5ca 用 `j-math-done`）。
4. **非法链接** `/vector-field?m=first&g=x*y&tmin=5&tmax=1&d=abc` → 页面顶部一段「链接里的这些参数无效，已忽略并使用默认值：…」，图照画，不是白屏或 500。失败：同上。
5. **`/embed` 嵌进 Google Sites**：Google Sites 里「插入 → 嵌入 → 嵌入代码」，贴 `/help` 嵌入一节复制来的 iframe 片段；应显示画布和表单（`controls=0` 版只有图和方程文字）。失败：先 `curl -I https://tools.studycase.net/embed` 看有没有 `Content-Security-Policy: frame-ancestors *` 且没有 `X-Frame-Options`（Vercel 或 next.config 的头被覆盖是最可能的原因）；代码回滚 `i-notation-done`。高度不够就改 iframe 的 height，不是代码问题。
6. **手机**：单列（表单在上、画布在下）、页面能滚动、双指缩放画布、单指拖动、双击复位、长按固定轨线、轻点预览；不应出现整页被画布拖走。失败：K3 之前的提交 c9965a1（无 tag）；整个 K 退掉用 `i-notation-done`。
7. **PNG 下载**：文件是画布 2 倍尺寸、底部一行「方程 · 范围 · 站点地址」。失败：同 6。
8. **Claude：断开并重新连接连接器**（widget l-1），问「用 ping 发 hello」—— 链路。失败与代码无关（先查部署 / `BASE_URL`）；代码回滚 `k-website-done`（widget 回到 h-2，同样要重连）。
9. **Claude：「分析 2*t*y dt + (t^2+y^2) dy = 0」** —— 模型**必须先调用** `analyze_first_order` 再作答（工具调用出现在推导之前）；widget 有紫色等值线、四种形式各带偏差。失败（模型仍直接推导）：这是 description 措辞的问题，回滚没有意义（旧版本更弱）；记下模型的原话进 open-questions，下一轮加强规则。
10. **Claude：「dy/dt = sqrt(y)」** —— widget 里 y = 0 常数解带「在这一点 ∂g/∂y 无界，Lipschitz 条件不成立，解的唯一性不能保证」的完整句子和 '!' 标记；从 (0, 0) 附近点出发的轨线说「数值解只是其中一条」；y = 0 的稳定性是「方程只在这条线上方有定义，该侧的解离开它」，不是「半稳定」。失败：`i-notation-done`（J 之前）。
11. **Claude：「x'' + 0.5*x' + x = 0」** —— 调 `analyze_second_order`，第一行是降阶 `x' = y, y' = -(0.5 * y + x)`，(0, 0) 稳定螺旋 −0.25 ± 0.968i，tr = −0.5, det = 1。失败：`i-notation-done`。
12. **`npm run smoke -- https://tools.studycase.net/mcp`** —— 19/19，`widget asset URLs are absolute` PASS 且指向你的域名，widget uri `?v=l-1`。失败：`k-website-done`（回到 h-2，重连连接器）；`[base-url]` 警告看 Vercel 构建日志。

---

#### 编排者追加：推送状态

**没有推。**会话末尾执行 `git push origin main` 时被会话的自动权限分类器拦下（推送 = 生产部署，需要你本人操作）。main 在本地领先 origin/main 86 个提交（h2-reviewed 之后的 85 个 + 本行所在的 docs 提交），四个 tag 也只在本地。要上线时：

```bash
cd E:\project\vector-field-tool && git push origin main && git push origin i-notation-done j-math-done k-website-done l-mcp-done
```

推完等 Vercel 部署结束，跑 `npm run smoke -- https://tools.studycase.net/mcp`（应看到 widget uri `?v=l-1`、19/19），然后在 Claude 里断开并重新连接连接器。

<!-- END SOURCE IJKL-summary.md -->

---

<!-- BEGIN SOURCE IJKL-decisions.md -->
<a id="history-ijkl-decisions"></a>

## 历史 12：IJKL-decisions.md

来源：[IJKL-decisions.md](IJKL-decisions.md)。下文为阶段原记录，时间和状态保持当时口径。

### I–L 轮决策记录（2026-09-08/09 夜跑）

所有偏离《记号改为 dy/dt + 网站完整化》文档的决定和理由，以及文档没有规定、由编排者或实现智能体拍板的细节。按阶段分组；智能体报告是「实际做成了什么」的依据，编排者的设计预案（`IJKL-decisions-draft`）里与之不同的地方以报告为准并注明。

#### 环境与工作树

- **会话落在 `E:\project\demo` 的 worktree 里**（桌面端默认项目），任务仓库是 `E:\project\vector-field-tool`。会话目录无法迁移（隔离 worktree），全部命令用绝对路径 `cd /e/project/vector-field-tool && ...`。demo 仓库一个字节没动。
- **并行实现用手工 worktree**：`E:\project\vft-wt\<name>`，分支 `wip/<name>`，各自 `npm ci`；做完在 worktree 里 `git rebase main`，再在 main 上 `git merge --ff-only wip/<name>`，历史保持直线（文档要求「直线推进不开分支」，这里的分支只活在合入之前）。reflog 里能看到每次 ff 合入（wip/i3、j2、j3、j4、k2、k3）。
- **智能体在 worktree 里不跑 `npm run build`**（只跑 typecheck + test），build 只在 main 合入后跑一次；每个合入点都做三绿。

#### I 阶段

- **I.1 内核坐标不改名**：`Vec2 {x, y}`、`Box`、平面系统 API 原样。一阶方程里学生看到的横坐标符号是 `t`，通过 `compileScalar(..., { variables: "ty" })` 把符号 `t` 绑定到 `p.x`（横坐标），`x` 在该模式下被拒绝并给可读提示（`ParseError.code = "x_in_first_order"`）。理由：把整个内核的 `.x` 改成 `.t` 是纯返工，且平面系统里 x 本来就对。
- **I.2 `SystemSpec.variables?: "xy" | "ty"`**：`toSystem()` 产出的归约系统带 `variables: "ty"`，Scene 里的 `system` 随之携带，widget 本地 `compileSystem(scene.system)` 不用改一行就正确。
- **I.3 左端检测**：`dy/dx =`、`dy/dt =`、`y' =` 开头的输入报 `lhs_in_expression`（"只需输入右端"），其中 `dy/dx` 再追加 "用 t 不用 x"。网页外壳按 `code` 显示双语句子；工具层错误保持英文（给模型看）。检测在 slope-field 包装之前对原始 g / M / N 做（`assertNoLeftHandSide`），否则包装后的 `-(…)` 会把左端藏起来。
- **I.4 MCP 参数名不改**：`analyze_first_order` 仍用 `xMin/xMax`（schema 不变、无别名），描述里说明它们是 t 的范围。理由：不破坏工具契约；L 阶段统一处理 description 时也没有改名。
- **I.5 齐次方程的缩放参数改叫 k**：`g(kt, ky) = g(t, y)`，因为 t 已被占用。
- **I.6 widget 版本号 I/J/K 都不 bump**：三个阶段都会改 widget 页面文字，统一在 L.3 从 h-2 bump 到 l-1，用户只需重连一次。已按计划在 e7b98bf 做了。
- **I.7 等比开关先只做在网页外壳**：hook 支持 `equalScale`，widget 到 L.3 才加开关（同一份 hook，几行代码）。
- **I.8 非等比时箭头方向**：按各向异性映射画（屏幕方向 ∝ (vx·sx, −vy·sy)），即与画出来的解曲线相切；常驻警告告诉学生角度 ≠ 斜率。另一种选法（保持真实角度）会让箭头和画出的曲线不相切，更误导。
- **特征盒规则**：复位视图时平衡点 / 常数解 / 类型识别按**输入范围**算（6a2faf1），与等比与否和画布长宽比无关——否则同一个链接在手机和桌面上会给不同的平衡点列表。缩放或平移后才按可见范围算，说明文字相应改写。文档只要求「等比状态进 URL」，没有规定特征盒；这一条是为了 K.1 的链接在任何设备上还原出同样的结论。

#### J 阶段

##### J.1 平衡点（首轮 + 三轮修复）

- **两条机制都做了**（文档要求）：自适应种子（沿扫描线 f、g 的变号次数，12..32/轴）+ 64×64 的 |F| 局部极小自检。审查第一轮发现 x⁷ 在 [−100,100]² 仍丢原点（扫描格子对原点的吸引域太粗），于是加了第三条：**变号四叉树**——在扫描格子角点上 f、g 同时变号的格子递归细分（深度 12），有根的格子不重跑但仍细分（x⁷ 的原点和鞍点 (1,0) 在 [−100,100]² 上共享一个格子）；每个上限（1024 次运行、8192 个格子、128 个根、256 个边界格子）都在 `seeding` 里报出。加上定义域边界种子（从有限格心向未定义邻居二分），共四个种子来源。
- **接受判据改为局部的**（审查 #1 的根因）：`fTol = tol × max(1, median |F|)` 随盒子增长，x⁸ + 1 在 [−100,100]² 上 |F| = 1 的点被当平衡点。现在一个 Newton 运行只在两种情况下算收敛：步长小于位置容差 stepTol = 1e-13 × 盒子（不低于 8 eps |p|，J-fix2 加的：1e-13 × 盒子在 x ≈ 1e6 处低于坐标本身的分辨率），或残差落到**表达式自身各项**的舍入下界（`parse` 的 `roundingBound`，J-fix2）。J-fix 曾允许「步长仍在缩小的耗尽运行」按几何尾 2|d|/(1−ρ) 接受，J-fix2 发现它接受了 exp(x)+1 的最小二乘点，于是**尾部只作声称半径，永不作判定**（02e7808）。最后一轮再把奇异判据从绝对 1e-8 改成实测的 max(16 eps, 2(ρ₀+ρ₁))。
- **去重用两次运行声称半径之和**，不是 max（任务草案写的是 max）：各自声称根在 locTol 内，两个圆盘相交才可能是同一个根；用 max 会把 x⁸ 的重根列两次。
- **消失性检验**：Newton 停住的非根点测 F 在该点是否连续（沿各方向差 |F(p+de) − F(p)| 随 d 缩小是否消失）；不消失的进 `singularPoints`（方向相关奇点 xy/(x²+y²)），消失的静默丢弃。最后一轮加了限制：只有实测差值在分辨窗口内**始终高于舍入界 10 倍**才叫「不连续」，否则是未解决的根候选（之前 logistic 猎物模型在 (1,0) 附近报 44–47 句「场不连续」）。
- **秩亏的步**：秩 1 雅可比用截断伪逆 d = −v₁(u₁·F)/σ₁（矩阵先按最大元缩放，避免 J^T J 溢出）；最后一轮又加了「残差下降或带下界的残差下降」的步接受，使 x' = xy, y' = x² − y 这类秩亏根能被接受（代价见 open-questions 的性能一条）。
- **逐元雅可比误差**（审查 #7）：`jacobianWithError.errors` 每个元素各自的差分 + 舍入误差，`classify` 的 det / trace / 判别式判零全部按误差传播（err(det) = e_a|d| + e_d|a| + …）。x' = 1e10 x, y' = 1e-10 y 从首轮的 non_hyperbolic 改判 unstable_node（e_d ≈ 4.4e-25 ≪ 1e-10）。判别式改算 (a−d)² + 4bc。**误差判定模式下重根永远带 `repeatedRoot` caveat**（差分雅可比的判别式精确为 0 是运气）；裸矩阵模式保持「精确 0 不带 caveat」以保住旧测试。最后一轮把 caveat 的措辞改成在两种模式下都为真。
- **雅可比差分步**：相对盒子和 |p| 的 1e-6 起步，截断误差 > 1e-7 |J| 时四分（最多 20 次，不低于 4 eps|p|），去掉绝对的 1e-6（在宽 4e-7 的盒子上把 3I 的星形结点判错）。
- **连通分量**：先按 4 近邻 + 欧氏 MST 的边分连通分量（只用 4 近邻时，均匀采样成簇的圆会裂成 4 段），连通边要求弦中点抛光后是**新的**零点（否则 sin(πx)² 的等距重根被第二近邻串成连续解集，回到 H 轮 C5 的反例），再在每个分量内部判几何。SI 模型 {xy = 0} 是一个连通的十字，所以期望是 1 个分量、两条轴都有点，不是任务草案写的「2 个分量」。
- **`region_of_equilibria`**：≥ 25% 的有限扫描样本精确为 0 的场（0/0、max(x−1,0)），跳过连续解集分析，直接报「二维区域上为零」；之前被说成「多个孤立退化平衡点」。
- **下溢平台**：某个分量在整个探测方向上精确为 0（exp(x) 在 x < −745）报 `underflowPlateau`，不报连续解集；只在最粗探测偏移处各方向都精确为 0 时才确认（x·y 紧挨真根不算平台）。
- **坐标贴零**：|c| ≤ 该点分辨率的坐标在算雅可比前贴到 0（7.36e-322 那种不再打给学生）。

##### J.2 唯一性

- **首轮判据**按预案（8 级、1e-2·尺度起每级 /4、α ≥ 0.25 且单调 → unbounded、0.1 → borderline），两处为诚实偏离字面：α ≥ 0.25 但差商不单调 → borderline 而不是 bounded；只有 4 个可用级且 α ≥ 0.1 → untestable。没有「唯一性成立」的句子：bounded_at_tested_scales 是测量，不是 Lipschitz 条件的证明。
- **J-fix 改为最细尺度下降**（审查 #12/#13/#25/#35：光滑右端在大盒子上被判非 Lipschitz，因为 8 级固定阶梯从盒子的 1e-2 起步，在 tanh 的过渡区里读到的是斜率变化不是发散）：一直下降（最多 60 级）直到 |log(D_k/D_{k−2})|/log 16 < 0.05（level-off → bounded，带局部指数）或差商到达舍入下界（尾部 4 级拟合，≥ 0.25 unbounded、≥ 0.1 borderline）。后果如实记录：y·log|y|（导数只是对数发散）在 k = 13 处 level off，读作 bounded（α ≈ 0.047），而首轮读 borderline；唯一性在那里确实成立（Osgood），期望是重新推导的不是放宽的。被主导线性项掩盖的奇异项（y + 1e-4·sqrt|y|）在粗尺度就停住，读 bounded——写在文件头的诚实限制里。
- **舍入下界用 g 的局部量级** eps·(|g(c+d)| + |g(c)|)/0.1（第二次求值，便宜），不用相邻级的统计（那让 1 − exp(−100y) 的判定随盒子变）。表达式内部的消去（(1e10 + y) − 1e10）仍看不见，记在文件头。
- **常数解处的探测减去残差** g(t, c)（根只定位到 fTol，否则最小偏移处读到假的 1/δ 增长）；平衡点处同理减去 F(p)。J-fix2 再改：平衡点探测从该点声称分辨率的 10 倍起步，不减 F(p)（|x|^(1/3) 的 α 才落在 2/3 ± 0.05）。
- **定义域边界的常数解二分到相邻双精度数**（最多 1200 次），不是预案的「~50 次到 1e-15 跨度」：sqrt(y) 在 0 不是采样点的盒子上，50 次二分后最后一个有限 y ≈ 1e-18，|M| ≈ 1e-9 > fTol 会被拒绝；只有精确的双精度 0 能过残差检验。
- **边界稳定性**：定义侧探针斜率为 0 或未定义时不下结论，兜底是 `varies`（唯一不声称趋向或离开的值），绝不是 semi_stable。
- **非唯一轨线按线段判**（点到线段距离 / 跨 y = c 的变号），不只按顶点：自适应步可能跨过原点而没有顶点落在容差内。容差 1e-9 × 盒子长边。J-fix 加了曲线自身范围的探测（`NonUniqueProbe`），标记不再依赖输入盒子。
- **画布标记**：非唯一常数解 = 两侧 4 px 点线 + 左端 '!' 徽标 + 标签 ' !'；非唯一平衡点 = 标记旁 '!'；边界线 = 点划线 [10,4,2,4]；被标记的轨线和预览 = 虚线 [6,4]。全部从 Scene 读。
- **`trace_trajectory` 也跑 findEquilibria + 唯一性探测**来标记曲线（在 2 秒预算内），平衡点只用于标记、不进 Scene（widget 图不变）。

##### J.3 非自治

- **首轮是数值判定**（在若干无理 t 值上比较 F，相对场量级 1e-9），审查发现判定随盒子和采样点翻转（1e-6·sin(t) 在 ±1e4 上、exp(−2000x²)·sin(t)），sqrt(t − 5) 在 5 个固定探测时刻全未定义时被放过。**改为静态规则**（编排者决定，d0b7550）：f 或 g 的 AST 里出现符号 t 就是非自治，句号；`"ty"` 系统永远不是；数值探测（maxRelDeviation、samples）只作证据打印，`TIME_DEPENDENCE_TOL` 删除，没有任何阈值决定任何事。后果：`0*t + y`、`x + t − t` 也是非自治，说明句写「没有测到变化，但仍按非自治处理」。**最后一轮把一阶方程的自治性也改成同一条静态规则**（`firstOrderMentionsT`，6d7bdb6）：t·sqrt(y) 在 y ∈ [−4, 0] 上（只有边界线一个有限样本，M 在其上为 0）曾报 untestable，现在按规则报非自治。
- **快照时刻加入探测时刻**，所以 sqrt(t − 5) 在 t = 10 报「定义域随 t 移动」（deviation = Infinity，打印为 —）。
- 外壳在**输入范围上测一次**并传给 `computeFeatures`，缩放平移不会翻转判定；快照时刻进 systemKey，换 t 就清轨线。
- 措辞：「平衡点只对自治系统有定义」是错的（非自治系统可以有常数解），改为「本工具不对非自治系统做该分析」。
- `reached_equilibrium` 的速度判据对非自治系统是自治推理（x' = 0, y' = cos t 在 t = π/2 处「趋近平衡点」）——在 J.3 范围外（文档说 trace_trajectory 不动），记在 open-questions。

##### J.4 二阶降阶

- **在字符串层做**（预案）：x''、x' 换占位符，两边相减得 E，仿射性检验，F = −E(x''=0)/(E(x''=1)−E(x''=0))。审查两轮把它改硬：仿射性在 x'' = −3.7…10 的 8 个值上探测（首轮只在 0、1、2，abs(x'') 也能过）；采样点加盒子里的 13 个点（分段系数）；系数**结构化提取**（形式求导穿过 + − × ÷ 括号 piecewise），数值回退只作交叉检验；系数含 t 时在 5 个 t 值上采样，t·x'' 因在 t = 0 处消失而拒绝。
- **化简保守**：mathjs `simplifyCore` + 两条精确改写（−0 → 0、−(−u + v) → u − v），不做因子消去、不做常数折叠；显示串四舍五入到 12 位有效数字，编译串保留全精度。理由：首轮的 `simplify` 把 −9.81/0.1 打成 −98.10000000000001，还把 x'/x' 化成 1 从而在 y = 0 上制造平衡点（后者仍留一条 it.fails，见 open-questions）。
- 验证符号集**替换**模式变量（[x, t, xd, xdd]），y 在二阶模式是未知符号并给「未知量是 x，x' 是它的导数」的提示；10 个 `second_order_*` 错误码，网页外壳双语，工具层英文。
- x'' 系数为 0 的检验是精确的 a === 0：从已验证仿射的 E 得到零系数只可能是精确 0，容差需要一个不存在的参考量级。
- `analyze_second_order` 返回 kind `analyze_system` + `scene.secondOrder`，不加新 kind；分析体 `analyzePlanar` 与 `analyze_system` 共用，所以快照 / 唯一性 / 截断都自动到位。
- 记法：x''(t) + x(t) = 0 剥掉 `(t)`（lookbehind 保护 exp(t)）；弯引号、unicode 撇号、双撇号、backtick 都归一化；unicode −、×、·、÷ 在所有模式归一化（只这四个，不动 dash 和全角 =）。

##### J.5 三条小的与文案

- 连通分量、`truncated` 独立字段、病态缩放测试都按文档做了；`hit_limit` 与截断句意思相同，`equilibriaNotices` 两者都设时只打截断句（带数量）。
- **`formatNumber` 保留有效数字**：|v| < 1e-3 或 ≥ 1e6 或定点形式没有非零数字时用指数形式，只有精确 0 打成 0；旧测试 formatNumber(−0.00001) 的期望从 "0" 改成 "-1e-5"（旧串是被压扁的值）。`formatEigenvalue` 的「实数」判据改为相对的 |im| ≤ 1e-15 |re|。
- 按定义排除的 Bernoulli（n = 0 / 1）单独一行「按定义排除的形式（括号内为规则）」，不进「未通过」。
- **常数解的扫描分辨率一行总是显示**（2 位有效数字），作为「一格里可能有两个根」的诚实声明；没有加「欠采样」标志。

##### J 阶段明确跳过的（编排者按「极端盒子」分诊，理由）

- x⁷ 在半宽 ≥ 1.5e5 的方盒上丢原点（允许上限 5e5）：原点的吸引域相对盒子是 1e-10 量级，四叉树深度 12 的格子是盒子的 2.4e-4；再深就是全盒子的指数级细分。课堂上不会用 ±1.5e5 的盒子看 x⁷。
- K ≥ 1e9 的病态线性系统（1e8 已修）：行缩放后剩余的舍入误差已经和 1e-9 的特征值同量级，双精度下本来就分不清。
- 大盒子上紧贴极点的根（x' = 1/(x−1) + 2 在 [−2,2]² 找到鞍点、更大盒子找不到）：扫描间距 6.25 分不开相距 0.01 的根和极点，同一类问题。
- 部分枚举的格点被判连续解集（#36）：连通判据会给「从未定位的根」记功；只在开发中根丢了 2 个时短暂出现，全找到时判 multiple_non_hyperbolic。
- 相距 2e-10 的两个单根合并（#39）：低于 LOCATION_RELATIVE_TOL 的分辨率。
- sin(1/y) 无穷多根的子集随盒子变：无穷多根本来就列不全，「扫描分辨率」一行是诚实的陈述。
- x'' = −x + x'/x' 在 (1, 0) 列出平衡点：需要 findEquilibria 拒绝「收敛点本身场为 NaN」的候选，是新机制，留 it.fails。

#### K 阶段

##### K.1 URL 状态

- **参数名**：`m`（first / diff / system / second）、`g` / `f` / `M` / `N` / `eq`、`tmin/tmax`（first、diff）或 `xmin/xmax`（system、second）、`ymin/ymax`、`loc`、`eqs`、`d`、`arrows`、`t0`、`traj`。文档的例子里一阶用 `tmin/tmax`，这里照做；系统和二阶用 `xmin/xmax`，因为横轴就是 x。
- **省略规则**：与默认状态相同的参数一律不写（`encodeState` 不带 `?`）；`eqs` 只在关闭等比时写 `0`；`arrows` 只在非默认时写；`d` 范围 5..40；轨线起点 6 位有效数字，范围数字用 `String(n)`；**编码的是输入范围（home box），不是缩放后的视口**——链接表达的是「老师配好的例子」，不是「我此刻看到的那一小块」。简谐振子预设恰好等于默认状态，它的链接只剩 `?traj=1,0;2,0`。
- **`AppState.locale: Locale | null`**：null = 没有选过语言，链接里不带 `loc`，收链接的人跟自己的浏览器语言；只有显式选择或链接里已有 `loc` 才编码。理由：自动探测到的语言不该强加给收链接的人。
- **解码永不抛错**：每个参数独立校验，非法项记入 `problems`（带原因码），回退到默认；表达式走同一套解析器白名单（`validateExpression`），上限 200 字符，查询串 4096 字符，数值 ≤ 1e6，范围下限必须小于上限且宽度 ≥ 1e-9，轨线 ≤ 20 条。常量表达式 `1e999` 会被 mathjs 解析成 Infinity 常量（数值参数则拒绝）——记录，未处理。
- **模式相关的回退表达式**（验收时发现，f7ab5ca）：链接把模式切到一阶但 g 无效时，原来回退到默认状态的 `-x`（系统模式的表达式），在一阶模式下 x 被拒绝 → 页面既有「参数无效」提示又有解析错误、没有图。`MODE_DEFAULT_EXPRESSIONS`：first `y*(1 - y)`、diff `t` / `y`、second `x'' + 0.5*x' + x = 0`。
- **地址栏只在状态能编译时同步**，表达式打到一半时停在上一个合法状态；「打开完整页面」用最后能编译的状态，不是 iframe 的初始查询。防抖 500 ms（文档）。
- 表单内部保留 explicit / differential 词汇（`PresetMode`），边界上 `APP_TO_FORM_MODE` / `FORM_TO_APP_MODE` 转换，减少与并行的 page.tsx 改动冲突。
- **`/vector-field`、`/embed`、`/`、`/help` 都是动态路由**（build 表里的 ƒ）：`searchParams` 在服务端解码，首屏就是链接里的状态和语言，没有先渲染默认再跳的闪动。

##### K.2 嵌入

- **`frame-ancestors *`，不是 Google 的域名列表**：这是公开教学工具，无登录、无状态，点击劫持没有意义；列域名反而会在 Google Sites 换渲染域时静默失效。只在 `/embed` 上加；`/widget`（MCP Apps 用，CSP 完全不同）和 `/vector-field` 不加任何 frame 相关头，curl 三次验证（K1、最后一轮修复、L）。
- **画布按容器尺寸**（ResizeObserver，300..900 px，高 = 宽 × 0.72），完整页面也这样，不只 embed：固定 720 px 的画布在手机上会溢出。
- `/embed` 带 `robots: noindex`，`robots.txt` Disallow `/embed` 和 `/mcp`。
- **嵌入高度按实测**：审查建议 760 / 640，但 logistic 例子的实际文档高度是 960 px 宽时 1267 px、800 px 以下单列时 1809 px、无表单 1243 px；按「实测值向上取整到 20 px」定为 1280 / 1260，文案里写明单列约 1820 px。测量是在隐藏的浏览器面板里做的，见 open-questions。

##### K.3 / K.4 首页与帮助页

- 长文放 `lib/site-text.ts`（zh / en 键集合一致性测试），页面是客户端组件；`?loc=` 在服务端读，没有时水合后跟 `navigator.language`（与 VectorFieldApp 同一套）。
- 首页 `<title>` 是绝对的双语站名（不套模板），其他页用模板。「阻尼振子」卡片链到 `damped2`（二阶写法 `x'' + 0.5x' + x = 0`），与文档点名的方程一致；`damped` 系统写法的预设保留。
- 站点外壳 `SitePage` 把 `lang` 设在 `<main>` 上，因为 `app/layout.tsx` 不许动；最后一轮修复又加了 `useDocumentLang` hook 在三个页面组件里改 `<html lang>`（审查 #10：中文应用页对屏幕阅读器仍是 en）。
- 帮助页的函数列表直接从 `ALLOWED_FUNCTIONS` 生成，不手抄。「连接 Claude」放最后（文档）。

##### K.5 预设

- 结构：`PRESET_GROUPS`（9 组）+ `PRESETS`（20 个 `{ id, group, mode, name, note, expressions, box, starts? }`），`presetState(p)` / `presetUrl(p)`，`<select>` 用 optgroup；每个预设就是 K.1 的一条链接。

##### K.6 触屏

- **触屏路径只对 `pointerType === "touch"`**，鼠标 / 笔的代码逐字节不变（审查复核过 diff）；触摸的 tap/move 阈值 8 px，鼠标保持 3 px。
- 手势状态机 `lib/gestures.ts` 是纯函数（可测）：tap（预览且保留）、双击 300 ms 复位、长按固定、单指平移、双指缩放；**pinch 同时发出中点的平移**（两指拖动），最后一轮修复把 pan + pinch 合成一次函数式 `setView` 更新（否则两个 handler 读到同一个过期 viewportRef，平移被丢掉）；第三指抬起不结束 pinch；pan / pinch / 长按 / 取消都清掉双击记忆。
- `touch-action: none` 只在画布上，页面其余部分照常滚动（文档）；右键菜单只对触摸指针阻止（首版对鼠标也阻止了，审查 #16 指出丢了「另存图片」，改回）。
- 触屏提示文字通过 `matchMedia("(pointer: coarse)")` 切换，网页外壳和 widget 都用；控件 ≥ 44 px 也只在 `(pointer: coarse)` 下。
- iOS Safari 的双击与浏览器自身手势的竞争没有在真机验证（见 open-questions）。

##### K.7 PNG

- 画布绘制抽到 `components/drawScene.ts`（不进 `lib/render`，保持其纯几何；widget 与网页外壳共用，所以 J 的标记在两边一致）；`exportScenePng` 2× 离屏画布 + 22 px 页脚。
- **导出当前视口**（缩放后就是缩放后的图），页脚范围也是当前范围——这是诚实的选择；要不要同时打印输入范围是产品问题（open-questions）。
- 页脚范围用真正的 3 位有效数字（`toPrecision(3)`），不用 `formatNumber` 的固定小数；页脚从 Scene 拼：一阶 `firstOrder.expr` → 二阶 `secondOrder.equation` → 系统 `x' = f, y' = g`；站点地址为空时省略而不是留悬空分隔符。
- 画布绘制和 PNG 导出没有单元测试（vitest 在 node 里跑，没有 canvas），只测页脚文字、文件名和手势状态机。

##### K.8 元信息

- **OG 图走 `app/opengraph-image.tsx`**（next/og `ImageResponse`，1200×630），build 通过且预渲染为静态，所以预案里的静态 SVG/PNG 回退没有做。中文字形靠 next/og 在构建时联网取字体——本机成功，Vercel 构建环境若无网络可能变方块（open-questions）。
- `robots.txt` / `sitemap.xml` 在没有 `BASE_URL` 时写 `http://localhost:3000`；部署环境本来就要求 `BASE_URL`，那里是对的。
- vitest 门禁排除 `lib/**/__probe__`（bac644a）：审查智能体在冻结工作树里写的探针文件不应让 `npm test` 变红。

#### L 阶段

- **L.1 措辞**：每个分析工具的 description **以 "CALL THIS TOOL FIRST …" 开头**并按工具定制（一阶：「a standard exact or separable equation is exactly the case you are tempted to skip」；二阶：「a linear oscillator with a characteristic equation is exactly the case you are tempted to skip」），然后共用尾句「Even when you can … in closed form, call the tool, check your derivation against its numerical results, and show the student the picture. Never answer from symbolic derivation alone.」，再接 "WHAT IT COMPUTES:"（原文逐字保留）和原有规则。规则放在**最前面**而不是附在末尾：模型扫工具列表时先读到的是开头。`ping` 不加。测试锁定前缀、顺序（规则 → WHAT → USE THIS）和逐工具措辞。顺带补两句：二阶方程必须对 x'' 仿射（系数可含 x、x'、t）；负底数分数幂的提示在每个工具的语法规则里都说一遍。
- **L.2 只加测试**：读 `tools.ts` 后用协议级测试逐项验证 J 的结果在摘要里（两种语言），全部一次通过，没有改工具或文案。
- **L.3 widget l-1**：**widget 也加了等比开关**（偏离 I.7 的「widget 保持等比」——共用 hook 只需几行，学生在 Claude 里看 (t, y) 平面同样需要它）；每个平衡点加 "tr = …, det = …"；`analyze_second_order` 的结果 kind 仍是 `analyze_system` + `scene.secondOrder`，不加新 kind；CSP 块、assetPrefix、根布局补丁不动。版本号只在这里 bump 一次（h-2 → l-1）。
- **L.4 模拟主机按 URL serve 沙箱，不用 srcdoc**：srcdoc 的 iframe 加载了 chunk 却不水合（Next 运行时把 chunk 相对 `about:srcdoc` 解析），真实主机也是把 HTML 放在沙箱域名上按 URL 加载的，所以模拟主机照做（两个源 :3520 / :3521，CSP 头由 `_meta.ui.csp` 生成、无 eval）。诊断钩子（mock/read-text、mock/canvas、widget 内探针）只存在于模拟主机。`package.json` 加了 `mock-host` 脚本。E 阶段的 harness_e.py 从没进过仓库，这次的进了。

#### 流程决策

- **worktree 并行**：I 的等比开关（wip/i3）、J 的四个模块（j1–j4）、J-fix 的 A/B/C、J-fix2 的 JA/JB/JC、K 的 K2/K3、最后一轮的 FA/FB/FC 都在 `E:\project\vft-wt\<name>` 里做，rebase 后 ff 合入；每轮一个「integrate」提交解决语义冲突（`labels.ts` 的键联合、`analyzePlanar` 承载各组的分支、重复句子删除）。K1 在 90989ed 上与 J-fix 并行，所以 K 提交先于 J 的后两轮修复进入 main，`j-math-done` 因而排在 K 提交之后。
- **验证方式的改变**：第一轮按 H 轮的做法每条发现派 3 个反驳者，39 条只验了 13 条就撞上账号用量上限，26 条没有投票；第二轮 41 条干脆没有反驳者。从第三轮起改为**审查者给每条发现打课堂可能性标签（classroom / edge / extreme）+ 编排者分诊**：classroom 和 edge 修，extreme 明确跳过并写理由。理由：3 个反驳者的成本高于修复本身，而分诊需要的只是「课堂会不会遇到」这一个判断；代价是第二、三轮的发现没有独立复核，修复以「复现了就修」为准（summary 里如实标注）。
- **智能体输出纪律**：一个智能体的报告超过 64k 输出上限而丢失之后，所有智能体的报告改为固定小节（commits / fixed / refuted / notDone / decisions / openQuestions / failingMarked / apiChanges）、长材料写进 scratchpad 文件、单次工具输出不超过约 200 行；本文档也是按这个纪律分块写的。
- **被 amend 的提交**（reflog）：main 上两处——5b48c50（I 阶段的 docs 提交，打 `i-notation-done` 之前）和 83a8c8f → f7ab5ca（验收修复，amend 后才打 `k-website-done`）；worktree 里一处——FC 的 424e449 → e9b9e53（9 个文件的 CRLF 归一回 LF，内容逐字节相同，否则并行合并全冲突）。三处都在推送之前，tag 都打在 amend 之后的提交上。
- **行尾**：仓库按文件混用 LF / CRLF，每个智能体把改过的文件恢复到 index 里的约定再提交（CLAUDE.md 是混合行尾文件，K3 rebase 时整文件冲突，按 main 的版本逐段插入）。
- **提交粒度**：一个模块一个提交，`npm test` 每个提交绿；`git add` 用显式路径；JB 的一组改动只有一个提交（内核改动同时改了 tools.test 和 labels.test 的期望，拆开会有红的中间提交）；`[J-fix] uniqueness` 和 `interactive` 拆成两个提交而不是任务写的一个。

<!-- END SOURCE IJKL-decisions.md -->

---

<!-- BEGIN SOURCE IJKL-open-questions.md -->
<a id="history-ijkl-open-questions"></a>

## 历史 13：IJKL-open-questions.md

来源：[IJKL-open-questions.md](IJKL-open-questions.md)。下文为阶段原记录，时间和状态保持当时口径。

### I–L 轮待决事项（2026-09-08/09 夜跑）

需要你拍板的事、被标记的失败测试、性能、审查里没有修的发现、其他。没有的项写「无」。

#### 需要你拍板

- **是否现在推 origin / 部署**：main = 1e825bc，三绿、smoke 19/19，但 Claude 实机没有验过（widget l-1、「先调工具」规则）。推就是生产部署；不推则线上仍是 H 状态（h-2）。编排者只在被告知时推。
- **静态自治规则**：平面系统的 f 或 g 里出现符号 t 就按非自治处理（不报平衡点、只画快照），`0*t + y`、`x + t − t` 也算；一阶方程同一规则（`t*sqrt(y)` 在 y ∈ [−4, 0] 上从「untestable」改成「非自治」）。数值探测只作证据打印。这条是编排者定的，取代了首轮的数值判定（会随盒子翻转）；要不要保留「探测到没有变化」时的额外说明句，或干脆对 `0*t` 这类做静态化简，请你定。
- **唯一性探测的阈值**：尾部 4 级拟合的指数 ≥ 0.25 → unbounded、≥ 0.1 → borderline；level-off 判据 |log(D_k/D_{k−2})|/log 16 < 0.05；最多 60 级；平衡点探测从声称分辨率的 10 倍起步。后果：y·log|y| 读 bounded（α ≈ 0.047，Osgood 意义下唯一性确实成立），被主导线性项掩盖的奇异项（y + 1e-4·sqrt|y|）读 bounded。这些系数是智能体按发现里的设计定的，没有独立复核。
- **消失性 / 根接受的指数下界**：常数解阶梯 β ≥ 0.05（最细 4 级）；平衡点消失性检验 0.1（`VANISHING_MIN_EXPONENT`，偏移 [10, 1000] × 分辨率）；舍入安全系数 `RESIDUAL_SAFETY = 10`；`PRECISION_REACH = 1e6`、`UNDERFLOW_REACH = 1e60`（一个零到精度的值只有在前一级离下界 1e6 / 1e60 以内才算「到底」，否则是巧合零）。同上，智能体定的。
- **扫描分辨率一行总是显示**（一阶常数解一节末尾，2 位有效数字）：这是对「一格里可能藏两个根」的诚实声明（sin(100y) 只列出 165/637），代价是每个一阶结果多一行。可以改成只在 deflation 发现过一格两根时显示。
- **嵌入高度 1280 / 1260 px（单列约 1820）**：在隐藏的浏览器面板里量的（视口为 0，高度不可靠）。嵌进 Google Sites 之后按实际改 `lib/site-text.ts` 的 `EMBED_HEIGHT_*` 两个常数即可。
- **`it.fails` 记录要不要留**：`slope-field.test.ts` 里「y − 1e-20 贴到 0」的旧期望已被新行为（报 1e-20 到最后一位，另有新测试）取代，JB 问是删掉还是留作审查的纸面痕迹。
- **x' = xy, y' = x² − y 的 1–2 s** 与建议的四叉树停止规则（见性能）。
- **`region_of_equilibria` 的阈值** 25% 精确零样本；**`REFINE_ROOT_CAP = 128`** 让每个连续解集都报 `refineCapped = true`——要不要在连续解集判定时压掉这条上限说明。
- **`formatNumber` 不再把小数压成 0**：找到的根在 3e-17 处就打 3e-17。要贴零应在内核里按位置容差做（FA 已对 |c| ≤ 分辨率的坐标做了），格式化层不再干预；确认这个分工。
- **常数解的位置容差要不要暴露**：消去型重根 y = 1/2 只知道到 ±1e-8，现在打成 0.5 像精确值；`EquilibriumSolution` 没有该字段，加它要动 labels 和两个外壳。
- **PNG 页脚只打当前视口范围**；要不要同时打输入范围。
- **`trace_trajectory` 现在每次调用都跑 findEquilibria + 唯一性探测**（为了标记非唯一曲线），在 2 秒预算内；病态表达式可能因此在这个工具里先撞预算。
- **非自治系统的 `reached_equilibrium`**：速度判据是自治推理，x' = 0, y' = cos t 在 t = π/2 处会说「趋近平衡点」。文档要求 trace_trajectory 不动，所以没改；建议非自治时禁用或改写该状态。
- **`abs` 在舍入界里按舍入运算计**（多加 eps·|value|），y·log|y| 在 −1 附近的零到精度带宽几个 ulp；无害，但 `parse.ts` 可以把 abs / neg 标为精确运算。

#### 被标记的失败测试

`grep -rn "it.fails" lib app --include=*.test.ts` 命中 4 行，其中 `app/mcp/tools.test.ts:233` 是普通的 `it(` 标题里含 "it fails"；真正的 `it.fails(` 有 3 个，`npm test` 报 "3 expected fail"：

1. **`lib/core/slope-field.test.ts:644`** —— "a root within the rounding floor of the scanned coordinates is reported as exactly 0"：J-fix 期望 dy/dt = y − 1e-20 在 [−1, 1] 上报 y = 0；J-fix2 的自适应阶梯把 M(0) = 1e-20 看成非零极限（β = 0）而拒绝贴零，新的推导测试断言根在 1e-20 处到最后一位。留作纸面痕迹（拍板项）。
2. **`lib/interactive.test.ts:457`** —— "planar: the same curve is flagged from the box x in [1, 3]"：x' = sqrt|x|, y' = −y 从 (2, 0) 出发、输入盒子 x ∈ [1, 3]，曲线探测在速度极小点周围的方盒里含原点，但 findEquilibria 在那里返回 none_found（J-fix B 记录：Newton/LM 在尖点振荡）。J-fix2 的 JA 说 sqrt|x| 的尖点根在 [−0.05,0.05]² 到 [−3,3]² 上都找到了，但这个测试在 HEAD 仍是 expected fail，**没有报告重新检查过它为什么还失败**——下一轮先跑它看一眼。
3. **`app/mcp/tools.test.ts:572`** —— "x'' = −x + x'/x': no equilibrium is reported at (1, 0)"：降阶得 x' = y, y' = −x + y/y，在 y = 0 整条线上无定义、其余处等于 (y, 1 − x)，定义域内没有零点；findEquilibria 接受极限点 (1, 0) 并分类为 center_or_weak_spiral。修法需要 findEquilibria 拒绝「收敛点本身场为 NaN」的候选（新机制，两轮都明确跳过）。

#### 性能

- **x' = xy, y' = x² − y（[−3,3]²）：1–2 s 每次调用**（`refineCapped: true`）。原因已定位：f = xy 在 x 轴上精确为 0、g 在每个格子里穿过抛物线，变号四叉树沿 x 轴把每个格子细分到深度 12，1024 次封顶的 Newton 运行各自以比率 2/3 爬向原点（约 80 步）。FA 试过按几何尾外推 abortNear 的落点，破坏了 J.7（[−2000,2000] 上相距 1e-3 的两根合并）而回退。**建议的规则**：格子中心的运行已收敛到格子外一个已知根、且格子比它到该根的距离小时，停止细分该格子；必须对照 x⁷ 在 [−100,100]² 上（原点和鞍点共享深度 0 的格子）。相关测试带 30 s 超时。
- 浏览器验收：每个预设的特征计算 1–3 s 完成（含 250 ms 防抖），交互外壳没有 2 秒预算。
- x' = sqrt(x)·y 的边界线 250–340 ms（每个沿边爬的 Newton 运行约 900 次求值，单侧雅可比每步二分）。
- 审查视角在 35c6bbc 上的实测：最坏 485 ms（sin x, cos y 在 [−1e6,1e6]²）、sin(20πx) 格点 209 ms、sin/cos 在 [−100,100]² 88 ms；MCP 调用 4–90 ms；checkpoint 之间最长间隔 15 ms。
- 连通分量抛光：x 轴 128 点 12 ms、圆 39 ms；大盒子上 400 种子封顶的连续解集可能到几百个点、约 1000 次抛光，工具有预算，交互外壳没有。
- 唯一性探测：≤ 60 级 × 2 侧 × 7 探针 × 2 次求值（局部量级是第二次求值）。
- 多重根 x^m 需要约 m·ln(盒子/stepTol) 步线性收敛，扩展迭代上限 2000 之后重数超过约 100 仍找不到（写在 newton 的头注释里）。
- 没有在低端机或真机上测过。

#### 审查未修的发现

**按「极端盒子」明确跳过的**（第二轮 41 条里，JA 的 SKIP 列表；理由见 decisions）：
- x' = y, y' = −x − y + x⁷ 在半宽 ≥ 1.5e5 的方盒上丢原点（允许上限 5e5）。
- K ≥ 1e9 的病态线性系统（1e8 已修）。
- 大盒子上紧贴极点的根（x' = 1/(x−1) + 2, y' = y）。
- 部分枚举的格点被判连续解集（#36）：连通判据会给从未定位的根记功；全部找到时判 multiple_non_hyperbolic。
- 相距 2e-10 的两个单根合并（#39）。
- sin(1/y)（和 x' = sin(1/x)）无穷多根的子集随盒子变（列出 14 / 24 / 0 个）；y = 0 不再列出。
- x'' = −x + x'/x' 的极限点（it.fails 3）。
- #26「y − 1e9 − 0.5 在 y ∈ [1e9, 1e9 + 1] 上找不到常数解」在三份修复报告里都没有提到，视为未处理、未复查。

**课堂 / 边缘级别仍开着的**：
- **sin(100y) 在 [−10,10] 上 637 个根只列出 165 个**：一格两个同号根交给黄金分割极小化，deflation 只在最细级看到符号差时找回第二个根；「扫描分辨率」一行是诚实声明，没有加「欠采样」标志。
- 全零扫描的根恢复只到阶梯能触及的采样点：y·exp(−100y²) 在最近采样点落在 (2.73, 3.76) 的盒子上（如 [−1503, 1497]）仍丢 y = 0，只报平台说明 + 分辨率。
- 两条零曲线渐近靠近但不相交的场（x' = y, y' = exp(−x²) − 0.5y）让每个子格都保留双变号，跑到 REFINE_CELL_CAP，`refineCapped = true` 是诚实的但噪音大。
- x·log|x| 的原点分类为 non_hyperbolic + caveat（自适应雅可比步永远分辨不了 log h + 1），不是发现里期待的鞍点；找到了、caveat 诚实、但没有给出特征值。
- 奇点位置是被标记的停住点的 medoid，没有比「运行停在哪」更精确的定位。
- 第三轮 extreme 的 #20：`constantSolutionPlateau` 句子说右端「两侧连续趋近」零，实际只有浮点证据（exp(−1/y²)·1e-10 + exp(−760) 这类真极小值可能是正的次正规数）。建议加「在浮点精度内」限定语，未改。
- 二阶：仿射性检验和化简交叉检验只在采样点上做，x/x → 1 这类只在低维集合上不同的化简检测不到（化简已改保守，所以目前不产生问题）；二阶模式的内核错误句在 MCP 工具层保持英文（有意）。
- Hölder 指数 0.05 的根（|x|^0.05）在双精度下不可见、不报（审查视角记录，无法修）。
- 第三轮 #5「同样输入两次结果不同」：内核 20 次重跑深度相等、无模块级状态，没有复现；原观察是通过 MCP 工具层 196 次调用后出现的，**如果再出现，先查 `app/mcp/budget.ts`（checkpoint 在搜索中途抛出）而不是内核**。
- 第一轮 26 条未验证发现里，修复报告标为 `unverified->reproduced` 并修掉的有 #14、#15、#16、#17、#18、#19、#20、#21、#22、#23（部分）、#24（部分）、#26、#27、#28、#29、#30、#31、#32、#33、#34、#35、#36、#37、#38、#39；#25 与 #12 同修。没有反驳者投票，以复现为准。

#### 其他

- **部署步骤**：`git push origin main` → Vercel 自动构建（`BASE_URL` 已设，不用改）→ 打开 `https://tools.studycase.net/opengraph-image` 看中文是否成方块（next/og 构建时联网取字体；本机成功，Vercel 若无网络会退化）→ `npm run smoke -- https://tools.studycase.net/mcp` 应 19/19 且 widget uri `?v=l-1` → Claude 里断开并重新连接连接器 → 验证清单第 8–11 步。
- **回滚**：`git checkout k-website-done`（f7ab5ca）回到 L 之前，widget 是 h-2，同样要重连连接器。
- **真机没测的**：双指缩放、长按、轻点预览的实际触摸事件（只测了纯状态机和 375 px 布局）；iOS Safari 的 300 ms 双击检测与浏览器自身手势的竞争（`touch-action: none` 应能压住，未验证）；剪贴板 `writeText` 在 https 生产环境（本地沙箱只走了只读输入框兜底）；Google Sites 里的实际 iframe 高度。
- **widget 的 `page.tsx` 没有单元测试**（之前也没有），等比开关只在模拟主机里验过；画布绘制与 PNG 导出只能在浏览器里验。
- **forms 块在三处渲染**（`tools.ts` 的 describeForms、widget、网页外壳的 FormsList），是 H 轮之前就有的重复，这轮的「按定义排除的形式」改了三次；L 报告点名，未合并。
- `lib/core/time-dependence.ts` 的 `mentionsTime` 有自己的遍历，可以改为委托给 `parse.ts` 的 `mentionsSymbol`（FB 留下的小重构）。
- `decodeState` 接受 `1e999` 之类的常量表达式（mathjs 解析成 Infinity），数值参数则拒绝；未处理。
- 工作树：报告提到 `E:\project\vft-wt\j4` 等 worktree 和 `wip/*` 分支「留在原地」；清理前先 `git worktree list` / `git branch --list 'wip/*'` 看哪些还在（本文档没有核实）。
- 所有 `isError` 文本仍是英文（给模型看，有意），与 H 轮一致。

<!-- END SOURCE IJKL-open-questions.md -->

---

<!-- BEGIN SOURCE MNO-summary.md -->
<a id="history-mno-summary"></a>

## 历史 14：MNO-summary.md

来源：[MNO-summary.md](MNO-summary.md)。下文为阶段原记录，时间和状态保持当时口径。

### M–O 轮总结（2026-09-09）

- **做到哪了**：M（英文默认 + 文案精简 + 排版修复 + /help 重排）→ N（轨线单条删除 / 撤销 / 长按删除 + 初值输入 + 解的查询 + N.3 六条修复）→ O（`query_solution` 描述、widget o-1、模拟主机实测、smoke 更新）三个阶段全部完成，三个 tag 都打了：`m-english-done`（de1665b）、`n-features-done`（ec8329a）、`o-mcp-done`（8e54eef）。按简报要求本轮没有跑大规模对抗式审查：M、N 在会话自带浏览器面板逐条验收，O 用本地模拟主机跑通 widget。最终门禁（8e54eef）：tsc 0 错误、36 个测试文件、883 通过 + 2 预期失败（共 885）、build 通过、本地生产构建 smoke 20/20。main 直线，`l-mcp-done..HEAD` 共 25 个提交（其中 6826d02、bb907f5 是上一轮的 docs 提交；本轮 23 个，加上本文档所在的 docs 提交）。
- **最后一个良好 tag**：`o-mcp-done` = 8e54eef（本文档提交之前的 main HEAD）。往前依次是 `n-features-done`（ec8329a）、`m-english-done`（de1665b）、`l-mcp-done`（1e825bc）。
- **你要手动做的**：(1) **推 origin 就是 Vercel 生产部署**——编排者推不了（`git push` 被会话的权限分类器拦下，与上一轮相同），要你来：`cd E:\project\vector-field-tool && git push origin main && git push origin m-english-done n-features-done o-mcp-done`；(2) widget 版本 l-1 → o-1，**部署后必须在 Claude 里断开并重新连接连接器**（连接器缓存了带 `?v=l-1` 的资源 URI，否则 widget 空白 / "Resource not found"）；(3) 部署后跑 `npm run smoke -- https://tools.studycase.net/mcp`，应 20/20、7 个工具、widget uri `?v=o-1`；(4) Claude 实机：`query_solution` 是否被先调用、「先调工具」规则、widget 里的删除 / 撤销 / 查询标记（验证清单第 9–12 步），今晚没法替你做；(5) 报告里没在真机上验证的：悬停高亮只在模拟主机里看到过（会话面板隐藏时 N 阶段的 rAF 不触发）、真实触屏的长按删除、widget iframe 内的 Ctrl+Z、折叠文案之后 Google Sites 里的 iframe 高度。

**`m-english-done` 可以部署了；`o-mcp-done` 同样通过全部门禁，可整体部署**

---

#### 生产站点检查（M.4，本轮开工前 curl）

origin/main 与本地 HEAD 一致（bb907f5，即上一轮结果已推送）。线上各路由：`/` 200（18.5 KB）、`/help` 200（25 KB）、`/vector-field` 200、`/embed?m=first&g=y*(1-y)` 200、`/robots.txt` 200、`/sitemap.xml` 200；`/` 的标题是「向量场教学工具 / Vector Field Tool」（中文在前——正是 M.1 要改的），`/mcp` 的 `resources/list` 返回 `ui://vector-field-tool/widget.html?v=l-1`。结论：线上就是最新提交，没有漏推的提交；「/help 看不到、首页还是旧版」应是缓存或 Vercel 构建尚未完成时的观察。

| 路由 | 状态 | 类型 | 大小 |
|---|---|---|---|
| `/` | 200 | text/html | 18518 B |
| `/help` | 200 | text/html | 25029 B |
| `/vector-field` | 200 | text/html | 22292 B |
| `/embed?m=first&g=y*(1-y)` | 200 | text/html | 19053 B |
| `/robots.txt` | 200 | text/plain | 105 B |
| `/sitemap.xml` | 200 | application/xml | 457 B |

---

#### M 阶段（tag `m-english-done` = de1665b，818 个测试：815 通过 + 3 预期失败）

| 项 | 做了什么 | 提交 |
|---|---|---|
| M.1 英文默认 | 站点默认 `en`，不再读 `navigator.language`，只有 `?loc=zh` 才中文；`<html lang>` 随页面语言；MCP `locale` 改为可选、默认 `en`（description 规则保留；H2.9 的"漏传即报错"测试改为"漏传得英文摘要"）；README 全英文重写（docs/*.md 与 CLAUDE.md 注明为内部中文工作笔记）；扫描 app/、components/、lib/ 的硬编码中文并入表或改英文（页面标题、meta、OG 图改为英文在前）；CLAUDE.md 新增"内核冻结"一节，列出 J 轮各启发式常数及其作用 | 4f211b9, 78ce1a5, 4059958, c4b491e, de1665b |
| M.2 排版 | 左栏 `flex: 0 1 320px; min-width: 280px`，标签/复选框文字允许换行，按钮/下拉/输入满栏宽；ⓘ 按钮保持自身宽度、滑块边距、单行预设说明不再撑宽页面 | c724f06, 014e9cd |
| M.3 文案 | 顶部长句删除，改为一行短说明 + Help 链接；画布下只留 `x ∈ […], y ∈ […] (equal scale)`，操作提示串删除；「以下结果按范围…」缩成 `Results for …` + ⓘ；语法说明默认不显示、只在解析出错时随错误显示；箭头标签 `Arrows` / `Uniform` / `Scaled`；等比复选框只叫 `Equal scale` + ⓘ（取消勾选的常驻警告保留）；预设说明压到一行 + ⓘ；平衡点 caveat 折叠成短句 + ⓘ（`(0, 0) center or weak spiral (linearization cannot tell) ⓘ λ = ±i tr = 0, det = 1`），常数解/唯一性/非自治/类型 caveat 同样折叠；**MCP 摘要与 structuredContent 一字未删**（tools 测试未改） | b205042, a05bde8 |
| M.4 帮助页 | 删掉的解释全部收进 `/help`，按「操作 / 记号 / 怎么读结果」重排（嵌入、Claude 两节仍在后面） | af9d038 |

##### M 阶段浏览器验收（编排者，`next dev`，会话浏览器面板）

- 1280×800、1440×900、768×1024、375×812 × 中/英各一遍：`.vf-form` 内无元素 `scrollWidth > clientWidth`，无标签/按钮/段落越出表单边界，无页面横向滚动；768 与 375 为单列（表单在上）。
- 英文页：无顶部长句，Help 链接存在，画布下只有 `x ∈ [-4.17, 4.17], y ∈ [-3, 3] (equal scale)`，结果行 `Results for x ∈ [-3, 3], y ∈ [-3, 3] ⓘ`，语法说明默认隐藏、输入 `xy` 出错时随错误显示（"Unknown symbol "xy". Did you mean "x*y"? …"），`Arrows` / `Equal scale` 标签，4 个 ⓘ（预设说明、等比、结果范围、平衡点 caveat）点击均展开对应全文。
- 中文页（`?loc=zh`）同样无截断；默认页 `<html lang="en">`，中文页 `zh-CN`。
- 集成代理另用生产构建验证：默认页正文前 2 KB 无中文（只剩语言切换器的"中文"字样）、`?loc=zh` 为中文；`/embed` 有 `frame-ancestors *`、`/widget` 无 frame 头；smoke 19/19；不带 `locale` 的 `analyze_system` 调用返回英文摘要而非 isError。

---

#### N 阶段：轨线管理 + 解的查询（tag `n-features-done` = ec8329a）

**怎么做的**：NA（查询内核 + `query_solution` 工具 + N.3 六条）直接在 main 上做；NB（轨线 store / 命中判定 / 删除 / 撤销 / 初值输入）在 worktree `E:\project\vft-wt\n2`（分支 `wip/n2`）并行，rebase 后 `--ff-only` 合入（labels.ts 三处键联合冲突，无 fixup 提交，合入时 867 个测试）；NC（查询面板 + 画布标记）在两者之后于 main 上做；编排者浏览器验收后加一个防护提交并打 tag。

| 项 | 做了什么 | 提交 |
|---|---|---|
| N.1 复现 | NB 在生产构建里复现：「清除」对点击加的轨线本身有效，但链接 / 预设的 `traj` 种子在改快照时刻 t₀ 后会回来——hook 的种子 effect 以含 snapshotT 的 systemKey 为键、每次都重新追踪 `initialTrajectoryStarts`。**是 bug**（清掉又被种回），不是按钮失灵 | 141beed |
| N.1 修复 + 命中判定 | 固定轨线改为纯 store（`lib/trajectory-store.ts`：起点是唯一真相，曲线由注入的 trace 派生，add / delete / clear 的撤销历史 `HISTORY_LIMIT` = 20）；systemKey 变或新种子数组 → 重置为种子；新输入 `retraceKey`（网页外壳传 snapshotT）→ 只重追踪**当前**起点，清掉的不再回来（回归测试）。`lib/trajectory-hit.ts` 在屏幕像素下算点到折线段的最短距离（`HIT_THRESHOLD_PX` = 8，与缩放无关；推导测试：400 px / [−2, 2] 视口里 5 px 命中、12 px 不命中，同一世界偏移在 100 px/单位命中、200 px/单位不命中，端点距离，多条取最近） | 141beed |
| N.1 删除 / 撤销 / 长按 | 点击已固定轨线（8 px 内）→ 删除该条，否则新增；悬停在可删轨线上：预览抑制、覆盖层 4 px 加粗高亮、光标 pointer、提示 "Click to remove this trajectory" / 触屏 "Hold to remove this trajectory"（双语）；`Undo` 按钮 + window 级 Ctrl/Cmd+Z（纯 `lib/undo-key.ts`，焦点在输入框内时忽略）；Clear 是一步可撤销操作；长按走既有 longPress → onClickWorld 路径，固定轨线上删、空白处固定（reduceGesture → longPress → clickAction 流程有测试，`lib/gestures.ts` 未动）；`traj` 参数随三种操作变化 | 58d91d6 |
| N.2 初值输入 | "Initial value" 字段组（一阶 t₀ / y₀，平面 x₀ / y₀）+ `Add solution`（两个输入框里按 Enter 也触发）；纯 `parseInitialValue`（`lib/initial-value.ts`：有限小数、|v| ≤ `MAX_ABS_VALUE` = 1e6，报第一个出错的字段）；加入走同一个 addTrajectory：同样的 trace、撤销条目、`traj` 编码 | 69bf145 |
| N.2 查询内核 | `lib/core/query.ts`（纯）`querySolution(sys, start, target, opts)`：两个方向在调用方的停止盒内积分；kind "time" 从起点重新积分到恰好 t*（时间误差 0）；kind "x" / "y" 对折线每个变号段用 Brent 在**时间**上求根，每次试探从括号左端的已接受状态重新积分，从不线性插值；误差估计 = `TOLERANCE_SAFETY`(10) ×（atol + rtol\|p\|）（坐标命中再加 \|dp/dt\| × 时间误差）；note 永远是键（ok / not_reached_in_span / stopped_before_target / possibly_more_beyond_span / target_is_start）。8 个推导测试：e² 在 1e-5 内且在自身误差估计内、ln 2、ln 9、简谐振子 π/2 + kπ 双向 1e-6 内 + possibly_more_beyond_span、y² 的爆破（外壳的盒子里 left_box 于 t = 59/60；巨大盒子上 singular 于 1 ± 0.01）、e^−t 永远到不了 −1（forward completed / backward left_box）、time kind π → (−1, 0)、超出可达 → stopped_before_target（tEnd 10）、target_is_start、精确命中已存点 | 25d1f9c |
| N.2 MCP 工具 | 第 7 个工具 `query_solution`（mode first / diff / system / second，t0 或 x0 + y0，`target {kind: t\|x\|y, value}`，tSpan 默认 20 上限 1000，范围，locale 可选）；一阶的 kind t 映射到横坐标、kind x 给可读 isError；停止盒 = 视图的 20 倍（与外壳一致）；Scene kind "query_solution" + `Scene.query`；措辞共用 `lib/labels-query.ts`；drawScene 给每个命中画标记；10 个协议级测试（双语 logistic、second、diff、输入错误）；smoke 改为 7 个工具 + 一次 `query_solution` 调用 | 4043f89 |
| N.2 查询面板 + 标记 | 网页外壳 "Query the solution" 字段组：已固定起点的下拉（最新加入的预选，纯 `selectedTrajectoryIndex` 规则）、kind 下拉（一阶 t / y，平面 t / x / y）、值输入、`Query` 按钮；调用与固定轨线**同一套**规则（`fixedStopBox`(输入范围)、`CLICK_TSPAN` = 50、t0 = snapshotT、h 0.05、rtol 1e-6 / atol 1e-9）+ App 侧 2 s 墙钟 checkpoint；命中按误差估计的 2 位有效数字四舍五入（`lib/query-panel.ts`）、note 句、两条积分腿（far-box / 非自治措辞、非唯一句）、精度句 "crossings of the NUMERICAL solution"；结果以方程 + 输入范围 + 快照时刻为键，任一变化即丢弃，被查询的轨线删除 / 清除后标记与文字一起消失（hook 的 `queryStart` 门）；`components/drawScene.ts` 把每个命中画成 #be123c 实心菱形 + 白色光环 + "(h, y)" 坐标标签（会溢出时放左侧）；widget 的 live 场景也带标记；23 个推导测试 | 723d62d |
| N.3 (a) | 删除 `lib/core/slope-field.test.ts` 的 `it.fails`（预期失败 3 → 2） | ece23f4 |
| N.3 (b) | 非自治场景的 `reached_equilibrium` 在 trace_trajectory、query_solution 和 `lib/labels-trajectory`（两个外壳）改用中性措辞 `tool.stoppedNonAutonomous`（"stopped after the speed fell close to zero at that time … for a non-autonomous system this is not an equilibrium"），积分器和状态值不动；测试 x' = 0, y' = cos t 从 (0, 0) 到 π/2：状态仍是 reached_equilibrium，文字不说平衡点 | ece23f4 |
| N.3 (c) | `equilibria.ts` 四叉树停止规则；x' = xy, y' = x² − y：细分格子 1024（封顶）→ 254，`refineCapped` false；x⁷ 在 [−100, 100]² 上的守卫（螺旋 + 两个鞍点）通过。**时间仍 ~1.1 s，没到 300 ms**（见 decisions / open-questions） | ece23f4 |
| N.3 (d) | `decodeState` 对 `1e999`：解析器白名单本来就拒绝 mathjs 的非有限 ConstantNode，四种模式各加一条推导测试（invalidExpression），无代码改动 | ece23f4 |
| N.3 (e) | PNG 页脚：输入范围与当前范围不同时打 "entered … · shown …"（`exportFooterText` 第 5 个参数 `enteredBox`），相同时只打一次；网页外壳的调用点（传 `compiled.box`）在 O 补上 | ece23f4, 643457b |
| N.3 (f) | `Scene.refineCapped` + `equilibriaNotices`：警告是 possible_continuum / region_of_equilibria 时不再打 refineCapped 说明；analyzePlanar 与 computeFeatures 设置；网页外壳 hook 的一行在 O 补上 | ece23f4, 643457b |
| 验收修复 | 画布 `setPointerCapture` 对非活动指针抛 NotFoundError（验收用合成 PointerEvent 触发）→ try/catch 防护 | ec8329a |

测试数：M 结束 818（815 + 3）→ NA 844（842 + 2）→ N 集成 867 → NC 882（880 + 2）。ec8329a 只加了 try/catch，没有单独报测试数。

---

#### O 阶段：MCP 与 widget（tag `o-mcp-done` = 8e54eef，885 个测试：883 通过 + 2 预期失败）

| 项 | 做了什么 | 提交 |
|---|---|---|
| N 遗留三条 | (a) `useInteractiveScene` 把 `refineCapped: features.refineCapped` 放进 Scene（网页外壳也显示上限说明）；(b) VectorFieldApp 给 `exportFooterText` 传 `compiled.box`（缩放后 PNG 页脚打两个范围）；(c) `QueryHit.speed`（命中处 \|F\|）+ 导出的 `timeUncertainty(hit)` = max(error.t, error.position / speed)，`lib/query-panel.ts`（网页）和 `lib/labels-query.ts`（工具摘要 / widget）都按它显示 / 四舍五入交点时间（此前打到 12–13 位小数）；推导测试 | 643457b |
| widget o-1 | widget 把共享 hook 的 highlight / cursor 传给画布（悬停固定轨线高亮）、`Undo` 按钮 + Ctrl/Cmd+Z（共用 `lib/undo-key`）；`WIDGET_VERSION` l-1 → o-1（server.ts、server.test.ts、smoke.mjs、README 一行）；模拟主机加 `query_solution` 场景 | 2b2ac8c |
| 描述 | `query_solution` 的 description 明写「某时刻的值 / 何时到某值」的问题一律调用本工具、"never evaluate that closed form mentally"，tools.test.ts 锁定；7 个工具全部 CALL-FIRST 前缀 + locale 可选默认 en；caveat 未动 | c89f24a |
| 模拟主机发现 | hook 的 live Scene 从不带 `secondOrder`，widget 交互路径下 analyze_second_order 的结果缺降阶那一行 → hook 加纯数据的 secondOrder 透传（同 query）；o-1 尚未发布，不再 bump | 8e54eef |

硬限制：`git diff n-features-done -- app/layout.tsx app/mcp/route.ts docs next.config.ts` 为空；`_meta.ui.csp` 三个域名字段与 assetPrefix 不动。O 共改 15 个文件（+151 / −24）。

**回滚**：`git checkout n-features-done`（ec8329a）。该 tag 的 widget 是 l-1，回滚后同样要重连连接器。

---

#### 验收结果

##### M.2 排版实测（MB，生产构建 `next start -p 3610`，JS 检查：`.vf-form` 内无元素 `scrollWidth > clientWidth + 1`、无标签 / 按钮 / 段落的矩形越出表单左右边界、`document.scrollWidth <= innerWidth`）

| 视口 | 语言 | 表单宽度 | 溢出元素 | 被裁元素 | 页面横向溢出 |
|---|---|---|---|---|---|
| 1280×800 | zh / en | 320 px（43..363） | 无 | 无 | 无 |
| 1440×900 | zh / en | 320 px（130..450） | 无 | 无 | 无 |
| 768×1024（单列） | zh / en | 705 px（24..729） | 无 | 无 | docW 753 ≤ 768 |
| 375×812（移动端仿真） | zh / en | 327 px（24..351 = 375 − 2×24） | 无 | 无 | docW == innerWidth |

修复前（014e9cd 之前）英文页在 375 宽因单行预设说明的 nowrap 被撑到 850 px；ⓘ 按钮继承了 `width: 100%`（320 px 宽）；滑块 2 px 默认边距溢出标签 2 px。每个宽度 × 语言各截了 0.5 倍缩放的截图；视口已复位、服务器已停。另在浏览器里确认：等比 ⓘ 展开（aria-expanded true，44 px 命中高度）、常数解 ⓘ 显示完整句子、范围行 "t ∈ [0, 10], y ∈ [-3.097, 4.097] (equal scale)"、结果行 "Results for t ∈ [0, 10], y ∈ [-0.5, 1.5] ⓘ"、表达式能编译时语法提示不出现、Help 链接为 `/help?loc=en`、`/help` 200。编排者的 M 验收见上文「M 阶段浏览器验收」。

##### N 阶段（编排者，`next dev`，会话浏览器面板；面板隐藏时 requestAnimationFrame 不触发，因此悬停高亮无法在此验证）

- 初值输入：x₀=1, y₀=0 → Add solution → "Clear trajectories (1)"；再加 (2, 0) → (2)；地址栏 `?loc=en&traj=1,0;2,0`。
- 撤销：Undo 按钮与 Ctrl+Z 各撤销一步（2 → 1）；Clear 后 0，Undo 后恢复 1；URL 的 traj 随每步变化。
- 单条删除：用面板的真实点击点在简谐振子轨线（世界点 (0, 1)）上 → 计数 1 → 0、URL 的 traj 消失。合成 PointerEvent 因 `setPointerCapture` 对非活动指针抛 NotFoundError 而走不通，已加 try/catch 防护（ec8329a）。
- 查询：选中轨线 (1, 0)，kind x，value 0 → 列出 t = ±(π/2 + kπ) 的全部交点（t 到 ~1e-11 括号宽度，y = ±0.99999… ±1.0e-5），说明句 "Three or more crossings in one direction look periodic: more crossings may exist beyond the integrated span."，精度句说明数值解与再积分；两条积分腿的终止状态各一行。
- NB / NC 各自在生产构建上的 DOM 驱动验证：Clear → 改 t₀ 后仍是清空的；Undo 恢复；点固定轨线的起点删除、URL 的 traj 缩短；初值校验信息；简谐振子 (1, 0) 查 y = 0 → 31 个命中，x = ±1.000000 (±1.0e-5)，note possibly_more_beyond_span，基础画布上 186 个标记色像素；dy/dt = y 从 (0, 1)（中文界面）查 t = 2 → y = 7.389060 (±7.7e-5)（e² = 7.389056）；t = 10 → not_reached_in_span 并列出两条腿（正向在 4.09 离开远盒、逆向完成到 −50）；"abc" → 校验句；Clear → 结果消失、下拉禁用并显示空态选项。
- 遗留交给 O（都已在 643457b 做掉）：hook 的 scene 未带 refineCapped（网页外壳）；PNG 页脚未传输入范围；交点时间显示到 12 位小数（时间误差只是 Brent 括号宽度，应取 max(括号宽度, 位置误差 / 速度)）。

##### O 阶段（模拟主机：`BASE_URL=http://localhost:3810` 构建，`next start -p 3810`，`serve.mjs --mcp http://localhost:3810/mcp`，host 3520 / sandbox 3521，`?inspect=1`）

- 握手：initialize → `resources/read` 的 `ui://vector-field-tool/widget.html?v=o-1`（13.3 KB，`<base href="http://localhost:3810/">`，CSP 带 connect / resource / baseUri 三个域名）→ `ui/initialize` → initialized；widget 显示 "Connected, waiting…"。控制台只有已知的 zod eval CSP 探测。
- `analyze_first_order sqrt(y)`（en）：斜率场、140 个灰色圆环、"Constant solution y = 0: domain edge, left. ⓘ"；真实点击 ⓘ 展开定义域边界句和 Lipschitz / 唯一性句；类型识别同样折叠带 ⓘ。
- `analyze_system y / -x + sin(t)`（zh 场景）："非自治系统：t = 1.5 时刻的快照，不做平衡点分析 ⓘ"，无平衡点。
- `analyze_second_order x'' + 0.5x' + x = 0`：稳定螺旋 λ = −0.25 ± 0.9682i、tr / det；降阶那一行在 8e54eef 之前缺失、重建后出现。
- `query_solution`（x' = y, y' = −x 从 (1, 0)，x = 0，tSpan 10）：6 个红色菱形标记带标签、6 行命中、"possibly more beyond the span" 说明、精度句；工具文字现在是 t = 1.570796 (±1e-5)。
- 交互（真实指针）：悬停预览有画（这次 rAF 在面板隐藏时也触发了）、点击固定（t = ±50 两行）、悬停固定轨线变橙色高亮、点击它删除、Undo 恢复、滚轮缩放 → [−3.277, 3.26]×[−2.221, 2.224]、拖动平移 → [−4.014, 2.522]×[−1.801, 2.644]、6 次 size-changed 通知（最后 720×925）。每一步控制台无 error。
- 限制：面板 455 px 高会切掉 widget，检查时仿真了 1000×1500 视口并在之后复位；find / read_page 看不进沙箱 iframe（跨源），文字来自 `mock.readText()` 和截图。
- smoke：`node scripts/smoke.mjs http://localhost:3810/mcp` 在 8e54eef 重建前后都 20/20，含 "tools/list has 7 tools"、"tools/call query_solution"（y(2) ≈ e²）、"widget asset URLs are absolute"（真 PASS，非 SKIP）和 o-1 URI。

---

#### 验证输出（main = 8e54eef，2026-09-09 23:38，写本文档前重跑）

```
$ npm run typecheck        （tsc --noEmit）
(无输出) exit 0

$ npm test                 （vitest run，v4.1.11）
 Test Files  36 passed (36)
      Tests  883 passed | 2 expected fail (885)
   Duration  31.92s
exit 0

$ npm run build            （Next.js Turbopack，本地无 BASE_URL）
✓ Generating static pages using 13 workers (11/11) in 3.1s
Route (app)
┌ ƒ /
├ ○ /_not-found
├ ƒ /embed
├ ƒ /help
├ ○ /icon.svg
├ ƒ /mcp
├ ○ /opengraph-image
├ ○ /robots.txt
├ ○ /sitemap.xml
├ ƒ /vector-field
└ ○ /widget
exit 0

$ git log --oneline l-mcp-done..HEAD   （本文档提交之前）
8e54eef [O] widget: keep the second-order reduction line in the live summary
c89f24a [O] tools: query_solution description says such questions must call it, never a closed form
2b2ac8c [O] widget: hover highlight, Undo button, Ctrl+Z; WIDGET_VERSION l-1 -> o-1
643457b [O] fixes: refineCapped in the web shell scene, PNG footer entered range, crossing-time precision
ec8329a [N] canvas: tolerate setPointerCapture failures
723d62d [N] app+widget: solution query panel and markers
69bf145 [N] app: initial-value inputs
58d91d6 [N] trajectories: click to remove, hover feedback, undo stack, long-press delete
141beed [N] trajectories: clear fixed, screen-space hit test
ece23f4 [N] fixes: it.fails removed, non-autonomous status wording, quadtree stop rule, 1e999 rejected, PNG footer ranges, no refineCapped on continua
4043f89 [N] tools: query_solution
25d1f9c [N] query: solution query kernel (time and coordinate targets by re-integration)
05a67e3 [docs] MNO summary: M stage done, m-english-done is deployable; production check
de1665b [M] CLAUDE.md: kernel freeze and the heuristic constants
c4b491e [M] text: no hard-coded Chinese outside the label tables
4059958 [M] README: English rewrite
78ce1a5 [M] tools: locale optional, defaults to en
4f211b9 [M] site: English by default; language only from the URL
014e9cd [M] layout: info toggle keeps its own width, no horizontal overflow at 375 / 768
af9d038 [M] help: controls / notation / reading the results
a05bde8 [M] shells: folded caveats with full text behind an info toggle (data untouched)
b205042 [M] copy: labels trimmed, explanations moved to help, disclosure component
c724f06 [M] layout: left column fits its content in both languages
bb907f5 [docs] IJKL summary: push status (not pushed; the push is the owner's step)
6826d02 [docs] IJKL summary, decisions, open questions; README and CLAUDE.md for the I-L state

$ git tag
a-core-done b-tools-done c-render-done d-webshell-done e-widget-done f-forms-done
g-render-done g-widget-done h1-deploy-ready h2-math-done h2-reviewed i-notation-done
j-math-done k-website-done l-mcp-done m-english-done n-features-done night-final
o-mcp-done p0-verified s-spike-done
```

测试数变化：L 结束 811（808 + 3）→ M 结束 818（815 + 3）→ N 结束 882（880 + 2，N.3 (a) 删掉一个 `it.fails`）→ O 结束 885（883 + 2）。

#### 验证清单（按「最快发现问题」排序；每步失败回滚到哪个 tag）

本轮三个 tag 在提交线上是顺序的（M → N → O），没有上一轮那种交错，所以「退掉 O 保留 N」= `n-features-done`，「退掉 N、O 保留 M」= `m-english-done`，「全退」= `l-mcp-done`。任何回滚到 `n-features-done` 或更早的 widget 都是 l-1，同样要在 Claude 里重连连接器。

1. **本地三绿** `npm run typecheck` / `npm test` / `npm run build` —— 1 分钟内知道代码是否完整；`npm test` 应是 883 通过 + 2 expected fail（885）。失败：`git checkout n-features-done`（应 880 + 2）；再不行 `m-english-done`（815 + 3）；再不行 `l-mcp-done`。
2. **打开 `/vector-field`**：不带参数就是英文（`<html lang="en">`，顶部只有一行 "Slope fields, phase portraits, equilibria." + Help 链接，画布下只有 `x ∈ […], y ∈ […] (equal scale)` 一行，结果行 `Results for … ⓘ`）；`?loc=zh` 才是中文（`zh-CN`）；语言下拉切换后 URL 带 `loc`。左栏在 1280 和 375 宽、中英两种语言下没有被截断的标签 / 按钮文字、页面不能横向滚动（375 为单列）。失败：`l-mcp-done`（M 之前，但那是中文默认的旧站）。
3. **ⓘ 开关**：预设说明、Equal scale、Results for、平衡点 caveat 的 ⓘ 点击各展开全文（简谐振子预设应展开「仅凭线性化无法区分真正的中心与极缓慢的螺旋…」那段），Escape 关闭；输入 `xy` 时语法说明出现在错误旁边、改回后消失；取消 Equal scale 时常驻警告仍在。失败：`l-mcp-done`。
4. **初值 + 删除 + 撤销**（简谐振子预设，或 x' = y, y' = −x）：x₀ = 1, y₀ = 0 → Add solution → 按钮变 "Clear trajectories (1)"、URL `traj=1,0`；再加 (2, 0) → (2)；悬停在轨线上应加粗且光标变 pointer（本轮只在模拟主机里看到过，网页版请你看一眼），点击它 → (1)、URL 变短；Undo → (2)；Ctrl+Z → (1)；Clear → (0)；Undo → (1)。换一个非自治预设后改 t₀，清掉的轨线不应回来。失败：`m-english-done`。
5. **查询**：(a) 简谐振子 (1, 0)，kind x，value 0 → 正负两向的 t = ±(π/2 + kπ)，说明句 "Three or more crossings in one direction look periodic…"，画布上每个交点一个红色菱形 + 坐标标签；(b) logistic `y*(1-y)`，t₀ = 0, y₀ = 0.1，kind y，value 0.5 → t ≈ 2.197（ln 9 = 2.197225）；(c) `y^2`，t₀ = 0, y₀ = 1，kind t，value 2 → "stopped before the target" 那一句，正向腿显示在 t ≈ 0.98（= 59/60，y 到达 20 倍盒子的边）离开远盒——**不能是空结果**；(d) 删除被查询的轨线 → 标记和文字一起消失。失败：`m-english-done`。
6. **PNG 下载**：缩放后页脚同时有 "entered … · shown …" 两个范围，复位时只有一个。失败：`n-features-done`（网页外壳的调用点是 O 的 643457b；退到 N 只打一个范围，不会打错的）。
7. **`/embed` 嵌进 Google Sites**：`/help` 嵌入一节的 iframe 片段；应显示画布 + 表单（含新的初值 / 查询字段组）。折叠后页面变短，帮助页写的 1280 / 1260 px 可能偏高，按实际改 `EMBED_HEIGHT_*`。失败：先 `curl -I https://tools.studycase.net/embed` 看 `frame-ancestors *` 且无 `X-Frame-Options`；代码回滚 `l-mcp-done`。
8. **手机 / 触屏**：375 单列；长按空白 = 固定，长按已固定轨线 = 删除（轻点轨线后应出现 "Hold to remove this trajectory"）；Undo 按钮可用。本轮没有真机测试。失败：`m-english-done`。
9. **Claude：断开并重新连接连接器**（widget o-1），「用 ping 发 hello」—— 链路。失败与代码无关（先查部署是否完成、`BASE_URL`）；代码回滚 `n-features-done`（widget 回到 l-1，同样重连）。
10. **Claude：「dy/dt = y, y(0) = 1, y(2) = ?」** —— 模型**必须先调用** `query_solution`（工具调用出现在任何推导之前），答案 ≈ 7.38906（工具给 7.389060 (±7.7e-5)；e² = 7.389056），widget 里一个红色菱形标记；接着问「y 什么时候到 2」→ 再调一次，t = 0.693147 (±1e-5 量级)（ln 2）。失败（模型仍心算闭式解）：这是 description 措辞的问题，回滚没有意义；把模型的原话记进 open-questions。
11. **Claude：「分析 2*t*y dt + (t^2+y^2) dy = 0」** —— 必须先调 `analyze_first_order`；widget 里 caveat 折叠成短句 + ⓘ，展开是全文；对照模型的转述，它读到的摘要应是完整 caveat（屏幕上省字，传给 AI 的不省）。失败：`l-mcp-done`。
12. **Claude：widget 交互**：悬停固定轨线高亮、点击删除、Undo 恢复；`x' = y, y' = −x` 从 (1, 0) 查 x = 0 → 6 个菱形标记。失败：`n-features-done`。
13. **`npm run smoke -- https://tools.studycase.net/mcp`** —— 20/20，7 个工具，`widget asset URLs are absolute` PASS 且指向你的域名，widget uri `?v=o-1`。失败：`n-features-done`（回到 l-1，smoke 期望也随之回到 l-1）；`[base-url]` 警告看 Vercel 构建日志。

<!-- END SOURCE MNO-summary.md -->

---

<!-- BEGIN SOURCE MNO-decisions.md -->
<a id="history-mno-decisions"></a>

## 历史 15：MNO-decisions.md

来源：[MNO-decisions.md](MNO-decisions.md)。下文为阶段原记录，时间和状态保持当时口径。

### M–O 轮决策记录（2026-09-09）

所有偏离《英文默认 + 文案精简 + 轨线管理 + 解的查询》简报的决定和理由，以及简报没有规定、由编排者或实现智能体拍板的细节。按阶段分组；智能体报告（scratchpad 的 m-agents / n-agents / o-report）是「实际做成了什么」的依据。

#### 环境与工作树

- 会话仍落在 `E:\project\demo` 的 worktree 里，任务仓库是 `E:\project\vector-field-tool`，全部命令用绝对路径；demo 仓库一个字节没动。
- **并行用手工 worktree**（与上一轮相同）：M 阶段 MA 在 `E:\project\vft-wt\m1`（分支 `wip/m1`），MB 直接在 main；N 阶段 NB 在 `E:\project\vft-wt\n2`（`wip/n2`），NA 在 main、NC 在 NB 合入之后在 main。做完在 worktree 里 `git rebase main`，再 `git merge --ff-only`，历史直线。MA 的 rebase 只停一次（两个外壳的 `@/lib/labels` import 行：取 MB 的新 import 集合、去掉 MA 删掉的 `localeFromLanguageTag`）；NB 的 rebase 三处冲突都是 `lib/labels.ts` 的 `UiKey` 联合与双语表，取并集。两次都没有 fixup 提交。写本文档时 `git worktree list` 只剩 main，`wip/*` 分支已不存在。
- **MA 开工时工作树不干净**：5 个文件（app/site-locale.ts、app/widget/page.tsx、components/SitePage.tsx、components/VectorFieldApp.tsx、lib/url-state.ts）带着上一次同一任务的未提交改动。MA 逐行审过后保留，在其上完成 M.1 并作为第 1 个提交，没有丢弃。
- **行尾**：NA、NB 的 Python 编辑产生了 CRLF，两组提交都用原提交信息按 LF 重建（`diff --ignore-cr-at-eol` 为空）；NB 重建后的中间提交没有重跑 `npm test`（与 CRLF 版本逐字节相同 modulo CR）。MA 的 CLAUDE.md 提交有约 37 行只差空白（`--ignore-all-space` 只剩 10 处有意的删除），现在 CLAUDE.md 0 行 CRLF；本轮 docs 提交按行编辑。
- 智能体在 worktree 里只跑 typecheck + test，build 只在 main 合入后跑；M、N 各有一次集成验证（生产构建 + curl 头 + smoke）。

#### M 阶段

- **M.1 `locale: null` 的含义改了**：`AppState.locale: Locale | null` 从上一轮的「没选过语言 → 跟浏览器」改为「链接里没有 `loc` → 英文」；`navigator.language` 不再读，只在注释里以 "never navigator.language" 出现；派生测试锁定「无 loc ↔ locale null」、encode null → ""、`loc=zh/en` 往返。`<html lang>` 服务端在每个路由都是 `en`，zh 页由 `useDocumentLang` 水合后改成 `zh-CN`（`<main lang="zh-CN">` 同时保留）。
- **`localeFromLanguageTag` 留着**：仍导出、仍有测试，但没有外壳用它。MA 为了不碰 MB 正在大改的 `lib/labels.ts` 而不删，记在 CLAUDE.md；语言 `<option>` 的文字也因此从 `siteText(locale).site.langZh/langEn` 取而不是加新的 labels 键（两张表都带原生名 中文 / English），VectorFieldApp 只改 3 行。
- **H2.9 测试反转**：`locale` 从必填改回可选默认 `en`，理由照简报——漏传的代价是英文摘要，而 isError 会把一个失败的回答送到学生面前。tools.test.ts 的 H2.9 测试改为：description 匹配 /defaults to en/ 且不匹配 /REQUIRED/、schema default "en"、`required` 里没有 locale、五个数学工具不带 locale 调用 isError 为假、`scene.locale` 为 "en"、文字非空且无 CJK。`scripts/smoke.mjs` 本来就总是显式传 locale、从没断言过缺 locale 的报错，所以没改；缺 locale 的行为用一次直接 curl 验证。
- **CJK 扫描改了什么**（一次性 node 脚本在 scratchpad，不入库；排除 labels.ts、site-text.ts、presets.ts 的表、labels-trajectory.ts、detect-form.ts、测试）：`app/vector-field/presets.ts` 的 9 条分节注释改英文（zh/en 预设表不动）；`bilingual()` / `SITE_NAME_BILINGUAL` 改为英文在前（"Vector Field Tool / 向量场教学工具"），页面标题、og:site_name、applicationName、OG 图的 alt 与绘制文字随之；`app/layout.tsx` og:locale `en_US`、alternate `zh_CN`。检查为干净的：lib/export-footer.ts、页面 metadata（都走 bilingual()）、错误提示、帮助页、app/mcp/*。剩余 39 处命中全是 presets.ts 的双语表条目；`components/Info.tsx` 一条 doc 注释里的 "Details" / "详情" 是注释不是字符串，留着。docs/*.md 与 CLAUDE.md 按简报不动。
- **折叠 = 显示，不是数据**：Scene / structuredContent / `app/mcp/tools.ts` 的摘要一个字没动，`app/mcp/tools.test.ts` 未改，这是「传给 AI 的不省」的证据。短句本身诚实：平衡点行是 `(0, 0) center or weak spiral (linearization cannot tell) ⓘ  λ = ±1i · tr = 0, det = 1`，「线性化分不出」在短句里；常数解短句用已有的 `stabilityShort` 标签（如 "domain edge, left"），完整句（含定义侧、分数幂提示、平台 / 探针说明、唯一性）在 ⓘ 后面；非自治用 `ui.timeDependentShort` + 全文；类型识别把结论句放在行上、证据与 caveat 放在后面。**警告不折叠**：possible_continuum、region_of_equilibria、none_found、非等比警告、非唯一预览提示、奇异采样说明全部常显。widget 折叠方式相同（同一份 `Folded` 数据）。
- **特征值缩写**：新的纯函数 `formatEigenvalues`——共轭对写 "±0.9682i" / "-0.25 ± 0.9682i"，其他情况列原样；负号用 `formatNumber` 的 ASCII '-' 而不是简报例子里的 Unicode 减号，与同一行的 tr / det 数字一致。
- **Info 组件**（`components/Info.tsx`）：真按钮（aria-expanded、aria-controls、aria-label = `ui.details`），Escape 关闭，负边距做出 44 px 命中区而不改变行高，面板是 `display: block` 的 span 以便合法地放在 `<p>` / `<li>` 里；`FoldedLine` = 短句 + ⓘ + 展开行。纯状态只是一个布尔开关，没写单元测试，在浏览器里验的。预设说明的 ⓘ 放在说明行内、不在 `.vf-form` 里。
- **布局数字**：`.vf-form` `flex: 0 1 320px; min-width: 280px; max-width: 100%`，子元素 `min-width: 0`；label / span / p 允许换行（`overflow-wrap: anywhere`、`white-space: normal`）；按钮 / 下拉 / 输入 `width: 100%; box-sizing: border-box`，ⓘ 与复选框除外；滑块 margin 0；800 px 以下单列不变。实测后的三处补丁（ⓘ 继承了 width 100% 变成 320 px 宽、滑块 2 px 默认边距溢出、单行预设说明的 nowrap 在 375 / 768 把页面撑到 850 px → 网格分区 `minmax(0, 1fr)`、说明行 `min-width: 0`）作为第五个 `[M] layout` 提交，没有改写三个后续提交下面的历史。
- **文案取舍**（`lib/labels.ts`，双语，键集合一致性测试）：`ui.subtitle` 删除，加 `ui.tagline`（"Slope fields, phase portraits, equilibria."）与 `ui.help` 链接（`/help?loc=<locale>`）；`shownRangeEqual/Filled` = 范围 + "(equal scale)" / "(filled)"，重复的 `ui.shownRange` 删除；**`ui.interactionHint / interactionHintTouch` 保留但只有 widget 显示**——Claude 里没有帮助页可去；`featuresBox` 只剩范围，解释进 `featuresBoxDetail`；语法提示只在编译失败时随错误框显示（`data-syntax-hint`），全文在 /help；`equalScale` 不再取 `{hv}`，`equalScaleDetail` 取；VectorFieldApp 不再用 `useCoarsePointer`。
- **帮助页重组**（`lib/site-text.ts` + `components/HelpContent.tsx`）：Controls（表单：预设、类型、范围、密度、箭头、等比 + 显示范围行、快照 t、清除、复制链接、PNG；鼠标；触屏）/ Notation（记号条目、一阶与二阶的写法及其数值检验 caveat、解析器的函数表、常数 / 分段 / 负底数幂）/ Reading the results（范围行、ⓘ 折叠说明、λ = a ± bi 的平衡点行、标记含灰色圆环、中心说明、类型识别分级、唯一性、快照、定义域边界、截断、最后一条轨线行），之后仍是 limits、embed、Claude。新增 site-text 测试断言每条被删掉的解释都在两种语言的帮助页里。
- **README**：完全英文重写（扫描 0 个 CJK 字符）；许可一节写 "No license file yet"，因为 package.json 是 private、仓库根没有 LICENSE；Cloudflare "DNS-only" 一行陈述的是简报的要求，域名的真实 DNS 配置从仓库里验不了。
- **CLAUDE.md 内核冻结一节**在 M 做了（简报把它列在 M 之前的总则里）：逐文件列出 uniqueness / slope-field / equilibria / jacobian / classify / detect-form / time-dependence / second-order 的常数和一句话作用，写明「未经独立验证的启发式，只有真实课堂失败驱动时才改」，极端盒子的 open-questions 保持现状。
- **M.4 结论**：线上就是最新提交（`/help` 200、`/` 200、widget l-1），没有漏推；「看不到」按缓存 / 构建未完成处理，没有改部署配置。
- **M 完成后单独提交了一次 docs**（05a67e3），让你在 N、O 没做完时就能只部署 M。

#### N 阶段

##### N.1 轨线管理

- **是 bug，不是缺功能**：NB 在生产构建里复现——「清除」对点击加的轨线有效，但链接 / 预设的 `traj` 种子在改快照时刻 t₀ 后回来，因为 hook 的种子 effect 以含 snapshotT 的 systemKey 为键、每次都重新追踪 `initialTrajectoryStarts`。修法不是补丁而是换结构：固定轨线放进一个纯 store（`lib/trajectory-store.ts`），**起点是唯一真相**，曲线由注入的 trace 派生；systemKey 变或换了种子数组 → 重置为种子；新增 `retraceKey`（网页外壳传 snapshotT）→ 只重追踪当前起点。所以**改快照时刻现在会重追踪所有当前起点**（种子和点击加的都在），而不是丢掉点击加的再重新种：链接的 `traj` 与页面一致，清掉的起点不可能回来。widget 的 systemKey 契约（新的工具结果重置为场景自带曲线）不变。
- **命中判定在屏幕坐标**（简报要求）：`lib/trajectory-hit.ts` 点到线段的最短距离，`HIT_THRESHOLD_PX` = 8，与缩放无关（推导测试覆盖同一世界偏移在不同像素密度下命中 / 不命中）。命中用扁平的轨线列表、每个起点固定 2 条（正向 / 逆向），与 App 的 `trajectories.length / 2` 计数一致；除不尽的列表什么都不命中。
- **一次点击不能既选中又删除**（NC 记录）：NB 交付的手势是「点固定轨线 = 删除」（提示文字和测试都锁定）。查询面板因此不用点击选中，而是：点空白处或 Add solution 加的轨线成为预选，下拉跟随最新加入（纯 `selectedTrajectoryIndex`：有人为选择且该起点仍在、之后没有新增时保持，否则最新）；删除被查询的轨线通过 hook 的 `queryStart` 门把结果连标记一起丢掉。要「点击选中」得先改删除手势（修饰键点击或模式切换），留给你定。
- **撤销深度 20**（简报 ≥ 10，`HISTORY_LIMIT`）；历史在重追踪后保留、在种子重置（改方程 / 载入预设）时丢弃；Clear 是一步可撤销操作。键盘监听放在 VectorFieldApp 的 window keydown 而不是 hook 里，让 widget 不会在宿主里抢 Ctrl+Z——O 阶段 widget 又用同一个 `lib/undo-key` 自己加了监听（只在 iframe 有焦点时生效）。
- **长按删除复用现有路径**：longPress → onClickWorld → clickAction，不加新的手势动作；`lib/gestures.ts` 不动，触屏与鼠标共用一条规则。代价："hold to remove" 提示只在轻点固定轨线（= 悬停预览）后出现，直接长按没有事先提示。
- **初值输入拒绝 |v| > `MAX_ABS_VALUE`（1e6，链接的上限）**并报 outOfRange，而不只是 "finite"：否则一个加进来的起点会从链接里悄悄消失。
- **setPointerCapture 防护**（ec8329a，编排者提交）：验收用 DOM 派发的合成 PointerEvent 时 `setPointerCapture` 对非活动指针抛 NotFoundError；真实点击不受影响。加 try/catch 后 tag 打在这个提交上。

##### N.2 查询

- **时间目标是绝对的**：t* 相对于起点的 t0（默认 0；自治系统只关心 t* − t0，调用方可以传 t0 = 0 和相对 t*）。可达当且仅当 |t* − t0| ≤ 该方向**实际积分到**的时间；可达时从起点重新积分到恰好 t*（一个方向，tSpan = |t* − t0|），时间误差 0。**kind time 从不说 not_reached_in_span**：够不到的 t* 一律 stopped_before_target，由该方向的 status / tEnd 说是 span 结束（completed，意思是加大 tSpan）还是运行停了（left_box / blew_up / …）——这正是简报测试单的写法。
- **坐标目标从括号左端的已存状态重新积分**（简报的规定），用 Brent（Numerical Recipes zbrent）而不是二分：每个括号几次重新积分而不是约 40 次；停止条件 括号 < max(1e-12 |t|, 1e-14 tSpan) 或 60 次求值（`MAX_BRACKET_ITERATIONS`），最终括号宽度就是报告的时间误差。后果（NA 记录）：工具里 e² 的命中是 7.3890595（相对误差 4.6e-7，在 ±7.7e-5 的估计内），因为它从 h = 0.05 基础运行的括号左端状态出发；从起点直接重新积分会更准，但简报规定了括号左端。
- **误差模型 10 × 容差尺度**（`TOLERANCE_SAFETY`）：积分器每步接受时嵌入误差 ≤ sc = atol + rtol|p|，N 步以随机符号累加约 √N，10 覆盖 N ≤ 100 且无放大；穿过强扩张区域可能超出，所以处处叫「估计」，不叫上界。坐标命中再加 |dp/dt| × 时间误差。推导在 `lib/core/query.ts` 文件头。
- **note 永远是键**（ok / not_reached_in_span / stopped_before_target / possibly_more_beyond_span / target_is_start），外壳措辞；`possibly_more_beyond_span` 要求命中 ≥ 3 的那个方向状态是 completed（爆破或离盒的方向没有「更远」）。
- **y² 爆破测试的两种断言**：任何有限停止盒都先离盒（maxPosition = 1e6 × 盒子尺度），外壳的盒子给 left_box 于 t = 59/60；「积分器看到的」停止需要巨大盒子 + 长 span，那时步长坍缩（hMin = tSpan × 1e-12）被判 singular（场 1e16 > 1e3 × 参考速度），距 1 在 0.01 内。两种情况都精确断言，没有放松状态。NA 最初对离盒时间的期望（1e-3）是错误推导（最后一步的线性截断差 h²/8 ≈ 0.01），提交前改成 0.02 并把推导写进测试；没有动任何已有测试的容差。
- **一阶方程的 "t" 映射到坐标 kind**：一阶图上学生的 kind t 是横坐标（内核 kind "x"），只有平面图才有真正的 time kind（`lib/query-panel.kernelQueryKind`：ty 模式 t → "x"、y → "y"；xy 模式 t → "time"）。工具里一阶方程传 target.kind "x" 或 x0 都是可读的 isError。
- **工具输入名**：first / diff 用 t0，system / second 用 x0（对模型比简报的「t0 当 x0」清楚）；平面模式没给 x0 时 t0 仍作为 x0 的别名，所以简报的约定也能用。tSpan 默认 20、上限 1000；停止盒 = 视图的 20 倍，与外壳一致。
- **两种命中格式并存**：网页面板用自己的纯格式化（`queryHitText`：按误差的 2 位有效数字四舍五入，如 0.00123 → 0.0012、123 → 120），工具摘要和 widget 用 NA 的 `queryLines`（6 位定点），因为 `app/mcp/tools.test.ts` 锁定了那个格式；note 句与精度句通过 `queryNoteText` 和 `L.tool.queryAccuracy` 共用。
- **面板的积分与固定轨线完全一致**：`integrateAdaptive` h 0.05、rtol 1e-6、atol 1e-9、远盒 `fixedStopBox(输入范围)`、`CLICK_TSPAN` = 50、t0 = snapshotT——查询问的就是屏幕上那条曲线。2 s 墙钟预算从 App 注入 checkpoint（内核无时钟），超时显示 `ui.queryTooLong`。结果以方程 + 输入范围 + 快照时刻为键。
- **两条腿复用 `trajectoryLines`**：内核的 forward / backward（status、tEnd、points）标成 stop "far" 的轨线，带被查询轨线对的 nonUnique 标志，措辞是共享的模式感知版本（显式一阶显示端点的 t、微分形式列两侧）。微分形式图上 "y =" 查询：内核按归约系统的参数化，命中点正确，但腿的句子没有方向词。

##### N.3

- **(b) 只改措辞不改状态值**：非自治场景的 `reached_equilibrium` 在数据里还是这个键（积分器冻结），三处显示（trace_trajectory、query_solution、两个外壳的 `labels-trajectory`）改用 `tool.stoppedNonAutonomous`：「速度在该时刻降到接近零后停止；非自治系统，这里不是平衡点：场在这一点随 t 变化」。测试断言状态仍是 reached_equilibrium 且文字不含「平衡点」。
- **(c) 停止规则做了、目标没到**：格子中心的运行已收敛到格子外一个已知根、且格子比它到该根的距离小 → 不再细分。x' = xy, y' = x² − y 的细分格子从 1024（封顶）降到 254、`refineCapped` 变 false，x⁷ 在 [−100, 100]² 的守卫（原点与鞍点共享深度 0 的格子）通过。**时间 ~1.1 s（之前 1.0–1.35 s）**：约 1.48 M 次场求值来自约 254 次 Newton 运行各自爬向原点这个**退化根**（雅可比奇异 → 伪逆步、线性收敛、`EXTENDED_ITERATIONS`），不是四叉树本身。再降需要内核新机制（简报冻结），按简报「做不到就记 open-questions 不硬撑」处理，规则保留因为守卫通过。
- **(d) 无代码改动**：`1e999` 早被解析器白名单拒绝（mathjs 把它解析成非有限的 ConstantNode），四种模式各加一条推导测试。
- **(e)(f) 的调用点留给 O**：`exportFooterText` 的第 5 个参数和 `refineCapped` 的 hook 一行都在 NB 的文件里（并行时的文件所有权），NA 只写清楚改哪一行，O 阶段 643457b 补上。
- **六条修复一个提交**（ece23f4）而不是「一个模块一个提交」：NA 的选择，每条都很小且各带测试。

#### O 阶段

- **widget o-1 加了什么**：共享 hook 的 highlight / cursor 传给画布（悬停固定轨线高亮）、`Undo` 按钮 + Ctrl/Cmd+Z（`lib/undo-key`，只在 iframe 有焦点时生效）、`secondOrder` 的纯数据透传（模拟主机发现 live 场景缺降阶行）。**没有加 Clear 按钮**（简报只要求删除与撤销；hook 的 `clearTrajectories` 会连工具自带的 trace_trajectory 曲线一起清掉，而那些曲线没有起点、既不能点击删除也不能撤销——见 open-questions）。M 阶段 widget 保留了操作提示（interactionHint），因为 Claude 里没有帮助页。
- **8e54eef 不再 bump 版本**：o-1 尚未发布，同一版本号内修。
- **交点时间的显示规则**：显示的时间不确定度 = max(error.t, error.position / speed)（`timeUncertainty`，`QueryHit.speed` = 命中处的 |F|）；指定时间目标（error.t === 0）保持精确、不带括号（已有测试不变）；speed 为 0 或非有限时保留括号宽度。编排者给 O 的任务写的是「5 位小数」，共享的 `errorDigits` 规则（误差的 2 位有效数字）对 1.0e-5 给出 6 位（最后一位在 1e-6，与坐标相同）；保留共享规则而不为时间单开一套，测试断言 6 位且「不是 12 位」。
- **description 措辞**：`query_solution` 以 CALL THIS TOOL FIRST 开头，明写「某时刻的值 / 何时到某值」的问题必须调用本工具、"never evaluate that closed form mentally"，然后 WHAT IT COMPUTES 说明再积分与从不插值；tools.test.ts 锁定。其他 6 个工具的 description 只改了 locale 一句（M）。
- **模拟主机的设计与限制**：沿用 L 的两源结构（host 3520 / sandbox 3521，沙箱按 URL 加载、CSP 由 `_meta.ui.csp` 生成），这次用 `BASE_URL=http://localhost:3810` 构建，所以 "widget asset URLs are absolute" 是真 PASS；新增 query_solution 场景与 host.html 的两行。限制：会话浏览器的 find / read_page 看不进跨源沙箱 iframe，文字靠 `mock.readText()` 与截图；面板 455 px 高会切掉 widget，检查时仿真 1000×1500 视口再复位；rAF 这次在面板隐藏时也触发了（与 N 阶段的观察相反，两种情况都如实记录）。
- **回滚**：`git checkout n-features-done`；该 tag 的 widget 是 l-1，回滚也要重连连接器。

#### 流程决策

- **两个 worktree 智能体 + 顺序集成**：M（MA / MB）和 N（NA / NB 并行，NC 之后）各一次集成验证（生产构建、curl 头、smoke、缺 locale 的直接调用）；O 一个智能体在 main 上做。
- **浏览器验收由编排者做**（会话自带面板，`next dev`），不派审查智能体：M 验了四个宽度 × 两种语言与 4 个 ⓘ；N 验了初值 / 撤销 / 单条删除 / 查询。面板隐藏时 rAF 不触发，悬停高亮在 N 里验不了，O 在模拟主机里看到了。
- **本轮没有跑大规模对抗式审查**（简报要求）。简报允许的窄审查（`query_solution` 的数值正确性、URL 参数的安全面）**也没有跑**：报告里没有这一项，视为未审。
- **推送留给站长**：`git push` 被会话的权限分类器拦下（与上一轮相同），三个 tag 也只在本地。
- **智能体输出纪律**沿用上一轮：固定小节（summary / commits / done / notDone / decisions / openQuestions / apiChanges），长材料写 scratchpad，单次工具输出 ≤ 约 200 行；本文档同样分块写。
- **提交粒度**：`git add` 显式路径；每个提交 `npm test` 绿（NB 重建行尾后的中间提交除外，见「环境」）；M 完成后单独一个 docs 提交（05a67e3）以便先部署 M。

<!-- END SOURCE MNO-decisions.md -->

---

<!-- BEGIN SOURCE MNO-open-questions.md -->
<a id="history-mno-open-questions"></a>

## 历史 16：MNO-open-questions.md

来源：[MNO-open-questions.md](MNO-open-questions.md)。下文为阶段原记录，时间和状态保持当时口径。

### M–O 轮待决事项（2026-09-09）

需要你拍板的事、被标记的失败测试、性能、未验证的、其他。没有的项写「无」。

#### 需要你拍板

- **是否现在推 origin / 部署**：main = 8e54eef + 本 docs 提交，三绿、本地生产构建 smoke 20/20、模拟主机跑通，但 Claude 实机没有验过（widget o-1、`query_solution` 的「先调工具」）。推就是 M + N + O 一起上线；只想先上 M 用 `git push origin m-english-done:main`（之后再推 main 是快进）。编排者推不了。
- **`MAX_TRAJECTORY_STARTS` = 20 与新的初值输入行**：链接解码时超过 20 个起点的部分被丢掉；有了输入框后很容易加到 20 条以上。App 要不要在第 21 条时拒绝或警告？现在是静默丢（`lib/url-state.ts`）。
- **x' = xy, y' = x² − y 仍 ~1.1 s**（目标 300 ms 没达到）：剩下的时间是约 254 次 Newton 运行各自线性收敛到原点这个退化根（约 1.48 M 次场求值）。可能的办法是「运行进入一个已定位的、雅可比奇异的根的一个格子宽度内就中止」——这是冻结之下的内核新机制，要你解冻才做。
- **交点时间的显示规则**：现在显示 max(Brent 括号宽度, 位置误差 / 速度) 并按其 2 位有效数字四舍五入，典型结果 6 位小数（t = 1.570796 (±1e-5)）。编排者给 O 的任务写的是 5 位；保留与坐标一致的共享规则，还是为时间单独定位数？
- **widget 的 Clear 与工具自带曲线**：widget 没有 Clear 按钮；hook 的 `clearTrajectories` 会把 `trace_trajectory` 工具画的曲线一起清掉，而这些曲线没有起点、不能点击删除、也不进撤销历史。要不要给 widget 加 Clear？加的话是否对工具曲线可撤销（需要 store 记录无起点的曲线）？
- **查询面板的「点击选中」**：现在点固定轨线 = 删除，选中只能用下拉（最新加入的预选）。要点击选中得改删除手势（修饰键点击或模式切换），由你定。
- **嵌入高度 1280 / 1260 px**：折叠 caveat 和删掉解释后 `/embed` 变短，这两个常数（`lib/site-text.ts` 的 `EMBED_HEIGHT_*`）是折叠前量的，可能偏高；嵌进 Google Sites 后按实际改。
- **widget 要不要也去掉操作提示**（`ui.interactionHint / interactionHintTouch`，网页版已删）：现在保留，因为 Claude 里没有帮助页；N 阶段又把删除手势加进了这句，widget 的单行提示可能换行难看。
- **`/embed` 顶栏要不要加 Help 链接**（现在只有 "Open full page"）。
- **`localeFromLanguageTag`**：没有外壳再用它，只为不碰 labels.ts 而留；下一轮删不删。
- **e² 的精度**：坐标命中从括号左端已存状态重新积分（简报规定），工具里 e² 给 7.3890595（相对误差 4.6e-7，在估计内）；从起点直接重新积分会更准。要不要偏离简报。
- **"hold to remove" 提示的时机**：只在轻点固定轨线后出现，直接长按没有事先提示。
- **只改输入范围时固定轨线不重追踪**（store 以 systemKey 和种子数组为键）：面板会因盒子变化丢掉旧答案，但屏幕上的曲线在下一次加 / 撤销之前仍是旧远盒下追踪的那条。
- **`t0` 作为 `x0` 别名**（平面模式）：为兼容简报的写法保留；要不要在 description 里明说或删掉。

#### 被标记的失败测试

`grep -rn "it.fails" lib app --include=*.test.ts` 命中 2 行，`npm test` 报 "2 expected fail"（N.3 (a) 删掉了 `lib/core/slope-field.test.ts` 那条，3 → 2）：

1. **`lib/interactive.test.ts:457`** —— "planar: the same curve is flagged from the box x in [1, 3] (depends on findEquilibria locating a cusp equilibrium)"：x' = sqrt|x|, y' = −y 从 (2, 0) 出发、输入盒子 x ∈ [1, 3]，曲线探测在速度极小点周围的方盒里含原点，但 `findEquilibria` 在那里返回 none_found（测试注释：只有盒子 [−0.5, 0.5]² 上一个种子恰好落在 x = 0；其他盒子里 Newton / LM 在尖点振荡，sqrt|x| 的 Newton 步是镜像）。上一轮 J-fix2 的 JA 说尖点根在 [−0.05, 0.05]² 到 [−3, 3]² 上都找到了，但该测试仍失败；**本轮内核冻结，没有重新检查它为什么还失败**。
2. **`app/mcp/tools.test.ts:578`** —— "x'' = −x + x'/x': no equilibrium is reported at (1, 0), where the equation is undefined (review J-C.4, kernel open question)"：降阶得 x' = y, y' = −x + y/y，在 y = 0 整条线上无定义、其余处等于 (y, 1 − x)，定义域内没有零点；`findEquilibria` 接受极限点 (1, ~1e-26)（y/y 对每个非零 y 都是 1）并分类。修法需要 `findEquilibria` 拒绝「收敛点本身场为 NaN」的候选——新机制，冻结之下不动。

#### 性能

- **x' = xy, y' = x² − y（[−3, 3]²）：~1.1 s 每次**（修复前 1.0–1.35 s），细分格子 254、场求值约 1.48 M 次；原因与建议见「拍板」。守卫测试仍带 30 s 超时。
- 查询面板有 App 注入的 2 s 墙钟预算（超时显示 `ui.queryTooLong`）；NC 的简谐振子 y = 0 查询给 31 个命中，**没有报告耗时**；工具 `query_solution` 走 `app/mcp/budget.ts` 的 2 s 预算，模拟主机的 6 命中场景没有计时。
- 每个命中的 Brent 最多 60 次重新积分（从括号左端状态起，短区间），没有单独测量。
- 悬停高亮每帧算一次屏幕坐标命中（点到所有固定轨线线段的距离），没有测量；固定轨线多时（20 条 × 2 方向 × 点数）是否掉帧未检查。
- 没有在低端机或真机上测过。

#### 未验证的

- **悬停高亮 / 光标 pointer / 触屏提示**：只在 O 的模拟主机里看到过（widget，橙色高亮）；网页外壳的 N 验收时面板隐藏、rAF 不触发，没看到。命中逻辑有单元测试，覆盖层描边本身像其他画布绘制一样没有测试。
- **真实触屏**：长按固定轨线删除、长按空白固定、"Hold to remove" 提示——只测了纯手势状态机 → clickAction 的流程和 375 px 布局；widget 的触屏手势和等比开关本轮没有重跑（假定 L 的覆盖仍有效，共享代码未动）。
- **Claude 实机**：o-1 widget（重连后）、`query_solution` 是否被先调用、「dy/dt = y, y(0) = 1, y(2) = ?」与「y 什么时候到 2」、恰当方程问题的 caveat 全文是否传到了模型、widget 里的删除 / 撤销 / 查询标记。
- **widget iframe 内的 Ctrl+Z**：只在 iframe 有焦点时生效，模拟主机里没按（按钮路径验了）。网页外壳的 Ctrl+Z 编排者验过。
- **OG 图与社交卡片**：英文在前的 OG 图和 og:locale en_US 是构建时画的，没有人看过渲染结果（同上一轮的字体问题：Vercel 构建若无网络中文行可能成方块）。
- **线上 smoke**：`npm run smoke -- https://tools.studycase.net/mcp` 未跑（未推送、未部署）；本地生产构建 20/20。
- **Google Sites 里的实际 iframe 高度**（折叠之后）。
- **NB 重建行尾后的中间提交**没有重跑 `npm test`（与 CRLF 版本逐字节相同 modulo CR；提交 1 与 HEAD 跑过）。
- **简报允许的窄审查**（`query_solution` 数值正确性、URL 参数安全面）没有跑。

#### 其他

- **部署步骤**：`git push origin main && git push origin m-english-done n-features-done o-mcp-done` → Vercel 自动构建（`BASE_URL` 已设）→ `npm run smoke -- https://tools.studycase.net/mcp`（20/20、7 个工具、`?v=o-1`）→ Claude 里断开并重新连接连接器 → 总结里的验证清单第 9–13 步。
- **回滚**：`git checkout n-features-done`（ec8329a，widget l-1，要重连）；退掉 N、O 用 `m-english-done`（de1665b）；全退 `l-mcp-done`（1e825bc）。
- **测试数**：811 → 818（M）→ 882（N）→ 885（O）；README 的测试数在本 docs 提交里从 812 改为 885。
- **`reached_equilibrium` 的状态值在非自治场景里没变**（只改了措辞）：读 structuredContent 的消费者看到的仍是这个键，`timeDependent` 字段说明它是快照。
- **forms 块仍在三处渲染**（tools.ts 的 describeForms、widget、网页外壳的 FormsList），上一轮点名、本轮又各改了一次（折叠），未合并。
- **`components/Info.tsx` 的 doc 注释里有 "详情"**（注释非字符串），CJK 扫描有意放过。
- **worktree**：`git worktree list` 只剩 main，`wip/m1`、`wip/n2` 分支已不存在；`E:\project\vft-wt\` 目录本身是否还有残留未核实。
- 所有 `isError` 文本仍是英文（给模型看，有意）。

<!-- END SOURCE MNO-open-questions.md -->

---
