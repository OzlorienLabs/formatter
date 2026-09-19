export default function Pipelines() {
  return (
    <div className="card p-6 grid gap-2">
      <h1 className="text-xl font-bold">Tool Pipelines</h1>
      <p className="text-sm text-[#87867F]">Chain tools in-memory, e.g. JSON Format → Minify → Base64 Encode. Stored in localStorage key devtools:pipelines. No server.</p>
      <ol className="list-decimal ml-5 text-sm space-y-1">
        <li>Run any tool, click Share to encode input in URL hash.</li>
        <li>Copy output, open next tool, paste as input.</li>
        <li>Use Related tools + Send to Pipeline selector on each tool page.</li>
      </ol>
    </div>
  );
}
