//! Router assembly.

pub mod explain;
pub mod graph;
pub mod health;
pub mod search;

use axum::Router;
use axum::routing::{get, post};
use tower::limit::ConcurrencyLimitLayer;
use tower_http::compression::CompressionLayer;

use crate::state::AppState;

/// At most this many LLM calls in flight; extra requests queue.
const EXPLAIN_CONCURRENCY: usize = 2;

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
        .route("/api/v1/resolve", get(search::resolve))
        .route("/api/v1/llm/models", get(explain::list_models))
        .route(
            "/api/v1/explain",
            post(explain::explain).layer(ConcurrencyLimitLayer::new(EXPLAIN_CONCURRENCY)),
        )
        // gzip when the client asks (`/drugs` is ~250 KB of repetitive JSON)
        .layer(CompressionLayer::new())
        .with_state(state)
}
