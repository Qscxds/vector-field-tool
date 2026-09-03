import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ maxWidth: 680, margin: "48px auto", padding: "0 24px", lineHeight: 1.6, fontSize: 15 }}>
      <h1 style={{ fontSize: 26, marginBottom: 6 }}>vector-field-tool</h1>
      <p style={{ marginTop: 0, color: "#52606d" }}>
        微分方程课的向量场 / 相图教学工具 · Vector fields and phase portraits for a differential-equations course.
      </p>

      <p style={{ fontSize: 17 }}>
        <Link href="/vector-field" style={{ fontWeight: 600 }}>
          打开交互页面 / Open the interactive page →
        </Link>
      </p>
      <p style={{ color: "#52606d" }}>
        输入 x&apos; = f(x, y)、y&apos; = g(x, y) 或一阶方程 dy/dx = g(x, y) / M dx + N dy = 0，看方向场、平衡点、解曲线；滚轮缩放、拖动平移、悬停预览、点击固定。
        Enter a planar system or a first-order equation and explore its direction field, equilibria and solution curves.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 28 }}>For AI clients (MCP)</h2>
      <p style={{ color: "#52606d", marginTop: 4 }}>
        The same kernel is exposed as MCP tools so Claude can answer questions with computed results instead of guesses. Add{" "}
        <code>&lt;this origin&gt;/mcp</code> as a custom connector (Streamable HTTP, stateless, no auth) and ask it to analyse a
        system; results render as an interactive widget.
      </p>
      <ul style={{ color: "#52606d" }}>
        <li>
          Tools: <code>analyze_system</code>, <code>trace_trajectory</code>, <code>sample_field</code>, <code>analyze_first_order</code>,{" "}
          <code>ping</code>
        </li>
        <li>
          Widget page (rendered inside the host): <code>/widget</code>
        </li>
      </ul>
      <p style={{ color: "#52606d", fontSize: 13 }}>
        Source and documentation: <a href="https://github.com/Qscxds/vector-field-tool">github.com/Qscxds/vector-field-tool</a>
      </p>
    </main>
  );
}
