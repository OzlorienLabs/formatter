// Copies the self-hosted runtimes from node_modules into public/vendor so the
// app never fetches code from a CDN. Runs before dev and build.
import { cpSync, mkdirSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

const root = join(dirname(new URL(import.meta.url).pathname), "..");
const nm = (p) => join(root, "node_modules", p);
const out = (p) => join(root, "public", "vendor", p);

const FILES = [
  ["jq-wasm/dist/build/jq.wasm", "jq/jq.wasm"],
  ["sql.js/dist/sql-wasm-browser.js", "sqljs/sql-wasm.js"],
  ["sql.js/dist/sql-wasm-browser.wasm", "sqljs/sql-wasm-browser.wasm"],
  ["pyodide/pyodide.mjs", "pyodide/pyodide.mjs"],
  ["pyodide/pyodide.asm.mjs", "pyodide/pyodide.asm.mjs"],
  ["pyodide/pyodide.asm.wasm", "pyodide/pyodide.asm.wasm"],
  ["pyodide/python_stdlib.zip", "pyodide/python_stdlib.zip"],
  ["pyodide/pyodide-lock.json", "pyodide/pyodide-lock.json"],
  ["openscad-wasm-prebuilt/dist/openscad.js", "openscad/openscad.js"],
  ["three/build/three.module.js", "three/three.module.js"],
  ["three/build/three.core.js", "three/three.core.js"],
  ["three/examples/jsm/controls/OrbitControls.js", "three/addons/controls/OrbitControls.js"],
  ["three/examples/jsm/loaders/STLLoader.js", "three/addons/loaders/STLLoader.js"],
];

let copied = 0;
for (const [from, to] of FILES) {
  const src = nm(from);
  const dst = out(to);
  if (!existsSync(src)) {
    console.warn(`vendor: missing ${from}`);
    continue;
  }
  if (existsSync(dst) && statSync(dst).size === statSync(src).size && statSync(dst).mtimeMs >= statSync(src).mtimeMs) continue;
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(src, dst);
  copied++;
}
console.log(`vendor: ${copied} file(s) copied to public/vendor`);
