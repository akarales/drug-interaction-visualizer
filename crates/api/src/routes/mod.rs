//! Router assembly. One module per resource; JSON shaping in `views`.

pub mod chain;
pub mod drugs;
pub mod explain;
pub mod explain_stream;
pub mod graph;
pub mod health;
pub mod models;
pub mod regimens;
pub mod search;
mod validate;
mod views;

use axum::Router;
use axum::middleware;
use axum::routing::{get, post};
use tower::limit::ConcurrencyLimitLayer;
use tower_http::compression::CompressionLayer;
use tower_http::compression::predicate::{DefaultPredicate, NotForContentType, Predicate};

use crate::request_id::request_id;
use crate::state::{AppState, EXPLAIN_CONCURRENCY};

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health::health))
        .route("/api/v1/drugs", get(drugs::list_drugs))
        .route(
            "/api/v1/drugs/{drug_id}/neighbors",
            get(drugs::drug_neighbors),
        )
        .route("/api/v1/resolve", get(search::resolve))
        .route("/api/v1/llm/models", get(models::list_models))
        .route(
            "/api/v1/explain",
            post(explain::explain).layer(ConcurrencyLimitLayer::new(EXPLAIN_CONCURRENCY)),
        )
        // concurrency for the stream is a semaphore held for the whole body
        .route(
            "/api/v1/explain/stream",
            post(explain_stream::explain_stream),
        )
        .route(
            "/api/v1/regimens",
            get(regimens::list).post(regimens::create),
        )
        .route(
            "/api/v1/regimens/{id}",
            get(regimens::get)
                .put(regimens::update)
                .delete(regimens::delete),
        )
        .route(
            "/api/v1/overrides",
            get(regimens::audit).post(regimens::append_override),
        )
        // legacy v1 endpoints (documented, capped; not used by the current UI)
        .route("/api/v1/graph", get(graph::get_graph))
        .route("/api/v1/graph/ego", get(graph::get_ego_graph))
        .route("/api/v1/interactions/chain", get(chain::interaction_chain))
        // gzip when the client asks (`/drugs` is ~250 KB of repetitive JSON)
        // (never the NDJSON stream: gzip would buffer the deltas)
        .layer(CompressionLayer::new().compress_when(
            DefaultPredicate::new().and(NotForContentType::new("application/x-ndjson")),
        ))
        .layer(middleware::from_fn(request_id))
        .with_state(state)
}
