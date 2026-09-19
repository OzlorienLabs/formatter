# Formatter DevTools – 125 client-only tools

Next.js 14 + TypeScript + Tailwind. 100% client-side, Vercel-ready, light Clay/Ivory theme.

## Dev
```bash
npm ci
npm run dev   # http://localhost:3000
npm run typecheck && npm run test && npm run build
```

## Deploy (Vercel)
- Framework: Next.js, Build: `next build`, Output: `.next` (see `vercel.json`)
- No env vars required. No server. Static-first.

## CI
- `.github/workflows/ci.yml`: lint/typecheck/test/build
- `.github/workflows/e2e.yml`: Playwright smoke (home, json-formatter, base64, mobile 360px)

## Structure
- `src/lib/tools-registry.ts` – 125 tools source of truth
- `src/lib/tools-engine.ts` – pure client implementations
- `src/components/ToolShell.tsx` – per-tool contract (guide, copy/download/share hash, FAQ)
- `app/tools/[slug]` – 125 static routes
- Privacy: localStorage/IndexedDB only, share via `#i=lz-string` hash.

Inspired by FormatKit (https://formatkit.dev/#tools) and DevToolsDaily (https://www.devtoolsdaily.com/).
