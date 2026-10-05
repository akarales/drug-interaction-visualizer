//! Router assembly.

pub mod explain;
pub mod graph;
pub mod health;

use axum::Router;
use axum::routing::{get, post};

use crate::state::AppState;

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health::health))
        .route("/api/v1/graph", get(graph::get_graph))
        .route("/api/v1/graph/ego", get(graph::get_ego_graph))
        .route("/api/v1/drugs", get(graph::list_drugs))
        .route(
            "/api/v1/drugs/{drug_id}/neighbors",
            get(graph::drug_neighbors),
        )
        .route("/api/v1/interactions/chain", get(graph::interaction_chain))
        .route("/api/v1/explain", post(explain::explain))
        .with_state(state)
}
