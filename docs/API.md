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
plus dataset `stats` (`drugs`, `interactions`, `severity_mix`) and
`sources.direction` (citation of the FDA table below) — the web UI's only
bulk payload.

Neighbors carry the full interaction record including `mechanism` text and
`severity_basis` (`kind:<kind>`, `default:<kind>` or `onc:<rule>`).

### Direction (`roles`, FDA)

A neighbour has `roles` only when the FDA CYP/transporter table
establishes which drug acts on which; **absent = direction unknown** (it is
never inferred from the dataset sentence, whose wording reverses inhibitor
roles in most rows):

```json
"roles": {
  "pattern": "directed",              // or "bidirectional"
  "links": [{
    "precipitant": "fluconazole", "object": "warfarin",
    "pathway": "CYP2C9", "effect": "inhibits",
    "strength": "moderate",            // strong | moderate | weak | unspecified (transporters)
    "object_sensitivity": "moderate-sensitive"  // sensitive | moderate-sensitive | unspecified
  }]
}
```

Rule: A → B when FDA lists A as an inhibitor/inducer of pathway P and B as a
substrate of P (both ways = `bidirectional`). Pharmacokinetic roles,
independent of the dataset's interaction type. Source: FDA, *Examples of
Drugs that Interact with CYP Enzymes and Transporter Systems*, Table 1
(content 2026-05-29), extracted to `crates/engine/data/fda_roles.csv`.
Coverage: 188 dataset drugs; 2,617 of 191,135 pairs get a direction.

### Severity tiers (editorial)

`contraindicated` > `severe` > `moderate` > `mild`. Assigned in the dataset
build from a reviewed kind table plus the ONC high-priority DDI list
(Phansalkar et al., JAMIA 2012) — see `crates/engine/src/severity/`. Not
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

## Streamed explanation

`POST /api/v1/explain/stream` — same request body as `/explain`; answers
`application/x-ndjson` (never gzipped), one JSON event per line:

```text
{"type":"start", drug_a, drug_b, direct_interaction, chain_length, dataset_severity, severity_basis, provider, model, audience, stub, disclaimer}
{"type":"delta","field":"clinician.explanation","text":"Fluconazole inhibits"}   … repeated
{"type":"done", …exactly the /explain body…}        # validated against the schema
{"type":"error","code":"llm_upstream","error":"…"}  # instead of done
```

- Validation errors (unknown drug, bad model) are normal JSON errors
  *before* streaming starts.
- One model call writes both sections; the server extracts string fields
  from the partial JSON as it arrives (`clinician.*`, `patient.*`).
- `done` re-asserts the dataset severity into every section (the model can
  never change it) — the same holds for `/explain`.
- Closing the connection (the UI's Stop) cancels the upstream model request;
  at most 2 model calls run at once (streams hold their slot until done).

## Saved regimens and override audit

```bash
curl localhost:8001/api/v1/regimens                                   # {store, regimens[]}
curl -X POST localhost:8001/api/v1/regimens -H 'content-type: application/json' \
  -d '{"label":"Statin switch review","drug_ids":["clarithromycin","simvastatin"],
       "overrides":[{"drug_a":"clarithromycin","drug_b":"simvastatin","reason":"Short course"}]}'
curl localhost:8001/api/v1/regimens/<id>        # {regimen, audit[], active_overrides[], current_dataset}
curl -X PUT  localhost:8001/api/v1/regimens/<id> -d '{"label":"…","drug_ids":[…]}' -H 'content-type: application/json'
curl -X DELETE localhost:8001/api/v1/regimens/<id>                    # 204, soft delete (audit kept)
curl -X POST localhost:8001/api/v1/overrides -H 'content-type: application/json' \
  -d '{"regimen_id":null,"drug_a":"clarithromycin","drug_b":"simvastatin","action":"override","reason":"Specialist advice"}'
curl 'localhost:8001/api/v1/overrides?regimen_id=<id>'               # {events[]}, oldest first
```

- `label` 1–80 chars, `reason` 3–500, 1–20 known `drug_ids` (order kept,
  duplicates dropped). Text that looks like an identifier (email, date,
  phone, long digit runs, MRN/DOB/SSN keywords) → `400` — synthetic data only.
- Overrides: only for contraindicated pairs (`revoke` for any interacting
  pair); the event stores the dataset `severity` + `severity_basis` at
  decision time, `actor` = `demo-clinician`, pair key ordered `drug_a < drug_b`.
  Events are append-only. Unknown regimen → `404 not_found`.
- `dataset_version` (`ddi:<drugs>:<interactions>`) marks which dataset build
  a save refers to; `current_dataset` tells the UI if it still matches.

## Errors

Every error body is `{"error": "<message>", "code": "<code>"}` — branch on
`code`, show `error`.

| Status | `code` | Meaning |
|--------|--------|---------|
| `400` | `bad_request` | bad query params (hops out of range, empty query, unavailable model) |
| `404` | `not_found` | no such (live) saved regimen |
| `404` | `unknown_drug` | unknown drug id — `{"error": "unknown drug id: warfarinn", "code": "unknown_drug"}` |
| `500` | `internal` | engine/dataset fault (details are logged, not returned) |
| `502` | `llm_upstream` | model upstream error (provider unreachable, schema mismatch, or slower than the 60 s timeout) |

Every response carries an `x-request-id` header (a well-formed incoming
`x-request-id` is echoed, otherwise one is generated); the same id is on
the request's log span, so a reported error can be found in the logs.

`/graph`, `/graph/ego` and `/interactions/chain` are **legacy** (v1 UI):
documented, capped and tested, but not used by the current frontend.

`/explain` allows at most 2 concurrent LLM calls; extra requests queue.

Startup fails fast with setup instructions when
`APP_DATASET_PATH` doesn't exist.
