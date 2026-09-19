# Formatter — design specification

A redesign of the Formatter web app (Next.js, `app/` + `src/`) in the **Broadsheet** design
system, matched to the FileKit overhaul. The prototype lives in `Formatter.dc.html`; the tool
registry it renders from lives in `formatter-tools.js`.

---

## 1. What changed and why

The app ships 125 client-only tools across 18 categories. The existing home page prints all 125
as one flat list with a `display:none` filter, which means the index is the only way in and the
only way back. The redesign replaces that with three overlapping ways to reach a tool —

1. **Command palette (⌘K)** — the primary path once you know the app. Fuzzy-scored across name,
   slug, description and category. Arrow keys, enter, escape.
2. **Persistent left rail** — favourites first, then recents, then all 18 categories with counts.
   Always visible above 1000px; off-canvas below.
3. **Index page** — searchable, category-chip filterable grid of cards. The path for browsing.

Plus two pieces of memory the app did not have: a **history drawer** (every run, restorable) and
**favourites** (starred, pinned to the rail).

---

## 2. Visual language

Inherited wholesale from the FileKit overhaul so the two read as one family.

| Element | Value |
| --- | --- |
| Ground | `#f3f2f2`, with a slow-drifting cyan/magenta/yellow radial wash and a 5px dot screen |
| Type | Source Serif 4 throughout — the serif *is* the chrome. IBM Plex Mono for code, 12–18px |
| Surfaces | Frosted glass: `.g` (primary, blur 22px), `.g2` (chrome, blur 30px), `.gi` (inset, blur 10px). Flat `#faf9f9` fallback via `@supports` and via the Settings toggle |
| Accent | Cyan `#0088b0` — every interactive element. Magenta `#d6006c` — errors, favourites, destructive |
| Radius | `--radius-*` from the token sheet (2px base, `lg` for panels) |
| Icons | Phosphor **duotone**, one per tool, named in the registry |

### Category plates

Eighteen categories are too many for eighteen hues. Instead each category is assigned one of the
four **process plates** — cyan, magenta, yellow (`#b98d00`, darkened for contrast), black — and
the plate colours the tool's icon, its card spine, its rail dot and its history entry. Four inks,
consistently applied, stay legible where eighteen would become noise.

| Plate | Categories |
| --- | --- |
| Cyan | JSON · Converters · SQL & Data · Diagrams · Time |
| Magenta | Encoding · XML · Security · Visual & Canvas · Image, Colour & SEO |
| Yellow | Validators · Regex & API · Generators & DevOps |
| Black | Binary & Numbers · Formatters & Text · Languages · ASCII · Platform |

---

## 3. Naming

Registry titles are literal and repetitive (`JSON Diff & Compare`, `Number Base Converter`,
`String Length Calculator`). Shortened where the shorter name is unambiguous *inside its
category*, since the category is always on screen:

| Was | Now |
| --- | --- |
| JSON Diff & Compare | JSON Diff |
| Number Base Converter | Base Converter |
| String Length Calculator | String Stats |
| Timestamp Converter | Epoch Converter |
| Regex Lab (Py/Go/Java) | Regex Flavours |
| Log & Privacy Workbench | Log Workbench |
| Secret Token Generator | Token Generator |
| Text to ASCII Art | FIGlet Banner |
| Comment ASCII Art | Banner Comments |
| Graphviz to Mermaid | DOT to Mermaid |
| CSV Query as SQL | Query CSV |
| DuckDB Playground / SQL Playground | DuckDB / SQLite |
| Python Playground (etc.) | Python, JavaScript, Go, Rust, Java |
| Base64 Encoder / Decoder | Base64 Encode / Decode |

Slugs are **unchanged** — URLs, share links and sitemap entries stay valid.

---

## 4. Screens

### Landing (`/`)
Serif hero, one oversized search field with a ⌘K affordance, a "popular right now" row, the
ledger panel (125 / 18 / 0 bytes / ∞), a "where you left off" strip when recents exist, the
eighteen-category index in columns with three sample tools each, and a privacy section that
states plainly that there is no server.

### Index (`/tools`)
Title, search field, a row of nineteen filter chips (Everything + 18 categories, each with a
count and its plate dot), then a responsive card grid at `minmax(288px, 1fr)`. Each card carries
the plate spine, the duotone icon, name, a `live`/`wasm`/`lite` badge, description, category
label and a star in the top-right corner.

### Category (`/categories/[category]`)
The index page with the chip pre-selected and the blurb swapped in. No separate template.

### Tool workspace (`/tools/[slug]`)
- **Header** — icon in the plate ink, name, star, badge, one-line description.
- **Options bar** — Run / Example / Clear, then tool-specific segmented options (indent, algorithm,
  flags, delimiter…), then Auto-run and Send-to-pipeline on the right.
- **Split pane** — input left, output right, `1fr 1fr`, stacking under 1180px. Input header shows
  live character/line counts and a paste button; output header shows Copy, Download, Share.
- **Second input** appears only for the tools that need it (diff, template merge, regex subject).
- **Errors** render as a magenta band at the top of the output pane, not as a replaced pane —
  the last good output stays visible.
- **Notes** (wasm download, lite mode) sit in a yellow band below the panes.

### History drawer
Right slide-over, 440px. Every run is recorded automatically: tool, timestamp, input snippet,
output snippet, options. Per-entry Restore (reopens the tool with the exact input and re-runs),
Copy output, Delete. Clear-all in the header. Capped at 60 entries, `localStorage`.

### Pipelines (`/pipelines`)
Source textarea, then an ordered list of steps — numbered chip, icon, name, reorder, remove — an
add-step select restricted to runnable tools, and a Run chain button. Output is a log of each
step's success or failure followed by the final payload.

### Settings drawer
Appearance (frosted surfaces, motion, editor text size 12–18px), Behaviour (run-as-you-type,
record history), Local data (counts + clear buttons).

---

## 5. Storage keys

| Key | Shape |
| --- | --- |
| `fmt:favs` | `string[]` of slugs, max 12 |
| `fmt:recents` | `string[]` of slugs, max 6 |
| `fmt:history` | `{id, slug, name, t, fin, fout, opt}[]`, max 60 |
| `fmt:settings` | `{glass, motion, autorun, keephist, mono}` |

The existing `devtools:recents` key is superseded by `fmt:recents`; migrate on first load.

---

## 6. Motion

| Moment | Animation |
| --- | --- |
| Section / card entrance | `fu` — 14px rise + fade, 500ms `cubic-bezier(.16,.84,.28,1)`, staggered 60ms |
| Drawer | `slidein` — 26px from the right, 300ms |
| Palette | `pop` — 10px drop + 1.5% scale, 220ms |
| Background wash | `drift` — 26s ease-in-out, infinite |
| Card hover | 2px lift + shadow step, 280ms |
| Control press | 1px translate, 100ms |

All of it is disabled by `prefers-reduced-motion` and by the Motion setting.

---

## 7. Responsive rules

| Breakpoint | Behaviour |
| --- | --- |
| > 1180px | Rail expanded (252px), split pane side by side |
| ≤ 1180px | Split pane stacks; landing two-column grids collapse |
| ≤ 1000px | Shell becomes a single block, rail goes off-canvas behind the hamburger, hero type drops to `clamp(40px,10vw,64px)` |
| ≤ 760px | Category and tool grids single-column; drawer takes the full viewport width |

The rail also collapses to a 62px icon strip on demand at any width via the sidebar toggle.

---

## 8. Accessibility

- 4.5:1 minimum on body text; the yellow plate is `#b98d00`, never the raw `#edbb00`.
- `:focus-visible` is a 2px cyan ring at 2px offset, never removed.
- Palette is keyboard-complete: ⌘K, arrows, enter, escape.
- Errors use `role="alert"` semantics in the implementation (the prototype uses the visual band).
- Every icon-only button carries a `title`; the implementation should add `aria-label` to match.
