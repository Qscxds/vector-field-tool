# F/G 轮决策记录（2026-09-03）

所有偏离《推 GitHub + F/G 两阶段》文档的决定和理由。按时间顺序追加。

## 前置：推 GitHub

- 仓库 <https://github.com/Qscxds/vector-field-tool>，public。推之前自检：工作区干净；`git grep` 扫描 token / 密钥 / 隧道地址，只找到文档里的占位符 `xxxx.trycloudflare.com` 和测试里的 `example.trycloudflare.com`，没有真实地址；`.gitignore` 覆盖 `node_modules`、`.next`、`lib/**/__probe__/`、`__probe*`。推完核对：远端 44 个提交、7 个 tag，与本地一致。
- 用户留言时我已经推完（gh 在会话开始前就是已认证状态），没有中断 S 阶段。

## S 阶段：沙箱里能不能本地算

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
