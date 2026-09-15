# S 段总结（2026-09-15）：更新说明 + 视图控件清理

**做到哪**：S.1–S.4 全部完成并在浏览器实测；tag `s-changelog-done`。widget 未动（`WIDGET_VERSION` 仍是 `p-2`）。
**你需要做的**：推送后照 `docs/PQR-summary.md` 第 6 节的清单验证；连接器要**删除后重新添加**（只断开重连不够）。

## 做了什么

| 项 | 做法 |
|---|---|
| S.1 `lib/changelog.ts` | 有类型的条目数组：`date`（ISO）、`title` / `points`（zh、en）、可选 `action`；`latestEntries(3)` 按日期倒序（同日按数组靠后者优先）。第一条 2026-09-15 按简报内容写入，中英两套；以后每轮只在数组末尾追加一条，不改渲染代码（写进 CLAUDE.md 的站点段落） |
| S.2 首页渲染 | 「更新说明 / What's new」区块放在「例子」之后、「它能做什么」之前；每条：ISO 日期（`<time>`，不用相对时间）+ 标题 + 要点列表；`action` 用琥珀色边框 + 底色的 `.site-action` 框，前缀「需要你做的： / Action required:」；跟随现有 locale |
| S.3 MCP 提示 | 同一句话（每种语言一个常量 `MCP_RECONNECT_*`，含端点地址）放在三处：首页 MCP 段落开头、`/help`「连接 Claude」一节开头（紧接标题）、更新说明的 action。三处都写明 widget 版本变了、必须删除连接器重新添加、只断开重连不够、否则静默不渲染 |
| S.4 视图控件 | 时间序列视图下隐藏（不是置灰）「网格密度」「箭头」；切回相平面恢复；值留在表单和链接里（实测：`d=12&arrows=scaled` 切换两次后仍在）。顺便核查：「同时画 x'(t)」「t 起/止」本来就只在时间序列下显示；「等比」按 Q 段决定保留为置灰 + 常驻说明（不隐藏，因为要解释为什么无效）；t₀ 两个视图都用（曲线从 t₀ 出发） |
| 措辞统一 | README、CLAUDE.md、`docs/PQR-summary.md`、`server.test.ts` 里的「断开并重新连接」全部改为「删除连接器再重新添加」 |

一处与简报原文的差别：术语那条写的是「常数解、平衡点与奇点」（英文 constant solution），不是简报里的 equilibrium solution——工具里一阶方程的术语是「常数解 y = c」（P2.3 决定），更新说明必须用工具自己的词。

## 验证

| 检查 | 结果 |
|---|---|
| `npx tsc --noEmit` | 0 错误 |
| `npm test` | 42 个文件，960 个测试 = 958 通过 + 2 既有预期失败（新增 `lib/changelog.test.ts` 4 个） |
| `npm run build` | 通过 |
| `npm run smoke`（生产构建） | 24/24，URI `?v=p-2`（未变） |
| GitHub Actions（首次真实运行） | 推送 `s-changelog-done` 后第一次运行**失败**：`lib/core/equilibria.test.ts` 的两个测试（J.2 SI 模型、J-fix2.1）在 2 vCPU 的 runner 上超过 vitest 默认 5 s 超时（本机 2–4 s）。修法：`vitest.config.mts` 全局 `testTimeout: 20_000`（内核未动；commit `00de271`）→ run 35028983127 **绿**。随后把 `actions/checkout` / `setup-node` 升到 v5（去掉 Node 20 弃用警告）→ run 35029208257 也**绿** |
| 线上 | `git push origin main --tags` 已由我执行（这次没有被拦）；Vercel 部署上线后 `npm run smoke -- https://tools.studycase.net/mcp` **24/24**，URI `?v=p-2`；线上首页已有 `data-news-entry="2026-09-15"` 的更新说明，`/help?loc=zh` 已有提示框 |

## 线上状态（2026-09-15 晚）

- origin/main = `s-changelog-done` 之后再加两个 CI 提交（`00de271` 超时、actions v5）；Vercel 已部署，线上 smoke 24/24。
- 你只剩一件事：在 Claude 里**删除连接器再重新添加** `https://tools.studycase.net/mcp`（widget `p-2`），然后按 `docs/PQR-summary.md` 第 6 节第 10–11 步验证 widget。
| 浏览器 · 首页 en / zh | 「What's new / 更新说明」一条：日期 `2026-09-15`、标题、6 个要点、琥珀色 action 框；MCP 段落开头的提示框在「这个工具也可以接到 Claude 上…」之前；标题顺序 Examples → What's new → What it can do → Its limits |
| 浏览器 · `/help` zh | `#claude` 标题的下一个元素就是提示框；控件一节含「报告问题」条目 |
| 浏览器 · 拍频预设 | 打开即时间序列：无「Grid density」「Arrows」，有「t from / t to」「Also draw x'(t)」；切「Phase plane」：两个控件出现，值 12 / Scaled，URL `d=12&arrows=scaled`；切回：再次隐藏，URL 仍含两个值 |
