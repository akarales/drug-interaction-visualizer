//! Graph endpoints — thin HTTP wrappers over the engine.

use std::collections::HashMap;

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::header;
use axum::response::IntoResponse;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::error::ApiError;
use crate::state::AppState;

/// Upper bound for `top`: induced subgraphs of the hubs are ~90% dense,
/// so 500 hubs is already ~110K edges. The full graph is never served.
pub const MAX_TOP: usize = 500;
/// Ego graphs beyond 2 hops cover effectively the whole dataset.
pub const MAX_HOPS: usize = 2;

#[derive(Debug, Deserialize)]
pub struct GraphQuery {
    /// Top-N drugs by degree, clamped to `1..=MAX_TOP`.
    #[serde(default = "default_top")]
    pub top: usize,
}

/// The dataset is immutable for the process lifetime; let browsers reuse it.
const DATASET_CACHE: (header::HeaderName, &str) = (header::CACHE_CONTROL, "public, max-age=300");

fn default_top() -> usize {
    100
}

#[derive(Debug, Deserialize)]
pub struct EgoQuery {
    pub drug: String,
    #[serde(default = "default_hops")]
    pub hops: usize,
}

fn default_hops() -> usize {
    1
}

#[derive(Debug, Deserialize)]
pub struct ChainQuery {
    pub from: String,
    pub to: String,
    #[serde(default = "default_max_hops")]
    pub max_hops: usize,
}

fn default_max_hops() -> usize {
    3
}

pub async fn get_graph(
    State(state): State<AppState>,
    Query(params): Query<GraphQuery>,
) -> Json<Value> {
    let top = params.top.clamp(1, MAX_TOP);
    Json(state.engine.export_graph_json(Some(top)))
}

pub async fn get_ego_graph(
    State(state): State<AppState>,
    Query(params): Query<EgoQuery>,
) -> Result<Json<Value>, ApiError> {
    if params.hops == 0 || params.hops > MAX_HOPS {
        return Err(ApiError::BadRequest(format!(
            "hops must be between 1 and {MAX_HOPS}"
        )));
    }
    let ego = state
        .engine
        .export_ego_graph_json(&params.drug, params.hops)
        .map_err(|e| ApiError::UnknownDrug(e.to_string()))?;
    Ok(Json(ego))
}

pub async fn list_drugs(State(state): State<AppState>) -> impl IntoResponse {
    let mix = state.engine.severity_mix_by_drug();
    let drugs: Vec<Value> = state
        .engine
        .drugs()
        .into_iter()
        .map(|(drug, degree)| {
            // RxNorm names other than the dataset name (brands, INN/USAN, salts)
            let mut aliases: Vec<&str> = Vec::new();
            if let Some(entry) = state.aliases.get(&drug.id) {
                for alias in entry.all() {
                    if !alias.eq_ignore_ascii_case(&drug.name) && !aliases.contains(&alias.as_str())
                    {
                        aliases.push(alias);
                    }
                }
            }
            json!({
                "id": drug.id,
                "name": drug.name,
                "category": drug.category,
                "degree": degree,
                // [contraindicated, severe, moderate, mild] — node severity ring
                "severity_mix": state
                    .engine
                    .index(&drug.id)
                    .ok()
                    .and_then(|idx| mix.get(&idx).copied())
                    .unwrap_or_default(),
                "aliases": aliases,
            })
        })
        .collect();
    let body = Json(json!({
        "drugs": drugs,
        "stats": {
            "drugs": state.engine.node_count(),
            "interactions": state.engine.edge_count(),
            "severity_mix": state.engine.severity_mix(),
        },
    }));
    ([DATASET_CACHE], body)
}

pub async fn drug_neighbors(
    State(state): State<AppState>,
    Path(drug_id): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    let neighbors = state
        .engine
        .neighbors(&drug_id)
        .map_err(|e| ApiError::UnknownDrug(e.to_string()))?;
    let out: Vec<Value> = neighbors
        .into_iter()
        .map(|n| {
            json!({
                "id": n.drug.id,
                "name": n.drug.name,
                "category": n.drug.category,
                "kind": n.interaction.kind,
                "direction": n.interaction.direction,
                "severity": n.interaction.severity,
                "severity_basis": n.interaction.severity_basis,
                "mechanism": n.interaction.mechanism,
            })
        })
        .collect();
    Ok((
        [DATASET_CACHE],
        Json(json!({ "drug": drug_id, "neighbors": out })),
    ))
}

pub async fn interaction_chain(
    State(state): State<AppState>,
    Query(params): Query<ChainQuery>,
) -> Result<Json<Value>, ApiError> {
    if params.max_hops == 0 || params.max_hops > 5 {
        return Err(ApiError::BadRequest(
            "max_hops must be between 1 and 5".into(),
        ));
    }
    // Unknown drugs produce a 404 via UnknownDrug.
    state
        .engine
        .degree(&params.from)
        .map_err(|e| ApiError::UnknownDrug(e.to_string()))?;
    state
        .engine
        .degree(&params.to)
        .map_err(|e| ApiError::UnknownDrug(e.to_string()))?;

    let chain = state
        .engine
        .interaction_chain(&params.from, &params.to, params.max_hops)
        .map_err(|e| ApiError::UnknownDrug(e.to_string()))?;

    let connected = chain.is_some();
    let steps: Vec<Value> = chain
        .unwrap_or_default()
        .into_iter()
        .map(|step| {
            json!({
                "from": step.from,
                "to": step.to,
                "kind": step.kind,
                "direction": step.direction,
                "severity": step.severity,
            })
        })
        .collect();
    Ok(Json(json!({
        "from": params.from,
        "to": params.to,
        "max_hops": params.max_hops,
        "connected": connected,
        "steps": steps,
    })))
}

/// Shared helper for the explain route: direct interaction details.
pub fn direct_interaction(
    state: &AppState,
    drug_a: &str,
    drug_b: &str,
) -> Result<Option<Value>, ApiError> {
    let neighbors = state
        .engine
        .neighbors(drug_a)
        .map_err(|e| ApiError::UnknownDrug(e.to_string()))?;
    Ok(neighbors
        .into_iter()
        .find(|n| n.drug.id == drug_b)
        .map(|n| {
            json!({
                "kind": n.interaction.kind,
                "direction": n.interaction.direction,
                "severity": n.interaction.severity,
                "mechanism": n.interaction.mechanism,
                "evidence": n.interaction.evidence,
            })
        }))
}

/// Shared helper: id -> display name map (built once per call; the engine
/// owns the data, this is just JSON-shaping for the explain prompt).
pub fn drug_names(state: &AppState) -> HashMap<String, String> {
    state
        .engine
        .drugs()
        .into_iter()
        .map(|(drug, _)| (drug.id, drug.name))
        .collect()
}
