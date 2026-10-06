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

Interaction direction comes from the FDA CYP/transporter table, extracted to
the committed `crates/engine/data/fda_roles.csv` (public domain; compiled
into the engine). Regenerate only when FDA updates the page, then review the
diff and the unmatched-name report before committing:

```bash
./scripts/fetch_fda_tables.sh && uv run --no-project scripts/extract_fda_roles.py --retrieved $(date +%F)
```

Never infer direction from the Kaggle sentences (they reverse inhibitor roles
in most rows); no FDA match = "direction unknown".

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
`crates/engine/src/severity/` (`kind_table.rs`, `onc.rs`) — change it there, never ad hoc, and
re-run `build` (it prints a report: severity mix, defaulted kinds, ONC
upgrades per rule).

## Persistence (optional)

Saved regimens + the append-only override audit. Without `APP_DATABASE_URL`
the API uses an in-memory store (tests, e2e, quick demos). With it:

```bash
docker compose up -d db          # postgres:17-alpine on 127.0.0.1:5434 (local demo creds app/app)
APP_DATABASE_URL=postgresql://app:app@127.0.0.1:5434/ddi_visualizer cargo run -p drug-interaction-api
DATABASE_URL=postgresql://app:app@127.0.0.1:5434/ddi_visualizer \
  cargo test -p drug-interaction-api --features pg-tests --test pg_store   # real-DB tests
```

- Migrations in `crates/api/migrations/` run at startup; `override_events`
  rejects UPDATE/DELETE/TRUNCATE via trigger — never work around it.
- Queries use sqlx `query!` macros with committed `.sqlx/` metadata;
  `.cargo/config.toml` sets `SQLX_OFFLINE=true`, so builds/CI need no DB.
  After changing a query or migration: `sqlx migrate run --source
  crates/api/migrations` then `cargo sqlx prepare --workspace` (sqlx-cli
  0.9.0) and commit `.sqlx/`.
- Synthetic data only: labels/reasons that look like identifiers are rejected
  (`routes/validate.rs`); the actor is the fixed pseudonym `demo-clinician`.
- Port 5433 on this machine belongs to another project — don't use it.

## Frontend

```bash
pnpm install
pnpm dev          # dev server :5173, proxies /api -> :8001
pnpm build        # tsc -b + vite build (the type check gate)
pnpm lint         # oxlint
pnpm test         # vitest: domain, search, regimen, store, components (*.test.tsx, jsdom), architecture rules; network mocked
pnpm e2e          # Playwright: smoke, layout, direction, persistence, axe scan — real API on the 8-drug fixture
                  # (locally: PW_CHROMIUM_PATH=/usr/bin/google-chrome pnpm e2e)
```

Visual check without a GPU (headless Chrome renders the WebGL graph via
SwiftShader):

```bash
google-chrome --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader \
  --window-size=1600,950 --virtual-time-budget=6000 \
  --screenshot=/tmp/shot.png http://localhost:5173/
```

Frontend state is one zustand store composed from slices in `src/state/`
(`slices/{dataset,regimen,view,ui}.ts`, selectors in `selectors.ts`, import
from `@/state`); the sigma.js graph subscribes to it outside React — never
put hover/selection in React state of the graph component.

## Code structure (enforced)

```
frontend/src/
  app/        shell only: App, AppHeader, global keys, dataset loading,
              layout/ (Workspace: full-bleed map + rail | safe area | right column, drawers < 1024 px)
  features/   regimen · search · graph · inspector · explain · command
              each exposes index.ts; other features import ONLY that
  shared/     domain (severity, family, tokens), components, hooks, storage
  state/      store + slices + selectors + URL history
  api/        http (zod-validated) + one client per resource + schemas.ts
  components/ui/  shadcn registry (CLI-owned)
crates/api/src/   llm/{prompts,schema,anthropic,ollama,stub,models}.rs,
                  routes/{drugs,explain,models,search,health,graph,chain}.rs + views.rs
crates/engine/src/ severity/{kind_table,onc}.rs, graph, queries, dataset
```

Rules (`src/test/architecture.test.ts` fails the build on the first four):
- source files ≤ ~300 lines (tests and `components/ui/` exempt) — split by
  responsibility before adding to a long file
- colours only from `shared/domain/tokens.ts` (mirrored to CSS as
  `--sev-*`, `--fam-*`, `--graph-*`); no hex literals elsewhere
- `features/X` imports `@/features/Y` (its index), never `@/features/Y/...`
- `api/`, `state/`, `shared/` never import `features/` or `app/`
- one component per file (tiny private helpers allowed); stores are slices
- every new module gets a test; API responses get a zod schema
- Rust: `?` on engine calls (`EngineError` → `ApiError` via `From`), error
  bodies carry a stable `code`, JSON shaping lives in `routes/views.rs`

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
| `APP_DATABASE_URL` | — | Postgres for saved regimens + override audit; unset = in-memory store |

## Conventions

- Conventional commits: `<type>: <subject>` — lowercase, imperative, ≤72 chars
- Commit hygiene hook (`.git/hooks/prepare-commit-msg`) strips AI attribution —
  never add it manually, never commit with `--no-verify`
- Feature branches: `feat/...`, `fix/...`, `docs/...`
- Frontend deps are exact versions (no `^`/`~`); `frontend/pnpm-workspace.yaml`
  sets `minimumReleaseAge: 10080` so pnpm refuses any package (incl.
  transitive) younger than 7 days — pnpm 11 reads settings and overrides
  from that file, not from `package.json`
- `components/ui/` is registry-owned: add with `pnpm dlx shadcn@<pinned> add`,
  never hand-edit; the CLI has no `remove`, so unused components are deleted
- Deps pinned via `Cargo.lock` (committed); new crates must be ≥7 days old
  (see `BEST_PRACTICES/INDEX.md`); add via `cargo add`, force exact versions
  with `cargo update --precise <ver> -p <crate>` when the newest is <7d
- Routes: validate → call engine → shape JSON; business logic stays in the
  engine crate, HTTP never leaks into it
- All LLM calls go through `crates/api/src/llm/` (`llm::explain`) — tests never require a GPU
- `data/` is gitignored — never commit datasets or raw CSVs
