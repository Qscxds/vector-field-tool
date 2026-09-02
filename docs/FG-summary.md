# S/F/G 轮总结（2026-09-03）

- **做到哪了**：推 GitHub、S 探针、F（微分形式 + 类型识别 + 恰当方程隐式解）、G（双语文案表 + `locale` 参数 + 等比视口 + 缩放/平移/复位 + hover 预览 + widget 本地计算）全部完成，加一个 `[G-fix]`；tsc 0 错误、252 个测试全绿、build 通过；main 线性、每阶段有 tag；已推 origin。
- **待人工**：Claude 实机重连连接器（widget 版本 e-2 → g-1），在对话里验证 widget 的滚轮 / 拖动 / 悬停 / 点击；看 Claude 是否按规则传 `locale`。
- **有风险的地方**：G 阶段决定「平衡点列表跟随可见范围」「固定轨线按可见范围三倍积分」「hover 400 步预算」，都在 FG-open-questions 里列出等你拍板；英文文案无母语校对。

**S 结论（单独一行）**：沙箱里 `new Function` 被 CSP 挡住，但 mathjs `compile()` 不依赖 eval，编译 < 1 毫秒、RK4 2000 步 13.2 毫秒 —— 走「eval 可用」路线，widget 直接用 `lib/core`，不写解释器。

---

## 各阶段与 tag

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

## 验证输出（最终状态）

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

### 浏览器实测（网页外壳，本地 `next start`，Chromium）

- 页面按 `navigator.language` 以中文打开，右上角可切英文。
- 简谐振子：悬停出现经过光标的圆（预览），滚轮向上后「实际显示范围」从 x∈[−4.154, 4.154] 缩到 x∈[−2.21, 3.087]（光标侧不动），页面 `scrollY` 保持 0（滚轮没有滚动页面）；拖动后范围平移到 x∈[−0.444, 4.853]；双击后回到 x∈[−4.154, 4.154]，y∈[−3, 3]。
- 双击原来会多加两条轨线（第一版实测「清除轨线（2 条）」），加 220 毫秒单击延迟后为 0 条；单击一次为 1 条。
- 「圆族 x dx + y dy = 0」预设：无向线段 + 紫色等值线 + 奇点圆环，指针放在原点处 overlay 只画提示文字、不画曲线（脚本检查 overlay 像素）；离开原点后出现预览圆。类型列表：可分离、齐次、Bernoulli（n ≈ −1）、恰当，各带证据和 caveat。

### widget 模拟主机实测（`harness_e.py`，规范 CSP，不同源 iframe，工具 `analyze_first_order` M = 2xy, N = x²+y², locale zh）

```
probe: {"cspViolation":"script-src","blocked":"eval"}        <- zod 启动时的已知探测，无害
<- ui/initialize (app {"name":"vector-field-tool-widget","version":"0.3.0"})
<- initialized; sending tool-input then tool-result
probe: {"harness":"after-3s","canvas":true,"canvasSize":[640,435],"nonWhite":8978,
        "text":"vector-field-tool\nconnected to host\n\n实际显示范围（等比缩放后）：x∈[-2.943, 2.943]，y∈[-2, 2] · 悬停预览解曲线 · 点击固定 · 滚轮缩放 · 拖动平移 · 双击复位\n\n(2*x*y) dx + (x^2 + y^2) dy = 0\n\n..."}
<- size-changed {"width":680,"height":748}
```

「实际显示范围」这一行只在本地编译成功的交互路径上出现，说明 widget 在沙箱 CSP 下编译并重算成功。之后在 iframe 里滚轮、拖动、悬停：视图放大并平移、出现悬停预览曲线，host 收到 size-changed 更新。

## 明早检查清单

1. **重连连接器**：Claude → Connectors → Vector Field Tool → 断开 → 重新添加 `https://academic-airplane-silk-hanging.trycloudflare.com/mcp`（夜里旧隧道已断，我重新起了 cloudflared 得到这个新地址，本地 `next start` 已用它作 BASE_URL 重新构建并在 3000 端口运行，隧道 GET /mcp 返回 405、smoke 全过；cloudflared 若再重启地址还会变，那就改 BASE_URL 重建）。
2. 对话：「用 analyze_system 分析 x' = x - x*y, y' = x*y - y」→ widget 里滚轮、拖动、双击、悬停、点击各试一次；再用英文问一次同样的问题，看摘要是否英文（`locale` 默认 en）、用中文问看是否传了 `zh`（服务器日志里 tools/call 一行看不到参数，看摘要语言即可）。
3. 对话：「分析 2*x*y dx + (x^2 + y^2) dy = 0」→ 应出现紫色等值线、奇点 (0,0)、常数解 y = 0（稳定性随 x 变化）、四种形式各带 caveat。
4. 看 FG-open-questions 里 G 阶段的 8 条待拍板项。
5. 若 widget 交互在 Claude 里有问题而网页外壳没有：先看 iframe 控制台是否出现 `localComputeUnavailable` 文案（编译被挡）；回滚点 `g-render-done`（widget 回到静态 e-2，需再次重连连接器）。
