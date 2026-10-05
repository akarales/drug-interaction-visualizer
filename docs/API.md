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

`top=0` returns the full graph (191K edges — for API consumers, not
browsers).

## Ego network

```bash
curl 'localhost:8001/api/v1/graph/ego?drug=warfarin&hops=1'
```

Same shape as the graph export plus `"center": "warfarin"`. Hops are
limited 1–3 (`400` otherwise).

## Drug listing / neighbors

```bash
curl localhost:8001/api/v1/drugs
curl localhost:8001/api/v1/drugs/warfarin/neighbors
```

Neighbors carry the full interaction record including `mechanism` text.

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
  -d '{"drug_a": "warfarin", "drug_b": "simvastatin", "max_hops": 3}'
```

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
| `502` | model upstream error (stub=false and Ollama unreachable) |

Startup fails fast with setup instructions when
`APP_DATASET_PATH` doesn't exist.
