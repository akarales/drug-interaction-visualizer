//! LEGACY `/interactions/chain` — shortest interaction chain between two
//! drugs (BFS in the engine). Kept for API consumers; the UI uses the
//! chain only inside `/explain`.

use axum::Json;
use axum::extract::{Query, State};
use serde::Deserialize;
use serde_json::{Value, json};

use super::views;
use crate::error::ApiError;
use crate::state::AppState;

/// Longest chain accepted by `/interactions/chain` and `/explain`.
pub const MAX_CHAIN_HOPS: usize = 5;

#[derive(Debug, Deserialize)]
pub struct ChainQuery {
    pub from: String,
    pub to: String,
    #[serde(default = "default_max_hops")]
    pub max_hops: usize,
}

pub fn default_max_hops() -> usize {
    3
}

pub fn validate_max_hops(max_hops: usize) -> Result<(), ApiError> {
    if max_hops == 0 || max_hops > MAX_CHAIN_HOPS {
        return Err(ApiError::BadRequest(format!(
            "max_hops must be between 1 and {MAX_CHAIN_HOPS}"
        )));
    }
    Ok(())
}

pub async fn interaction_chain(
    State(state): State<AppState>,
    Query(params): Query<ChainQuery>,
) -> Result<Json<Value>, ApiError> {
    validate_max_hops(params.max_hops)?;
    // Unknown drugs produce a 404 via UnknownDrug.
    state.engine.degree(&params.from)?;
    state.engine.degree(&params.to)?;

    let chain = state
        .engine
        .interaction_chain(&params.from, &params.to, params.max_hops)?;
    let connected = chain.is_some();
    let steps: Vec<Value> = chain
        .unwrap_or_default()
        .iter()
        .map(views::chain_step)
        .collect();
    Ok(Json(json!({
        "from": params.from,
        "to": params.to,
        "max_hops": params.max_hops,
        "connected": connected,
        "steps": steps,
    })))
}
