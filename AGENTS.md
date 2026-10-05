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

Optional — offline brand-name search table (~5 min, paced under the RxNav
rate limit; drug names only are sent to NLM):

```bash
cargo run -p drug-interaction-api --bin build_aliases   # -> data/aliases.json
```

## Rust

```bash
cargo run -p drug-interaction-api                # serve on :8001
cargo run -p interaction-graph -- --help        # engine CLI (build/graph/chain/...)
cargo test --workspace -q                        # engine + api tests (fixture dataset, no GPU)
cargo clippy --workspace --all-targets -- -D warnings   # lint (must be clean)
cargo fmt --check                                # format check
```

Dataset builder classification is in `crates/engine/src/dataset.rs`;
severity grading (reviewed kind table + ONC high-priority pairs) is in
`crates/engine/src/severity.rs` — change it there, never ad hoc, and
re-run `build` (it prints a report: severity mix, defaulted kinds, ONC
upgrades per rule).

## Frontend

```bash
pnpm install
pnpm dev          # dev server :5173, proxies /api -> :8001
pnpm build        # tsc -b + vite build (the type check gate)
pnpm lint         # oxlint
pnpm test         # vitest: domain logic, CSV/handout, zustand store (network mocked)
pnpm e2e          # Playwright smoke: real API on the 8-drug fixture + production build
                  # (locally: PW_CHROMIUM_PATH=/usr/bin/google-chrome pnpm e2e)
```

Visual check without a GPU (headless Chrome renders the WebGL graph via
SwiftShader):

```bash
google-chrome --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader \
  --window-size=1600,950 --virtual-time-budget=6000 \
  --screenshot=/tmp/shot.png http://localhost:5173/
```

Frontend state lives in `src/state/explorer.ts` (zustand); the sigma.js
graph subscribes to it outside React — never put hover/selection in React
state of the graph component.

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
| `APP_LLM_PROVIDER` | `ollama` | `ollama` or `anthropic` (used when stub=false) |
| `APP_ANTHROPIC_MODEL` | `claude-sonnet-5-5` | Messages API + JSON-schema structured output |
| `ANTHROPIC_API_KEY` | — | required for `anthropic`; keep it in the gitignored `.env` (loaded at startup) |
| `APP_OLLAMA_KEEP_ALIVE` | `2m` | the Ollama instance is SHARED — never pull/delete/configure models, never send reload-forcing options (`num_ctx`) |
| `APP_ALIASES_PATH` | `data/aliases.json` | offline RxNorm brand/ingredient/salt names (optional) |
| `APP_RXNAV_ENABLED` | `true` | live RxNav fallback for typos/brands (≤20 req/s per NLM ToS; 24 h cache) |
| `APP_PORT` | `8001` | API port (e2e uses 8091) |

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
