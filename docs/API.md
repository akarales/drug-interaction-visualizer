# API Reference

Base URL: `http://localhost:8001` (override with `APP_PORT`).

## Health

```bash
curl localhost:8001/health
```

```json
{ "status": "ok", "version": "0.1.0" }
```

## Top-N hub subgraph

```bash
curl 'localhost:8001/api/v1/graph?top=5'
```

Returns the 5 highest-degree drugs, edges induced among them, and stats
that always describe the FULL dataset:

```json
{
  "nodes": [
    { "id": "phenytoin", "name": "Phenytoin", "category": "exposure", "degree": 888 }
  ],
  "edges": [
    { "source": "warfarin", "target": "phenytoin", "kind": "exposure",
      "direction": "increase", "severity": "moderate",
      "mechanism": "The serum concentration of Warfarin …",
      "evidence": "DrugBank-derived via Kaggle" }
  ],
  "stats": { "drugs": 1701, "interactions": 191135,
             "returned_nodes": 5, "returned_edges": 10, "hubs": [...] }
}
```

`top` defaults to 100 and is clamped to `1..=500` (hub subgraphs are ~90%
dense, so 500 hubs is already ~110K edges). The full graph is never served.

## Ego network

```bash
curl 'localhost:8001/api/v1/graph/ego?drug=warfarin&hops=1'
```

Same shape as the graph export plus `"center": "warfarin"`. Hops are
limited 1–2 (`400` otherwise) — 3 hops from any hub is the whole graph.

## Drug listing / neighbors

```bash
curl localhost:8001/api/v1/drugs
curl localhost:8001/api/v1/drugs/warfarin/neighbors
```

`/drugs` returns every drug (`id`, `name`, `category`, `degree`,
`severity_mix` = `[contraindicated, severe, moderate, mild]` counts for the
node severity ring, `aliases`)
plus dataset `stats` (`drugs`, `interactions`, `severity_mix`) — the web
UI's only bulk payload.

Neighbors carry the full interaction record including `mechanism` text and
`severity_basis` (`kind:<kind>`, `default:<kind>` or `onc:<rule>`).

### Severity tiers (editorial)

`contraindicated` > `severe` > `moderate` > `mild`. Assigned in the dataset
build from a reviewed kind table plus the ONC high-priority DDI list
(Phansalkar et al., JAMIA 2012) — see `crates/engine/src/severity.rs`. Not
clinical grading.

## Drug name resolution (hybrid search)

```bash
curl 'localhost:8001/api/v1/resolve?q=coumadin'   # offline alias hit
curl 'localhost:8001/api/v1/resolve?q=tylenl'     # typo -> live RxNav fallback
```

```json
{ "query": "tylenl", "rxnav": "ok",
  "matches": [{ "id": "acetaminophen", "name": "Acetaminophen",
                "via": "acetaminophen", "source": "rxnav" }] }
```

Local alias table first (`source: "local"`, built by the `build_aliases`
binary from RxNorm brands / ingredients / salts); RxNav `approximateTerm` only
when nothing matches locally (`rxnav`: `ok` | `skipped` | `disabled` |
`unavailable`). `/drugs` also carries each drug's `aliases` for offline
search in the browser.

## LLM model chooser

```bash
curl localhost:8001/api/v1/llm/models
```

Returns `default` (`provider`, `model`) and `providers[]` — `anthropic`
(allowlisted Claude models, available when `ANTHROPIC_API_KEY` is set),
`ollama` (read-only discovery of the shared instance via `/api/tags` +
`/api/ps`, each model flagged `loaded`) and `stub`.

## Multi-hop interaction chain

```bash
curl 'localhost:8001/api/v1/interactions/chain?from=warfarin&to=simvastatin&max_hops=3'
```

```json
{
  "from": "warfarin", "to": "simvastatin", "max_hops": 3,
  "connected": true,
  "steps": [
    { "from": "warfarin", "to": "simvastatin", "kind": "activity:anticoagulant",
      "direction": "increase", "severity": "moderate" }
  ]
}
```

`connected: false` with empty `steps` when the pair isn't linked within
`max_hops` (1–5).

## LLM explanation

```bash
curl -X POST localhost:8001/api/v1/explain \
  -H 'content-type: application/json' \
  -d '{"drug_a": "warfarin", "drug_b": "simvastatin", "max_hops": 3,
       "provider": "ollama", "model": "qwen3:8b"}'
```

`provider` (`stub` | `ollama` | `anthropic`) and `model` are optional (server
default otherwise) and validated against `/llm/models` (`400` if unavailable).
`audience` is `both` (default), `clinician` or `patient`. The reader is
always a physician reviewing an interaction for one of their patients:
`clinician` = clinical terminology, mechanism, monitoring/management
considerations; `patient` = a plain-language handout draft the physician
reviews before giving it to the patient. `both` returns the two in one model
call as `sections.clinician` and `sections.patient` (`payload` mirrors the
clinician section for single-section consumers).
The response adds `dataset_severity` / `severity_basis` — the authoritative
grade; the model's `payload.severity` is advisory only.

```json
{
  "drug_a": "warfarin", "drug_b": "simvastatin",
  "direct_interaction": true, "chain_length": 1,
  "payload": { "explanation": "...", "severity": "moderate",
               "mechanism": "...", "recommendation": "..." },
  "model": "stub", "stub": true,
  "disclaimer": "Demo output from DrugBank-derived public data. Not medical advice…"
}
```

The context builder explains direct interactions, indirect chains, and
no-interaction cases differently; the LLM (or stub) receives only that
context.

## Errors

| Status | Meaning |
|--------|---------|
| `400` | bad query params (hops out of range, empty prompt) |
| `404` | unknown drug id — `{"error": "unknown drug id: …"}` |
| `502` | model upstream error (stub=false and Ollama unreachable or slower than the 60 s timeout) |

`/explain` allows at most 2 concurrent LLM calls; extra requests queue.

Startup fails fast with setup instructions when
`APP_DATASET_PATH` doesn't exist.
