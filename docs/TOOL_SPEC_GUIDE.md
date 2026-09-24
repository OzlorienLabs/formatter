# Writing a tool

Every tool is a `ToolSpec` (see `src/tools/types.ts`) exported from its category module in
`src/tools/<category>.ts`. The generic `ToolShell` renders the UI from the spec, so a tool gets
examples, options, history, workspaces, share links and pipeline support without extra code.

`src/tools/json.ts` is the reference implementation — read it first.

## Rules

1. **No network.** A tool may never `fetch` a remote URL on its own. Self-hosted runtimes load from
   `/vendor/...` through `src/tools/lib/vendor.ts` (`vendorBytes`, `loadScript`), which reads from
   `node_modules` in unit tests. The only exceptions are tools whose purpose is to call a URL the user
   typed (API Workbench, GraphQL remote mode) — and they default to the built-in offline mock API.
2. **Lazy heavy libraries.** Import anything larger than a few KB inside `run` with `await import(...)`.
   A category module is loaded for every tool in it, so keep top-level imports small.
3. **Examples teach.** At least 4 examples per tool (3 minimum, enforced by the test), each with a
   `label` and usually a `note` explaining what it demonstrates. Cover the common case, a realistic
   case, an edge case, and — where useful — an error case flagged `error: true`.
4. **Options are real.** Every option must change the output. Prefer `segment` for ≤5 short choices,
   `select` for longer lists, `toggle` for booleans, `number` with min/max.
5. **Errors are readable.** Throw `ToolError` with a message a user can act on (line/column when you
   have it). The shell shows it above the last good output.
6. **`text` is the pipeline payload.** `Result.text` is what Copy, Download and the next pipeline step
   receive. Make it the most useful plain-text form of the result; put richer renderings in `views`.
7. **Pipelines.** A tool is a pipeline step when its first input is a code/text field (automatic), or
   when it is a `generator` with no inputs. Secondary inputs (keys, filters, templates) are stored per
   step. Set `pipe: false` if chaining makes no sense.
8. **Heavy runtimes** (`autorun: false`): Python, SQLite, OpenSCAD, big images — the user presses Run.

## Output views

`views: [{ label, out }]` — tabs, the first shown by default. Kinds:

| kind | use for |
| --- | --- |
| `text` (`lang`, `wrap`) | code / text, highlighted |
| `tree` (`value`) | any JSON value, collapsible, searchable, copy paths |
| `xmltree` (`xml`) | XML element tree |
| `table` (`columns`, `rows`) | tabular data, sortable, filterable, paged |
| `stats` (`items`) | metric tiles, `tone`: ok/warn/bad/info |
| `status` (`ok`, `title`, `detail`) | pass/fail verdicts |
| `issues` (`items` with level/message/line/col) | lint results |
| `svg` (`svg`, `name`) | diagrams — zoom, SVG and PNG download built in (sanitised) |
| `image` (`src` data/blob URL, `name`) | raster output with download |
| `html` (`html`, `css`) | rich previews — sanitised with DOMPurify on render |
| `frame` (`srcdoc`, `height`) | sandboxed iframe (`allow-scripts`, opaque origin) for running user code |
| `pdf` (`src`) | PDF preview |
| `diff` (`hunks`, `mode`) | use `lineDiff` from `src/tools/lib/diff.ts` |
| `react` (`node`) | anything else, rendered from `run` (client only) |

`Result.blob` + `filename` makes Download save binary output (images, databases, archives).

## Custom UIs

When a split input/output pane is the wrong shape (timers, drawing canvases, colour pickers, request
builders), set `custom: () => import("./ui/MyTool")`. The component receives `CustomProps`: the shell
still owns `inputs`/`opts` state (so history, workspaces and share links keep working) and still
renders the header, examples and options bar. Keep state that should persist in `inputs` (strings)
and `opts`. Call `record(text)` after a meaningful user action to add a history entry.

Use the shared classes from `app/globals.css`: `.g` / `.g2` surfaces, `.pane`, `.pane-head`, `.btn`,
`.btn-primary`, `.btn-sm`, `.btn-icon`, `.inp`, `.sel`, `.seg`, `.chip`, `.lbl`, `.tabs`,
`.grid-form`, `.mono`, `.scroll`, `.checker`. Reuse `CodeEditor` (`src/components/tool/CodeEditor`)
and `OutputView` (`src/components/tool/OutputView`) inside custom UIs rather than re-implementing them.

## Testing

```bash
TOOLS_ONLY=<category-slug or tool-slug,...> npx vitest run src/tools/specs.test.ts
PRINT=400 TOOLS_ONLY=... npx vitest run src/tools/specs.test.ts   # also print each example's output
```

The harness runs every example in jsdom and fails if one throws (unless flagged `error`). Tools that
need a real browser (canvas, WebGL, workers, EyeDropper) may set `skipNodeTest: true` on the spec — they are covered by the Playwright suite instead.
