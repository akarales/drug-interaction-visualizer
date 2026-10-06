<p align="center">
  <h1>💊 Drug Interaction Visualizer</h1>
  <p><b>Clinician-facing DDI workspace — petgraph engine, WebGL map, regimen check, FDA interaction direction, streamed grounded AI</b></p>
  <p>
    <a href="https://github.com/akarales/drug-interaction-visualizer/actions/workflows/ci.yml"><img src="https://github.com/akarales/drug-interaction-visualizer/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT">
    <img src="https://img.shields.io/badge/Rust-1.96-orange?logo=rust" alt="Rust 1.96">
    <img src="https://img.shields.io/badge/tests-76_rust_·_61_vitest_·_14_e2e-success" alt="tests: 76 Rust, 61 vitest, 14 Playwright">
    <img src="https://img.shields.io/badge/data-DrugBank--derived_via_Kaggle-blue" alt="DrugBank-derived data via Kaggle">
  </p>
</p>

<p align="center">
  <img src="docs/demo.gif" width="800" alt="Demo: adding fluconazole to warfarin shows the regimen check and the FDA direction (fluconazole, a CYP2C9 inhibitor, acts on warfarin); adding simvastatin and clarithromycin raises the contraindication alert, which is overridden with a documented reason; the clinician and patient explanation then streams in from a local model">
</p>

A drug–drug interaction workspace for clinicians, built on **real data**: the
DrugBank-derived Kaggle dataset (1,701 drugs, 191,135 interactions), fetched
under your own Kaggle account at setup time and never redistributed. A
Rust-native petgraph engine runs in-process with the axum API; the React
client draws every drug on a WebGL (sigma.js) map, builds a medication
regimen in a rail of cards, flags contraindicated combinations the way a
CPOE system would (with an append-only override audit in Postgres), shows
which drug acts on which from the FDA CYP/transporter table, and streams a
clinician summary plus a patient handout grounded in the dataset record.

**Jump to:** [Features](#-features) · [Architecture](#-architecture) · [Quickstart](#-quickstart) · [Configuration](#️-configuration) · [API](#-api) · [Docs](#-documentation) · [Roadmap](#️-roadmap)

> [!WARNING]
> Demo application built on public, DrugBank-derived data. Not for clinical
> use. Not medical advice. Severity is **editorial** — a reviewed table by
> interaction type plus the ONC high-priority (contraindicated) pairs
> (Phansalkar et al., JAMIA 2012); the source dataset has no severity field.

## ⚡ Features

- **Regimen workspace** — a resizable rail of content-height medication
  cards (open several at once, collapse any — remembered per drug, reorder
  by drag or keyboard, pop one out as a floating window); every list is
  annotated with each drug's worst interaction against the other picks;
  the regimen check (pair list or N×N heat-map matrix) leads the right
  column; glass panels over a full-bleed map whose camera keeps every node
  in the uncovered centre; drawers below 1024 px
- **Which drug acts on which** — precipitant → object from the public FDA
  CYP/transporter table (e.g. fluconazole, a moderate CYP2C9 inhibitor →
  warfarin, a CYP2C9 substrate), cited on every directed pair, arrows on the
  map, an "acts on / affected by" filter; "direction unknown" otherwise —
  never guessed from the dataset's wording
- **Saved regimens + override audit** — save/open named regimens; every
  override and revoke is an append-only event (Postgres trigger) with the
  dataset severity at decision time, reason, time and a pseudonymous actor;
  in-memory when no database is configured; synthetic data only
- **Contraindication alert** — tiered decision support: only
  contraindicated pairs interrupt, with the seven DDI CDS elements (drugs,
  seriousness, consequence, mechanism, modifying factors, action,
  evidence); keeping both requires a documented override reason
- **Streaming AI** — text appears while the model writes (Anthropic SSE / Ollama NDJSON → NDJSON to the browser), Stop cancels the model call, the validated payload replaces the stream
- **Clinician + patient AI output** — one schema-constrained call returns a
  clinician summary (mechanism, monitoring & management) and a
  plain-language patient handout draft (copy or print with a sign-off
  line); dataset severity is authoritative; Claude (Anthropic) or a shared
  local Ollama, chosen in a model chooser; deterministic stub for tests
- **WebGL drug map** — all 1,701 drugs on a deterministic family layout,
  severity rings per node, family-bundled summary edges, no text on the
  canvas (names live in the lists), hover without flicker
- **Hybrid drug search** — offline RxNorm brand/ingredient/salt table
  (1,615 drugs, 4,104 brands: "Coumadin" → Warfarin) plus a live NLM RxNav
  fallback for typos, cached and rate-limited
- **Share, export, navigate** — `?meds=` links with browser Back/Forward,
  CSV export, printable regimen report, ⌘K command palette, `?` shortcuts
- **Editorial severity, documented** — reviewed kind table with per-row
  rationale + ONC high-priority pairs; every edge records which rule graded
  it; the dataset build prints a report of defaulted kinds and upgrades
- **Accessible** — WCAG 2.2 AA checked with axe in every state (desktop,
  dialogs, palette, mobile drawers), keyboard-first (F6 regions, ⌘K,
  reorder by keyboard), reduced-motion and reduced-transparency respected
- **Engineering** — feature-folder frontend with an architecture test
  (300-line limit, one colour source, no cross-feature internals), zod-
  validated responses, request ids + stable error codes, SHA-pinned CI with
  RustSec/npm audits, non-root containers with a strict CSP; 76 Rust tests
  (incl. real-Postgres), 61 vitest, 14 Playwright e2e on a committed
  fixture; the repo redistributes no data

## 📐 Architecture

```mermaid
flowchart TD
    FE["React 19 + sigma.js (WebGL)<br/>medication rail · regimen check · inspector · ⌘K"] -->|"/api/v1 (zod-validated, gzip)<br/>NDJSON stream for /explain"| API
    subgraph SERVICE["Rust workspace"]
        API["axum 0.8<br/>routes · store · llm (stream + extractor)"] -->|in-process| ENG
        ENG["interaction-graph<br/>petgraph 0.8 engine<br/>severity · FDA roles · neighbours · chains"]
        CLI["ETL CLI<br/>csv + regex + severity table"] -->|"build → dataset.json"| ENG
    end
    API -->|"sqlx 0.9 (optional)"| PG[("Postgres 17<br/>saved regimens ·<br/>append-only override audit")]
    API -->|"structured output, streamed"| LLM["Claude (Anthropic)<br/>or shared Ollama<br/>or stub"]
    API -->|"typo fallback, cached"| RX["NLM RxNav"]
    KAG["Kaggle DDI dataset<br/>DrugBank-derived"] -->|"fetch_dataset.sh<br/>(per-user download)"| CLI
    FDA["FDA CYP/transporter table<br/>(reviewed CSV, compiled in)"] --> ENG
```

The engine and API share one workspace; the frontend talks only to axum.
Full breakdown in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## 🚀 Quickstart

> [!TIP]
> The real dataset is required to run the app — but `cargo test`,
> `pnpm test` and `pnpm e2e` use committed fixtures and need no Kaggle
> account, network, or GPU.

```bash
# 1. Fetch the dataset (requires the kaggle CLI configured)
./scripts/fetch_dataset.sh

# 2. Normalize, classify and grade it into the engine dataset
cargo run -p interaction-graph -- build \
    data/raw/db_drug_interactions.csv data/ddi_dataset.json

# 3. Optional: offline brand-name search table from RxNorm (~5 min)
cargo run -p drug-interaction-api --bin build_aliases

# 4. Serve the API (port 8001) — in-memory store by default
cargo run -p drug-interaction-api
#    optional: persist saved regimens + the override audit in Postgres 17
#    docker compose up -d db
#    APP_DATABASE_URL=postgresql://app:app@127.0.0.1:5434/ddi_visualizer cargo run -p drug-interaction-api

# 5. Frontend
cd frontend && pnpm install && pnpm dev   # → http://localhost:5173
```

AI explanations default to the offline stub. Set `APP_LLM_STUB=false` and
`APP_LLM_PROVIDER=anthropic` (with `ANTHROPIC_API_KEY` in a gitignored
`.env`) or `ollama`; the model chooser lists what is available.

## ⚙️ Configuration

| Variable | Default | Notes |
|----------|---------|-------|
| `APP_DATASET_PATH` | `data/ddi_dataset.json` | must exist; fail-fast at startup with setup instructions |
| `APP_LLM_STUB` | `true` | deterministic offline explanations |
| `APP_LLM_PROVIDER` | `ollama` | `ollama` · `anthropic` · `stub` (used when stub=false) |
| `APP_ANTHROPIC_MODEL` | `claude-sonnet-5-5` | `ANTHROPIC_API_KEY` required for Anthropic |
| `APP_OLLAMA_URL` / `APP_OLLAMA_MODEL` | `http://localhost:11434` / `qwen3:14b` | shared instance: models are used as-is, never pulled or changed |
| `APP_OLLAMA_KEEP_ALIVE` | `2m` | how long our model stays loaded |
| `APP_ALIASES_PATH` | `data/aliases.json` | offline RxNorm names (optional) |
| `APP_RXNAV_ENABLED` | `true` | live RxNav fallback for typos and brands |
| `APP_PORT` | `8001` | API port |
| `APP_DATABASE_URL` | — | Postgres for saved regimens + override audit; unset = in-memory store |

## 📡 API

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | liveness |
| `GET /api/v1/drugs` | every drug + aliases, severity mix, dataset stats |
| `GET /api/v1/drugs/{id}/neighbors` | direct interactions: kind, severity + basis, source sentence, FDA `roles` (direction) |
| `GET /api/v1/resolve?q=` | hybrid name resolution (offline aliases → RxNav) |
| `GET /api/v1/llm/models` | model chooser: Claude models, shared-Ollama models (loaded flag), stub |
| `POST /api/v1/explain` | clinician summary + patient handout (`audience`, `provider`, `model`) |
| `POST /api/v1/explain/stream` | the same, streamed as NDJSON (`start` → `delta`… → `done` / `error`) |
| `GET/POST /api/v1/regimens` · `GET/PUT/DELETE /api/v1/regimens/{id}` | saved regimens (soft delete) |
| `GET/POST /api/v1/overrides` | append-only override / revoke audit events |
| `GET /api/v1/interactions/chain?from=&to=&max_hops=` | multi-hop chain |
| `GET /api/v1/graph?top=N` · `/graph/ego` | hub / ego subgraphs (capped) |

Request/response examples with curl: [docs/API.md](docs/API.md).

## 📚 Documentation

| Page | What's inside |
|------|---------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Crate breakdown, ETL classification pipeline, BFS chain algorithm, subgraph export logic |
| [docs/API.md](docs/API.md) | Full endpoint reference — curl + JSON payloads + error taxonomy |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Human dev guide — setup, testing, verification, gotchas |
| [frontend/scripts/record-demo.mjs](frontend/scripts/record-demo.mjs) | Regenerates `docs/demo.gif` (scripted Playwright recording) |

## 🗺️ Roadmap

<details>
<summary>Phased plan</summary>

- [x] v1 — engine, ETL, API, D3 visualization, CI
- [x] v2 — WebGL map, regimen columns + matrix, editorial severity with ONC
      tier, contraindication alert with overrides, hybrid RxNorm search,
      clinician + patient AI output (Claude / shared Ollama), share links,
      CSV + print, ⌘K palette, unit + e2e tests
- [x] v3 — feature-folder refactor with enforced architecture rules;
      medication rail + glass workspace with a safe-area camera; FDA
      interaction direction; saved regimens + append-only override audit
      (Postgres); streamed AI explanations; WCAG 2.2 AA checks; hardened
      CI and containers; demo GIF
- [ ] Authentication and per-user audit actors (the demo uses a fixed
      pseudonym)
- [ ] More citable direction sources (transporters beyond the FDA examples)

</details>

## 🤝 Contributing

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). All checks green
before merge (`cargo clippy --workspace --all-targets -- -D warnings`,
`cargo test --workspace -q`, `pnpm build`, `pnpm lint`, `pnpm test`,
`pnpm e2e`).

## 📄 License

MIT — see [LICENSE](LICENSE).
