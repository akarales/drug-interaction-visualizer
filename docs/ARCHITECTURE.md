# Architecture

## Workspace layout

```
drug-interaction-visualizer/
├── Cargo.toml                 # workspace: engine + api
├── crates/
│   ├── engine/                # interaction-graph
│   │   ├── src/graph.rs        # types: Drug, Interaction, InteractionGraph
│   │   ├── src/queries.rs      # chains, hubs, ego/top-N exports
│   │   ├── src/dataset.rs      # ETL: Kaggle CSV → dataset JSON
│   │   └── src/main.rs         # CLI: build/graph/neighbors/chain/hubs
│   └── api/                    # drug-interaction-api (axum)
│       ├── src/routes/         # graph, explain, health handlers
│       ├── src/llm.rs          # Ollama client + stub backend
│       └── src/config.rs       # env config, fail-fast dataset check
├── frontend/                  # React 19 + Vite 8 + D3 7
└── scripts/fetch_dataset.sh   # kaggle CLI wrapper
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
4. **Severity heuristic** (documented because the source has none):
   `severe` for cardiotoxic/arrhythmogenic/nephrotoxic/hepatotoxic/
   neurotoxic/hypertensive/serotonergic/teratogenic/QTc/AV-block kinds,
   `mild` for photosensitizing, `moderate` otherwise
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
`llm.rs` holds both backends (Ollama over HTTP with a JSON-schema
`format`, and a deterministic stub) behind one async function —
`cargo test` never needs a GPU.

## Design decisions

| Decision | Why |
|----------|-----|
| Undirected graph | DDI pairs are symmetric |
| ETL in Rust (`csv`+`regex`), not polars | One-shot row-wise regex work; polars is reserved for data-shaped apps (see BEST_PRACTICES/RUST_DATA_STACK_2026.md) |
| Dataset fetched per user | DrugBank-derived data; each user accepts Kaggle's terms on download; repo redistributes nothing |
| Subgraph exports in the engine | 191K edges × serialization = the API would hand megabytes to every client; filtering belongs where the graph lives |
