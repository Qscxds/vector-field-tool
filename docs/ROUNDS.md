# 轮次对照表

交付物按轮次编号：`docs/round-NN-summary.md`（总结）、`round-NN-decisions.md`（决定记录）、`round-NN-open-questions.md`（遗留问题）；第 1 轮只有一份交接文档。编号从 2026-09-28（第 11 轮）起统一改名，此前每轮用字母代号；**git tag 和提交前缀仍用代号**（历史不能改写），下表是两者的对照。以后每轮顺延：第 12 轮的交付物是 `round-12-*.md`。

| 轮次 | 原代号 | 日期 | 收尾 tag | 交付物 | 这一轮做了什么 |
|---|---|---|---|---|---|
| 1 | P0 | 2026-09-02 | `p0-verified` | [round-01-handoff.md](round-01-handoff.md) | 骨架：Next.js + MCP 端点 + `ping` 工具 + widget 在 Claude 里渲染出来；技术栈选型验证 |
| 2 | NIGHT（A–E 段） | 2026-09-02 | `night-final` | [summary](round-02-summary.md) · [decisions](round-02-decisions.md) · [open-questions](round-02-open-questions.md) | 夜跑：纯计算内核（解析、采样、积分、平衡点、分类）、六个工具、渲染、网页壳、widget |
| 3 | S/F/G | 2026-09-02/03 | `g-widget-done` | [summary](round-03-summary.md) · [decisions](round-03-decisions.md) · [open-questions](round-03-open-questions.md) | 推 GitHub、沙箱探针、微分形式 + 类型识别 + 恰当方程隐式解、双语文案、等比视口、缩放平移、悬停预览、widget 本地计算 |
| 4 | H | 2026-09-02/03 | `h2-reviewed` | [summary](round-04-summary.md) · [decisions](round-04-decisions.md) · [open-questions](round-04-open-questions.md) | 上线准备（Vercel、成本上限）、按数学优先重新拍板十条、对抗式审查 14 条修复 |
| 5 | I–L | 2026-09-08/09 | `l-mcp-done` | [summary](round-05-summary.md) · [decisions](round-05-decisions.md) · [open-questions](round-05-open-questions.md) | 记号改为 dy/dt、等比开关；平衡点 / 唯一性 / 非自治 / 二阶的数学（三轮审查修复）；网站：URL 状态、/embed、/help、预设、触屏、PNG、元数据；工具描述的 call-first 规则；widget l-1 |
| 6 | M–O | 2026-09-09 | `o-mcp-done` | [summary](round-06-summary.md) · [decisions](round-06-decisions.md) · [open-questions](round-06-open-questions.md) | 英文默认、文案精简与折叠、/help 重排、内核冻结；轨线删除 / 撤销 / 长按、初值输入、解的查询与 `query_solution`；widget o-1 |
| 7 | PQR | 2026-09-15 | `r-ops-done` | [summary](round-07-summary.md) · [decisions](round-07-decisions.md) · [open-questions](round-07-open-questions.md) | 教授第一次反馈：二阶记号 (t, x, x')、同类漏洞普查；时间序列视图；运维（上限、CI、报告问题） |
| 8 | S | 2026-09-15 | `s-changelog-done` | [summary](round-08-summary.md) | 首页更新说明（changelog）、MCP 重新添加提示、视图控件清理 |
| 9 | T–W | 2026-09-18 | `w-lecture-done` | [summary](round-09-summary.md) · [decisions](round-09-decisions.md) · [open-questions](round-09-open-questions.md) | 符号参数与链接、参数滑块与实时重算、零斜线 / 特征方向 / 分界线、讲课模式；widget t-1 |
| 10 | Y | 2026-09-18 | `y-polish-done` | [summary](round-10-summary.md) | T–W 遗留小修：siny 护栏、ln、讲课模式保留位置、拍频纵轴、50 ms 预算；widget y-1 |
| 11 | Z | 2026-09-28 | 见 round-11-summary | [summary](round-11-summary.md) · [decisions](round-11-decisions.md) · [open-questions](round-11-open-questions.md) | 四个「写成系统」的预设改名并写明 y = x'（孪生互链）；新增「两张一起」视图并联动，视图切换移到图的正上方；widget 新增解的图像（z-1）；交付物按轮次改名 |

另有 [ENGINEERING-RECORD.md](ENGINEERING-RECORD.md)（2026-09-10 的集中工程记录，不属于任何一轮；它收录了第 1–6 轮 16 份记录的全文，改名说明见其「历史记录索引」一节）。
