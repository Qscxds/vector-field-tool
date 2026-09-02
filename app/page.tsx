export default function HomePage() {
  return (
    <main style={{ maxWidth: 640, margin: "48px auto", padding: "0 24px", lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>vector-field-tool</h1>
      <p style={{ marginTop: 0, color: "#52606d" }}>
        Vector field teaching tool for differential equations. P0 skeleton.
      </p>
      <ul>
        <li>
          MCP endpoint: <code>/mcp</code> (Streamable HTTP, stateless, no auth)
        </li>
        <li>
          Widget page rendered inside Claude: <code>/widget</code>
        </li>
      </ul>
      <p>
        Add <code>&lt;this origin&gt;/mcp</code> as a custom connector in Claude and ask it to
        call the <code>ping</code> tool.
      </p>
    </main>
  );
}
