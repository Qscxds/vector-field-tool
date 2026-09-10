# M–O 轮待决事项（2026-09-09）

需要你拍板的事、被标记的失败测试、性能、未验证的、其他。没有的项写「无」。

## 需要你拍板

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

## 被标记的失败测试

`grep -rn "it.fails" lib app --include=*.test.ts` 命中 2 行，`npm test` 报 "2 expected fail"（N.3 (a) 删掉了 `lib/core/slope-field.test.ts` 那条，3 → 2）：

1. **`lib/interactive.test.ts:457`** —— "planar: the same curve is flagged from the box x in [1, 3] (depends on findEquilibria locating a cusp equilibrium)"：x' = sqrt|x|, y' = −y 从 (2, 0) 出发、输入盒子 x ∈ [1, 3]，曲线探测在速度极小点周围的方盒里含原点，但 `findEquilibria` 在那里返回 none_found（测试注释：只有盒子 [−0.5, 0.5]² 上一个种子恰好落在 x = 0；其他盒子里 Newton / LM 在尖点振荡，sqrt|x| 的 Newton 步是镜像）。上一轮 J-fix2 的 JA 说尖点根在 [−0.05, 0.05]² 到 [−3, 3]² 上都找到了，但该测试仍失败；**本轮内核冻结，没有重新检查它为什么还失败**。
2. **`app/mcp/tools.test.ts:578`** —— "x'' = −x + x'/x': no equilibrium is reported at (1, 0), where the equation is undefined (review J-C.4, kernel open question)"：降阶得 x' = y, y' = −x + y/y，在 y = 0 整条线上无定义、其余处等于 (y, 1 − x)，定义域内没有零点；`findEquilibria` 接受极限点 (1, ~1e-26)（y/y 对每个非零 y 都是 1）并分类。修法需要 `findEquilibria` 拒绝「收敛点本身场为 NaN」的候选——新机制，冻结之下不动。

## 性能

- **x' = xy, y' = x² − y（[−3, 3]²）：~1.1 s 每次**（修复前 1.0–1.35 s），细分格子 254、场求值约 1.48 M 次；原因与建议见「拍板」。守卫测试仍带 30 s 超时。
- 查询面板有 App 注入的 2 s 墙钟预算（超时显示 `ui.queryTooLong`）；NC 的简谐振子 y = 0 查询给 31 个命中，**没有报告耗时**；工具 `query_solution` 走 `app/mcp/budget.ts` 的 2 s 预算，模拟主机的 6 命中场景没有计时。
- 每个命中的 Brent 最多 60 次重新积分（从括号左端状态起，短区间），没有单独测量。
- 悬停高亮每帧算一次屏幕坐标命中（点到所有固定轨线线段的距离），没有测量；固定轨线多时（20 条 × 2 方向 × 点数）是否掉帧未检查。
- 没有在低端机或真机上测过。

## 未验证的

- **悬停高亮 / 光标 pointer / 触屏提示**：只在 O 的模拟主机里看到过（widget，橙色高亮）；网页外壳的 N 验收时面板隐藏、rAF 不触发，没看到。命中逻辑有单元测试，覆盖层描边本身像其他画布绘制一样没有测试。
- **真实触屏**：长按固定轨线删除、长按空白固定、"Hold to remove" 提示——只测了纯手势状态机 → clickAction 的流程和 375 px 布局；widget 的触屏手势和等比开关本轮没有重跑（假定 L 的覆盖仍有效，共享代码未动）。
- **Claude 实机**：o-1 widget（重连后）、`query_solution` 是否被先调用、「dy/dt = y, y(0) = 1, y(2) = ?」与「y 什么时候到 2」、恰当方程问题的 caveat 全文是否传到了模型、widget 里的删除 / 撤销 / 查询标记。
- **widget iframe 内的 Ctrl+Z**：只在 iframe 有焦点时生效，模拟主机里没按（按钮路径验了）。网页外壳的 Ctrl+Z 编排者验过。
- **OG 图与社交卡片**：英文在前的 OG 图和 og:locale en_US 是构建时画的，没有人看过渲染结果（同上一轮的字体问题：Vercel 构建若无网络中文行可能成方块）。
- **线上 smoke**：`npm run smoke -- https://tools.studycase.net/mcp` 未跑（未推送、未部署）；本地生产构建 20/20。
- **Google Sites 里的实际 iframe 高度**（折叠之后）。
- **NB 重建行尾后的中间提交**没有重跑 `npm test`（与 CRLF 版本逐字节相同 modulo CR；提交 1 与 HEAD 跑过）。
- **简报允许的窄审查**（`query_solution` 数值正确性、URL 参数安全面）没有跑。

## 其他

- **部署步骤**：`git push origin main && git push origin m-english-done n-features-done o-mcp-done` → Vercel 自动构建（`BASE_URL` 已设）→ `npm run smoke -- https://tools.studycase.net/mcp`（20/20、7 个工具、`?v=o-1`）→ Claude 里断开并重新连接连接器 → 总结里的验证清单第 9–13 步。
- **回滚**：`git checkout n-features-done`（ec8329a，widget l-1，要重连）；退掉 N、O 用 `m-english-done`（de1665b）；全退 `l-mcp-done`（1e825bc）。
- **测试数**：811 → 818（M）→ 882（N）→ 885（O）；README 的测试数在本 docs 提交里从 812 改为 885。
- **`reached_equilibrium` 的状态值在非自治场景里没变**（只改了措辞）：读 structuredContent 的消费者看到的仍是这个键，`timeDependent` 字段说明它是快照。
- **forms 块仍在三处渲染**（tools.ts 的 describeForms、widget、网页外壳的 FormsList），上一轮点名、本轮又各改了一次（折叠），未合并。
- **`components/Info.tsx` 的 doc 注释里有 "详情"**（注释非字符串），CJK 扫描有意放过。
- **worktree**：`git worktree list` 只剩 main，`wip/m1`、`wip/n2` 分支已不存在；`E:\project\vft-wt\` 目录本身是否还有残留未核实。
- 所有 `isError` 文本仍是英文（给模型看，有意）。
