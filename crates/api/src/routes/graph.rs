//! LEGACY v1 graph exports (`/graph`, `/graph/ego`) — kept, capped and
//! tested for API consumers; the current UI does not call them.

use axum::Json;
use axum::extract::{Query, State};
use serde::Deserialize;
use serde_json::Value;

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
    Ok(Json(
        state
            .engine
            .export_ego_graph_json(&params.drug, params.hops)?,
    ))
}
