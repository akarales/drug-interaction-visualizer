# AGENTS.md

Build, test, and verification commands for the Drug Interaction Visualizer.

## Tooling

- **Rust: cargo** — run from the repo root (cargo workspace)
- **JS/TS: pnpm only** (never npm) — `frontend/` as the working directory
- The app **requires the real dataset** (see Setup) — tests use a committed
  fixture and need nothing external

## Setup (one-time, per clone)

```bash
./scripts/fetch_dataset.sh                       # Kaggle CLI required
cargo run -p interaction-graph -- build \
    data/raw/db_drug_interactions.csv data/ddi_dataset.json
```

## Rust

```bash
cargo run -p drug-interaction-api                # serve on :8001
cargo run -p interaction-graph -- --help        # engine CLI (build/graph/chain/...)
cargo test --workspace -q                        # engine + api tests (fixture dataset, no GPU)
cargo clippy --workspace --all-targets -- -D warnings   # lint (must be clean)
cargo fmt --check                                # format check
```

Dataset builder classification and severity heuristics are documented in
`crates/engine/src/dataset.rs` — change them there, never ad hoc.

## Frontend

```bash
pnpm install
pnpm dev          # dev server :5173, proxies /api -> :8001
pnpm build        # tsc -b + vite build (the type check gate)
pnpm lint         # oxlint
```

## Docker

```bash
docker compose up --build    # api :8001 (needs data/ddi_dataset.json built first), web :3001
```

## Environment

| Variable | Default | Notes |
|----------|---------|-------|
| `APP_DATASET_PATH` | `data/ddi_dataset.json` | must exist; fail-fast at startup |
| `APP_LLM_STUB` | `true` | deterministic offline explanations |
| `APP_OLLAMA_URL` | `http://localhost:11434` | used when stub=false |
| `APP_OLLAMA_MODEL` | `qwen3:14b` | local GPU model |
| `APP_PORT` | `8001` | 8000 is taken by ZAP_AGI on this machine |

## Conventions

- Conventional commits: `<type>: <subject>` — lowercase, imperative, ≤72 chars
- Commit hygiene hook (`.git/hooks/prepare-commit-msg`) strips AI attribution —
  never add it manually, never commit with `--no-verify`
- Feature branches: `feat/...`, `fix/...`, `docs/...`
- Deps pinned via `Cargo.lock` (committed); new crates must be ≥7 days old
  (see `BEST_PRACTICES/INDEX.md`); add via `cargo add`, force exact versions
  with `cargo update --precise <ver> -p <crate>` when the newest is <7d
- Routes: validate → call engine → shape JSON; business logic stays in the
  engine crate, HTTP never leaks into it
- All LLM calls go through `crates/api/src/llm.rs` — tests never require a GPU
- `data/` is gitignored — never commit datasets or raw CSVs
