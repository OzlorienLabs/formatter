# Formatter — developer tools that never leave the tab

## Web App [Formatter](https://formatter.ozlorienlabs.com/)

125 developer tools (JSON, encoding, converters, validators, XML, formatters, SQL & data, security,
regex & API, languages, canvas, diagrams, generators, image & colour, ASCII, time) plus Pipelines,
Workspaces and Recipes. Everything runs in the browser and keeps working offline: no accounts, no
uploads, no calls to any server but this site.

Release 1.0.2

## Develop

```bash
npm ci
npm run dev            # http://localhost:3000 (copies wasm runtimes to public/vendor first)
npm run typecheck
npm test               # unit tests: runs every example of every tool, every recipe
npm run build
npm run test:e2e       # Playwright: every tool and example in Chromium, plus platform flows
```

## How it fits together

| Path | What |
| --- | --- |
| `src/lib/tools-registry.ts` | Metadata for all tools: slug, title, category, icon, description |
| `src/tools/<category>.ts` | Each category's `ToolSpec`s: inputs, options, `run`, examples — loaded lazily per category |
| `src/tools/ui/*` | Custom UIs for interactive tools (timers, whiteboard, request builder…) |
| `src/tools/lib/*` | Shared helpers: JSON parser with positions, diff, Mermaid renderer, mock API, vendor loader |
| `src/components/ToolShell.tsx` | Renders any spec: examples, options, editors, output views, history, save, share |
| `src/components/platform/*` | Pipelines, Workspaces, Recipes |
| `src/lib/pipeline.ts` | Pipeline engine — each step's text output feeds the next step's primary input |
| `public/sw.js` | Service worker: offline cache and the `/mock-api/*` bridge |
| `scripts/vendor.mjs` | Copies self-hosted runtimes (jq, SQLite, Pyodide, OpenSCAD, three.js) into `public/vendor` |

Adding or changing a tool: read [`docs/TOOL_SPEC_GUIDE.md`](docs/TOOL_SPEC_GUIDE.md).

## Privacy and offline

- All processing is client-side. Heavy runtimes are self-hosted and loaded on demand; nothing is
  fetched from a CDN.
- History, favourites, workspaces, saved pipelines and mock API routes live in `localStorage`
  (`fmt:*` keys). Each can be deleted individually or all at once from Settings.
- Share links carry the data in the URL fragment (`#s=…`, `#p=…`), which browsers never send to a server.
- The service worker caches pages and tool code as you browse; Settings → Offline can cache
  everything (including the ~30 MB of WebAssembly runtimes) ahead of time.
- The only network requests a tool makes are ones you explicitly ask for: sending a request to a URL
  you typed in API Workbench, or a remote endpoint in GraphQL. Both default to the built-in offline
  mock API.

## Deploy

Vercel: build command `npm run build` (see `vercel.json`), no environment variables.
