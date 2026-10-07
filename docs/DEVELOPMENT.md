# Development Guide

Machine-facing build/test commands live in [AGENTS.md](../AGENTS.md) —
this is the human walkthrough.

## Prerequisites

- Rust 1.96 (`rustup`), cargo
- pnpm 11 / Node 24 (frontend)
- kaggle CLI configured (`~/.kaggle`) — only for the one-time dataset fetch
- Optional: Ollama (shared instance — models used as-is) or an Anthropic key for real LLM mode
- Optional: Docker for the Postgres 17 store (`docker compose up -d db`) and sqlx-cli 0.9.0 to refresh `.sqlx/`

## One-time dataset setup

```bash
./scripts/fetch_dataset.sh
cargo run -p interaction-graph -- build \
    data/raw/db_drug_interactions.csv data/ddi_dataset.json
```

The builder prints what it did (drugs, interactions, unclassified count,
severity mix). `data/` is gitignored — never commit datasets.

## Daily loop

```bash
cargo run -p drug-interaction-api      # API on :8001
cd frontend && pnpm dev                # UI on :5173, proxies /api
cargo test --workspace -q             # 72 tests (fixture dataset — no Kaggle, DB or GPU needed)
cargo clippy --workspace --all-targets -- -D warnings
cd frontend && pnpm test && PW_CHROMIUM_PATH=/usr/bin/google-chrome pnpm e2e
```

With persistence (saved regimens + override audit):

```bash
docker compose up -d db               # postgres:17-alpine on 127.0.0.1:5434
APP_DATABASE_URL=postgresql://app:app@127.0.0.1:5434/ddi_visualizer cargo run -p drug-interaction-api
DATABASE_URL=postgresql://app:app@127.0.0.1:5434/ddi_visualizer \
  cargo test -p drug-interaction-api --features pg-tests --test pg_store
```

Demo GIF (needs the dev servers): `cd frontend && DEMO_MODEL=ollama:qwen3:8b node scripts/record-demo.mjs`.

## Engine CLI

```bash
cargo run -p interaction-graph -- --help
cargo run -p interaction-graph -- graph data/ddi_dataset.json --top 50
cargo run -p interaction-graph -- chain data/ddi_dataset.json warfarin simvastatin
cargo run -p interaction-graph -- neighbors data/ddi_dataset.json warfarin
```

## Testing notes

- Engine tests run on a tiny synthetic fixture + a temp CSV — they cover
  the ETL classifier end-to-end (dedup, self-pair skip, severity mapping)
- API tests build the router in-process (`tower::ServiceExt::oneshot`)
  against a committed `mini_dataset.json` — no server, no dataset
- Frontend: vitest (domain, store slices, components in jsdom, NDJSON
  parsing, architecture rules) and Playwright e2e against the real API on
  the fixture (layout, direction, persistence, streaming, axe a11y)
- CI (actions SHA-pinned): audit (RustSec + npm prod), rust, postgres
  (real-DB tests + live query check), frontend, e2e — never needs the
  Kaggle dataset

## Gotchas learned here

- **petgraph 0.8**: `EdgeRef` must be in scope for `.source()/.target()`
  on edge refs; `node_bound()` is gone (use `node_count()`); `usize::from(NodeIndex)` is gone (use `.index()`)
- **Default port is 8001** (`APP_PORT`); the e2e run uses 8091/4183 so it
  can run beside the dev servers
- **sigma.js in React**: the graph component renders once per dataset;
  hover/selection live in the zustand store and reach sigma through
  `useExplorer.subscribe` + reducers — never put them in React state of the
  graph component (that rebuilt the whole scene in v1)
- **sigma programs** must be typed with the graph's node/edge attribute
  generics (`createNodeCompoundProgram<NodeAttrs, EdgeAttrs>`); the graph is
  `multi: true` so a family can have two summary arcs to one anchor
- **sigma resize**: skip `sigma.resize()` while the container is hidden
  (printing sets the app shell to `display:none`)
- **Source roles**: the Kaggle sentences reverse precipitant/object for
  inhibitors — direction comes only from the FDA table (`fda_roles.csv`)
- **Streaming**: the NDJSON route is excluded from gzip (it would buffer);
  a tower ConcurrencyLimitLayer only covers the time until headers, so the
  stream task holds a semaphore permit instead
- **sqlx offline**: builds use `.sqlx/` (`SQLX_OFFLINE=true` in
  `.cargo/config.toml`); after changing a query, migrate then
  `cargo sqlx prepare --workspace`
- **Port 5433** on the dev machine belongs to another project; this app's
  Postgres is on 5434
- **Docker base images**: builder and runtime must be the same Debian
  release. `rust:1.96-slim` moved to trixie (glibc 2.41); a
  `debian:bookworm-slim` runtime (glibc 2.36) fails with `GLIBC_2.38 not
  found`. Both stages are pinned to trixie, and the CI `docker` job starts
  both images (a build alone doesn't catch this).
- **Recording the GIF**: Playwright's VP8 video is lossy — denoise and
  drop near-duplicate frames before palette generation or the GIF triples

## Conventions

Conventional commits (`feat:`, `fix:`, `docs:` — lowercase imperative,
≤72 chars). The commit-hygiene hook strips AI attribution automatically;
never bypass it with `--no-verify`. Dependencies are pinned via
Cargo.lock and must be ≥7 days old when added
(see `BEST_PRACTICES/INDEX.md`).
