export default function Privacy() {
  return (
    <div className="card p-6 grid gap-2">
      <h1 className="text-xl font-bold">Privacy</h1>
      <p className="text-sm">All 125 tools run 100% client-side with Web APIs + lightweight JS/Wasm. No uploads. Share links use URL hash (lz-string) generated locally. Wasm engines download once then work offline.</p>
      <p className="text-sm text-[#87867F]">Backend-required modes (Rust/Java full compile, PlantUML server render, live-URL SEO fetch, CORS-bypass proxy) are intentionally out of scope – those tools run in degraded paste-only lite mode with a notice.</p>
    </div>
  );
}
