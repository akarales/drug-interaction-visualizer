# Development Guide

Machine-facing build/test commands live in [AGENTS.md](../AGENTS.md) —
this is the human walkthrough.

## Prerequisites

- Rust 1.96 (`rustup`), cargo
- pnpm 11 / Node 24 (frontend)
- kaggle CLI configured (`~/.kaggle`) — only for the one-time dataset fetch
- Optional: Ollama with `qwen3:14b` for real LLM mode

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
cargo test --workspace -q             # 24 tests (fixture dataset — no Kaggle needed)
cargo clippy --workspace --all-targets -- -D warnings
```

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
- CI runs fmt + clippy + tests + a fixture-CSV engine smoke; it never
  needs the Kaggle dataset

## Gotchas learned here

- **petgraph 0.8**: `EdgeRef` must be in scope for `.source()/.target()`
  on edge refs; `node_bound()` is gone (use `node_count()`); `usize::from(NodeIndex)` is gone (use `.index()`)
- **Port 8000 is occupied** on this machine (ZAP_AGI FastAPI) — this
  service defaults to 8001
- **D3 in React**: D3 mutates the SVG inside a `useRef`+`useEffect`;
  React only renders the empty `<svg>`. Clone nodes before simulation —
  d3 mutates them
- **Ego views**: render only center-incident edges; hub egos (warfarin =
  42K induced edges) will hang the force layout otherwise

## Conventions

Conventional commits (`feat:`, `fix:`, `docs:` — lowercase imperative,
≤72 chars). The commit-hygiene hook strips AI attribution automatically;
never bypass it with `--no-verify`. Dependencies are pinned via
Cargo.lock and must be ≥7 days old when added
(see `BEST_PRACTICES/INDEX.md`).
