//! `/drugs` (every drug + dataset stats) and `/drugs/{id}/neighbors`.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::header;
use axum::response::IntoResponse;
use interaction_graph::roles;
use serde_json::{Value, json};

use super::views;
use crate::error::ApiError;
use crate::state::AppState;

/// The dataset is immutable for the process lifetime; let browsers reuse it.
pub const DATASET_CACHE: (header::HeaderName, &str) =
    (header::CACHE_CONTROL, "public, max-age=300");

pub async fn list_drugs(State(state): State<AppState>) -> impl IntoResponse {
    let mix = state.engine.severity_mix_by_drug();
    let drugs: Vec<Value> = state
        .engine
        .drugs()
        .into_iter()
        .map(|(drug, degree)| {
            let drug_mix = state
                .engine
                .index(&drug.id)
                .ok()
                .and_then(|idx| mix.get(&idx).copied())
                .unwrap_or_default();
            views::drug_summary(&state.aliases, &drug, degree, drug_mix)
        })
        .collect();
    let body = Json(json!({
        "drugs": drugs,
        "stats": {
            "drugs": state.engine.node_count(),
            "interactions": state.engine.edge_count(),
            "severity_mix": state.engine.severity_mix(),
        },
        // citation for the precipitant → object links on neighbours
        "sources": { "direction": roles::FDA_SOURCE },
    }));
    ([DATASET_CACHE], body)
}

pub async fn drug_neighbors(
    State(state): State<AppState>,
    Path(drug_id): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    let out: Vec<Value> = state
        .engine
        .neighbors(&drug_id)?
        .iter()
        .map(|n| views::neighbor(&drug_id, n))
        .collect();
    Ok((
        [DATASET_CACHE],
        Json(json!({ "drug": drug_id, "neighbors": out })),
    ))
}
