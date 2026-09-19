# Claude Code prompt — Formatter redesign

The folder contains:

| File | What it is |
| --- | --- |
| `README.md` | The design specification — screens, tokens, motion, responsive rules |
| `design-tokens.css` | Drop-in CSS: token `:root`, glass utilities, motion, base resets |
| `tools-registry-data.js` | The 125 tools with their new names, Phosphor icons and category plates |
| `Formatter-prototype.html` | The clickable prototype. Open it in a browser — it *is* the spec |

---

You are implementing a full visual and structural redesign of this Next.js app.

**Before writing any code**, read `docs/design/README.md` end to end, then open
`docs/design/Formatter-prototype.html` in a browser and click through it: the
landing page, the workbench (button top-right), the ⌘K palette, a tool, the history drawer, the
settings drawer, the pipelines page. The prototype is the source of truth for layout, spacing,
copy tone and interaction. Where this prompt and the prototype disagree, follow the prototype.

Work through the phases in order. After each phase run `npm run lint` and `npx vitest run`;
after Phase 7 also run `npx playwright test`. Commit at the end of each phase with a message
naming the phase.

---

## Phase 1 — Foundations

1. Copy the contents of `docs/design/design-tokens.css` into `app/globals.css`,
   above the Tailwind layers. Delete the old palette (`#D97757`, `#F0EEE6`, `#87867F` and
   friends) everywhere it is hard-coded.
2. Point `tailwind.config.ts` at the CSS variables so `bg-bg`, `text-ink`, `text-accent`,
   `bg-surface` and the `neutral-*` / `accent-*` ramps resolve to the tokens. No literal hexes
   in the config.
3. Load the fonts with `next/font/google` in `app/layout.tsx` — **Source Serif 4** (400, 600,
   400 italic) as the body and heading face, **IBM Plex Mono** (400, 500) for code — and expose
   them as `--font-body` / `--font-heading` / `--font-mono`. Self-hosted, so offline still works.
4. `npm i @phosphor-icons/react`. Standardise on the **duotone** weight; build one
   `<ToolIcon slug size />` component that resolves a Phosphor name from the registry so no page
   imports icons individually.
5. The page wash (`.wash-ground`, `.wash-glow`, `.wash-dots`) mounts once in the root layout,
   `aria-hidden`, behind a `z-index: 1` content layer.

**Done when:** any existing page renders in serif on the paper ground with no orange left.

## Phase 2 — Registry

1. Extend `ToolMeta` in `src/lib/tools-registry.ts` with `icon: string` (Phosphor name, no
   weight suffix) and add `plate: 'c' | 'm' | 'y' | 'k'` to the category record.
2. Apply the renames, icons and plates from `docs/design/tools-registry-data.js`.
   That file is plain data keyed by slug — write a one-off script to merge it in rather than
   retyping 125 rows.
   **Do not change any slug.** URLs, share hashes, `app/sitemap.ts` and existing bookmarks
   depend on them.
3. Export from the registry:
   - `searchTools(query): ToolMeta[]` — lowercase, split on whitespace, **every** word must
     appear in `name + slug + description + categoryTitle`; score each word 6 for a name prefix
     match, 4 for a name substring, 2 for a slug substring, 1 otherwise; sort by total score
     descending.
   - `plateInk(plate)` and `plateTint(plate)` returning the CSS variable names.
4. Unit-test `searchTools`: `"json"` puts `json-formatter` first; `"base 64"` matches the Base64
   tools; `"zzz"` returns `[]`.

## Phase 3 — Storage and app state

Create `src/lib/store.ts`. Everything is `localStorage`, everything is SSR-safe — read inside
`useEffect`, never during render, and never throw when storage is unavailable.

| Hook | Returns | Rules |
| --- | --- | --- |
| `useFavourites()` | `{favs, toggle, clear}` | max 12 slugs |
| `useRecents()` | `{recents, touch}` | max 6, most recent first; migrate any existing `devtools:recents` on first load, then delete that key |
| `useHistory()` | `{history, record, remove, clear}` | max 60; skip a record whose slug and input match the newest entry |
| `useSettings()` | `{glass, motion, autorun, keephist, mono, set}` | defaults `true/true/true/true/13` |

Keys: `fmt:favs`, `fmt:recents`, `fmt:history`, `fmt:settings`.
A history entry is `{id, slug, name, t, fin, fout, opt}`.

Wrap these in one `AppStateProvider` context so the rail, top bar, palette and drawers share a
single instance — do not call the hooks independently in several components.

## Phase 4 — Shell

1. `app/layout.tsx` becomes the workbench shell: a CSS grid, `252px minmax(0,1fr)`. The rail is
   `grid-column: 1`, the main column is explicitly `grid-column: 2` (this matters — under
   1000px the rail leaves the flow and without the explicit column the main content collapses to
   zero width). Apply `flat` and `calm` on the root element from settings.
2. `src/components/Rail.tsx` — favourites, then recents, then all 18 categories with counts and
   plate dots, then Pipelines and Settings pinned to the foot. Collapses to a 62px icon strip via
   the sidebar toggle; off-canvas behind the hamburger under 1000px.
3. `src/components/TopBar.tsx` — hamburger, breadcrumb (All tools / Category / Tool name), the
   ⌘K affordance, and a history button showing the live entry count.
4. `src/components/CommandPalette.tsx` — a portal dialog opened by ⌘K / Ctrl-K from anywhere.
   Fuzzy results from `searchTools`, arrow keys to move, enter to open, escape to close, hover to
   select, a keyboard-hint footer, and `n of 125` in the corner. Trap focus while open and
   restore it to the trigger on close.
5. `src/components/Drawer.tsx` — the shared 440px right slide-over with a scrim, used by both
   History and Settings. Full viewport width under 760px.

## Phase 5 — Screens

1. **`app/page.tsx` — landing.** Hero (`Paste it in. / Read it out.`), the oversized search field
   with the ⌘K key cap, a popular-tools row, the ledger panel (125 / 18 / 0 bytes / ∞), a "where
   you left off" strip that only appears when recents exist, the eighteen-category index in
   columns with three sample tools each, and the privacy section. Copy verbatim from the
   prototype.
2. **`app/tools/page.tsx` — new index route.** Search field, nineteen filter chips (Everything +
   18 categories, each with a count and plate dot), then the card grid at
   `repeat(auto-fill, minmax(288px, 1fr))`. Each card: 3px plate spine down the left edge, duotone
   icon in the plate ink, name, a `live` / `wasm` / `lite` badge, description, category label, and
   a star button top-right that stops propagation.
3. **`app/categories/[category]/page.tsx`** — render the same index component with the chip
   preselected and the category blurb as the subtitle. No second template.
4. **`src/components/ToolShell.tsx` — rewrite.** Header (icon, name, star, badge, description),
   options bar (Run / Example / Clear, tool-specific segmented options, Auto-run checkbox,
   Send to pipeline), then the split pane at `1fr 1fr` stacking under 1180px. Input pane header
   shows live character and line counts plus a paste button; output pane header shows Copy,
   Download and Share. Errors are a magenta band **at the top of the output pane**, not a
   replacement for it. wasm and lite notes are a yellow band below the panes. Move the existing
   guide steps and FAQ into a collapsible section beneath, not two cards.
   Keep `dispatch()` in `src/lib/tools-engine.ts` exactly as it is — only the presentation changes.
5. **`app/pipelines/page.tsx`** — source textarea, the ordered step list (numbered chip in the
   plate tint, icon, name, move-up, remove), an add-step `<select>` limited to slugs `dispatch`
   can actually run, a Run chain button, and a result panel that logs `✓` / `✗` per step then the
   final payload after a rule of dashes.

## Phase 6 — Behaviour

- Auto-run debounced at 240ms, gated on the `autorun` setting; the Run button always works.
- Record every successful run into history with the full input, the output and the active option.
- Restore from history: navigate to the tool, set the input, re-run, close the drawer.
- Send to pipeline: append the current tool to the chain and seed the source with the current
  input if the source is empty.
- Share: write the payload into `location.hash`, copy the URL, toast. Nothing is transmitted.
- Toasts are a single centred pill at the bottom, 1.8s, replacing any previous one.

## Phase 7 — Tests

Extend `e2e/smoke.spec.ts`:

- ⌘K opens the palette, typing `jwt` and pressing enter lands on `/tools/jwt-decoder`.
- Starring a tool puts it in the rail and it survives a reload.
- Running a tool then opening the history drawer and clicking Restore returns the same input.
- Clicking the `Encoding` chip on `/tools` narrows the grid to ten cards.
- The rail is off-canvas at 900px wide and the split pane is stacked at 1100px.

Unit-test the `searchTools` scoring, the history cap at 60, and the consecutive-duplicate skip.

## Constraints

- Everything stays client-side. No new network calls, no analytics, no runtime font fetches.
- No sans-serif anywhere — the serif is the chrome.
- No rules, borders or boxes as section dividers; whitespace does that work. `.card` is only for
  genuinely discrete items such as tool cards.
- Never both accents in one small component.
- Body text holds 4.5:1 against the ground. The yellow plate is `#b98d00`, never raw `#edbb00`.
- `:focus-visible` is a 2px cyan ring at 2px offset. Never remove it.
- Spacing comes from `--space-1/2/3/4/6/8`. **There is no `--space-5` or `--space-7`** — a
  reference to one silently voids the whole declaration.
