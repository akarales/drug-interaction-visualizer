# Architecture

## Workspace layout

```
drug-interaction-visualizer/
├── Cargo.toml                 # workspace: engine + api
├── crates/
│   ├── engine/                # interaction-graph
│   │   ├── src/graph.rs        # types: Drug, Interaction, InteractionGraph
│   │   ├── src/queries.rs      # neighbours, chains, hubs, ego/top-N exports
│   │   ├── src/dataset.rs      # ETL: Kaggle CSV → dataset JSON
│   │   ├── src/severity/       # editorial severity: kind_table.rs + onc.rs (ONC high-priority pairs)
│   │   ├── src/roles.rs        # FDA precipitant → object direction (compiled-in data/fda_roles.csv)
│   │   └── src/main.rs         # CLI: build/graph/neighbors/chain/hubs
│   └── api/                    # drug-interaction-api (axum)
│       ├── src/routes/         # drugs, explain, models, search, health; legacy graph + chain; views.rs (JSON shaping)
│       ├── src/llm/            # prompts, schema, anthropic, ollama, stub, models
│       ├── src/rxnorm.rs       # offline RxNorm aliases + live RxNav fallback (cached)
│       ├── src/error.rs        # ApiError (+ From<EngineError>), stable error codes
│       ├── src/request_id.rs   # x-request-id on every response + log span
│       ├── src/store/          # saved regimens + override audit: Memory | Postgres (sqlx 0.9, query! + .sqlx/)
│       ├── migrations/         # Postgres schema; override_events append-only (trigger)
│       ├── src/bin/build_aliases.rs  # builds data/aliases.json from RxNav
│       └── src/config.rs       # env config (APP_*), fail-fast dataset check
├── frontend/src/              # React 19 + Vite 8 + Tailwind v4 + shadcn + zustand + sigma.js v3 (WebGL)
│   ├── app/                   # shell: App, AppHeader, global keys, dataset loading
│   ├── features/              # regimen · search · graph · inspector · explain · command (each with index.ts)
│   ├── shared/                # domain (severity, family, tokens), components, hooks, storage
│   ├── state/                 # store + slices + selectors + URL history
│   └── api/                   # zod-validated http + clients + schemas
└── scripts/
    ├── fetch_dataset.sh       # kaggle CLI wrapper
    ├── fetch_fda_tables.sh    # dated copy of the FDA CYP/transporter page (data/raw/)
    └── extract_fda_roles.py   # → crates/engine/data/fda_roles.csv (uv, stdlib only; reviewed + committed)
```

## Data pipeline (crates/engine/src/dataset.rs)

The Kaggle CSV has three columns — `Drug 1`, `Drug 2`,
`Interaction Description` — and **no severity field**. The builder is a
deterministic classifier:

1. **Header/UTF-8 validation**, then rows are read with an enforced
   schema (no inference drift)
2. **Dedup** on unordered pairs (first occurrence wins — 400 direction
   duplicates removed from 191,541 rows)
3. **Template classification** — 15 ordered regexes against the 15
   source description shapes (e.g. *"The metabolism of X can be
   decreased when combined with Y"*, *"X may increase the
   photosensitizing activities of Y"*). Unmatched → `unclassified`
   (781 of 191K). Matched → a `kind` (`metabolism`, `exposure`,
   `qtc-prolonging`, `activity:<word>`, …) and a `direction`
   (`increase`/`decrease`)
4. **Editorial severity** (`severity/`, documented because the source
   has none): a reviewed table maps each interaction `kind` to a grade,
   then the ONC high-priority DDI list (Phansalkar et al., JAMIA 2012)
   upgrades matching pairs to `contraindicated`. Every edge records its
   `severity_basis` (`kind:…`, `default:…`, `onc:<n>`) and the UI shows it.
   The build prints a report (severity mix, defaulted kinds, ONC upgrades)
5. **Category per drug** — its most common interaction kind (a
   data-driven profile label used for graph coloring)

Output: `data/ddi_dataset.json` (gitignored — never redistributed).

## Graph engine (crates/engine)

`InteractionGraph` wraps a petgraph `Graph<Drug, Interaction, Undirected>`
with an id→node index map. Undirected because DDI edges are symmetric.

Key queries (all in-process, no serialization of the full graph):

- **`interaction_chain(from, to, max_hops)`** — BFS with a parent map;
  reconstructs the shortest chain goal→start, then reverses. Returns
  `None` when unconnected within the limit. Steps carry kind/direction/
  severity.
- **`export_graph_json(top)`** — top-N by degree subgraph (nodes +
  induced edges) or the full graph; `stats` always describe the FULL
  dataset so the UI can show "1,701 drugs · 191,135 interactions" even
  when rendering 150 nodes.
- **`export_ego_graph_json(drug, hops)`** — BFS neighborhood with
  induced edges. Warfarin's 1-hop ego is 521 nodes / 42,538 edges, so
  the frontend renders only center-incident edges in ego mode.

Design rule: **the full graph never crosses a boundary**. Python never
existed here and the client only ever receives a filtered subgraph.

## API crate (crates/api)

Thin axum layer: routes validate → call the engine → shape JSON.
Engine errors convert with `?` (`From<EngineError> for ApiError`); every
error body carries a stable `code` and every response an `x-request-id`.
`llm/stream.rs` streams the same call (Anthropic SSE `text_delta`s, Ollama NDJSON, a paced stub) and `llm/extract.rs` turns the partial JSON into per-field deltas for `/explain/stream` (NDJSON, excluded from gzip; the task holds a semaphore permit and drops the upstream request when the client disconnects).
`llm/` holds every model backend — Anthropic Messages API and Ollama
(both JSON-schema constrained, one call returns the clinician section and
the patient handout), plus a deterministic stub — behind one async
function; dataset severity always overrides model text, and
`cargo test` never needs a GPU or network. `/graph`, `/graph/ego` and
`/interactions/chain` are **legacy** (v1 UI): kept, capped and tested, not
used by the current frontend.

## Persistence

`Store` is an enum (`Memory` | `Postgres`) chosen at startup by
`APP_DATABASE_URL`, so the API and every test work without a database.
`regimens` are soft-deleted; `override_events` is append-only (DB trigger
rejects UPDATE/DELETE/TRUNCATE) and keeps the dataset's severity and basis
at decision time, the reason, the time and a fixed pseudonymous actor.
The server stamps severity from the engine — never from the client — and
only contraindicated pairs accept an override. Shared `?meds=` links never
carry overrides; opening a saved regimen restores the overrides in force
(latest event per pair). Synthetic data only: free text that looks like an
identifier is rejected.

## Frontend (frontend/src)

Feature folders; each feature exposes `index.ts` and other features import
only that (enforced by `src/test/architecture.test.ts`, with the 300-line
and no-hex rules).

- `state/` — one zustand store composed from slices (`dataset` with a
  size-capped neighbour cache, `regimen`, `view`, `ui`), pure `selectors`,
  `history.ts` syncing the regimen with `?meds=` and browser history.
- `api/` — `http.ts` validates every response with the zod schemas in
  `schemas.ts` (types are inferred from them); `drugs.ts`, `llm.ts` clients.
- `features/graph/` — `DrugGraph.tsx` mounts sigma.js; `scene/` holds the
  layout, graph build, WebGL programs, reducers and the store → view sync
  (outside React, so hover never re-renders); `overlays/` legend, edge mode,
  zoom, hover readout.
- `app/layout/` — the workspace: the map is full-bleed (backdrop of the
  `.glass` panels) under a `react-resizable-panels` group rail | centre |
  right column. The centre panel is the map's **safe area**: the camera is
  fitted into it (`graph/scene/fit.ts`) and refitted on panel resize unless
  the user moved the camera, so panels never hide nodes. Below 1024 px the
  rail and right column become `Sheet` drawers. F6 cycles the
  `[data-region]` landmarks. Layering uses `--z-panel/overlay/float` tokens.
- `features/regimen/` — `MedicationRail` (content-height cards, user
  collapse persisted per drug in the store, reorder by grip drag via
  `useReorder` or ↑/↓ / Alt+↑/↓, announced in a live region),
  `FloatingCard` (one non-modal pop-out window, position remembered),
  regimen check (list / matrix, link, CSV, print, collapsible),
  contraindication soft-stop alert; `lib/pairs.ts` owns regimen pairs and
  the "worst risk vs the regimen" calculation. The active card carries
  `aria-current` and a decorative SVG trace (`shared/components/ActiveTrace`).
- `features/search/` — one matcher (name → RxNorm alias → common name,
  ranked) used by the columns and the palette, plus the RxNorm fallback hook.
- `features/inspector/` — focus, pair card (seven DDI elements), interactions,
  shared interactors, dataset; `features/explain/` — model chooser, AI
  clinician + patient sections streamed in place (`useExplainStream`: Stop, validated payload replaces the stream, non-streaming fallback), printable handout; `features/command/` — ⌘K
  palette, shortcuts.
- `shared/domain/tokens.ts` — the only colour source; mirrored to CSS
  custom properties at startup so CSS and the WebGL canvas never drift.
- `components/ui/` — shadcn registry components (CLI-owned).

## Design decisions

| Decision | Why |
|----------|-----|
| Undirected graph | DDI pairs are symmetric |
| ETL in Rust (`csv`+`regex`), not polars | One-shot row-wise regex work; polars is reserved for data-shaped apps (see BEST_PRACTICES/RUST_DATA_STACK_2026.md) |
| Dataset fetched per user | DrugBank-derived data; each user accepts Kaggle's terms on download; repo redistributes nothing |
| Subgraph exports in the engine | 191K edges × serialization = the API would hand megabytes to every client; filtering belongs where the graph lives |
