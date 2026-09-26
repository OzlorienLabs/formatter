export const metadata = { title: "Privacy — Formatter", description: "There is no server to receive your input." };

const prose: React.CSSProperties = { fontSize: 17, lineHeight: 1.6, color: "var(--color-neutral-800)", maxWidth: "58ch" };

export default function Privacy() {
  return (
    <div style={{ padding: "clamp(20px,3vw,40px) clamp(18px,3vw,44px) 72px", maxWidth: 900, display: "grid", gap: "var(--space-4)" }}>
      <h1 style={{ margin: 0, fontSize: "clamp(30px,3.6vw,48px)", letterSpacing: "-.03em", lineHeight: 1.05 }}>Privacy</h1>
      <p style={prose}>
        All one hundred and twenty-five tools run in the page, with Web APIs and a little Wasm. Nothing is uploaded.
        Share links encode the payload into the URL fragment, which browsers never transmit. Wasm engines download
        once and then work offline.
      </p>
      <p style={{ ...prose, color: "var(--color-neutral-700)" }}>
        The modes that would need a backend — full Rust and Java compilation, PlantUML server rendering, live-URL SEO
        fetches, a CORS proxy — are deliberately out of scope. Those tools run in a paste-only lite mode and say so.
      </p>
      <p style={{ ...prose, color: "var(--color-neutral-700)" }}>
        The one thing that sends anything is the feedback form behind &ldquo;Ozlorien Labs&rdquo; in the footer. It
        delivers your note, and your email only if you give one, to Ozlorien Labs — and only when you press Send.
      </p>
    </div>
  );
}
