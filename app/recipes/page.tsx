import Link from "next/link";
const RECIPES = [
  { name: "JSON ship-ready", steps: ["json-formatter", "json-validator", "json-minifier"] },
  { name: "CSV to SQL", steps: ["csv-validator", "csv-to-json", "json-to-sql"] },
  { name: "Log cleanup", steps: ["log-privacy-workbench", "file-diff-viewer"] },
  { name: "Share payload", steps: ["json-minifier", "json-to-base64"] },
];
export default function Recipes() {
  return (
    <div className="grid gap-3">
      <h1 className="text-xl font-bold">Developer Recipes</h1>
      {RECIPES.map((r) => (
        <div key={r.name} className="card p-4">
          <p className="font-medium">{r.name}</p>
          <div className="flex gap-2 mt-2 flex-wrap">{r.steps.map((s) => <Link key={s} href={`/tools/${s}`} className="chip px-3 py-1 text-sm">{s}</Link>)}</div>
        </div>
      ))}
    </div>
  );
}
