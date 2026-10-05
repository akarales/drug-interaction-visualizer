//! Integration tests: full axum router over a committed fixture dataset,
//! stub LLM backend — no GPU, no network, no Kaggle data required.

use std::path::PathBuf;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use interaction_graph::graph::InteractionGraph;
use serde_json::Value;
use tower::ServiceExt;

use drug_interaction_api::routes;
use drug_interaction_api::state::AppState;

fn fixture_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/mini_dataset.json")
}

fn test_state() -> AppState {
    let config = drug_interaction_api::config::Config {
        dataset_path: fixture_path(),
        llm_stub: true,
        ollama_url: "http://localhost:11434".to_string(),
        ollama_model: "qwen3:14b".to_string(),
        port: 0,
    };
    let dataset = std::fs::read_to_string(fixture_path()).expect("fixture exists");
    let engine = InteractionGraph::from_json(&dataset).expect("fixture is valid");
    AppState::new(config, engine)
}

async fn get(path: &str) -> (StatusCode, Value) {
    let app = routes::router(test_state());
    let response = app
        .oneshot(
            Request::get(path)
                .body(Body::empty())
                .expect("request builds"),
        )
        .await
        .expect("in-process request succeeds");
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("body reads");
    let body: Value = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).expect("json body")
    };
    (status, body)
}

async fn post_json(path: &str, payload: Value) -> (StatusCode, Value) {
    let app = routes::router(test_state());
    let response = app
        .oneshot(
            Request::post(path)
                .header("content-type", "application/json")
                .body(Body::from(payload.to_string()))
                .expect("request builds"),
        )
        .await
        .expect("in-process request succeeds");
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("body reads");
    (status, serde_json::from_slice(&bytes).expect("json body"))
}

#[tokio::test]
async fn health_ok() {
    let (status, body) = get("/health").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["status"], "ok");
    assert!(body["version"].is_string());
}

#[tokio::test]
async fn graph_top_subgraph_reports_full_stats() {
    let (status, body) = get("/api/v1/graph?top=3").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body["nodes"].as_array().expect("nodes").len(),
        3,
        "top=3 keeps only 3 nodes"
    );
    assert_eq!(body["stats"]["drugs"], 8, "stats describe the full fixture");
}

#[tokio::test]
async fn graph_full_when_top_zero() {
    let (status, body) = get("/api/v1/graph?top=0").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["nodes"].as_array().expect("nodes").len(), 8);
}

#[tokio::test]
async fn ego_graph_one_hop() {
    let (status, body) = get("/api/v1/graph/ego?drug=warfarin&hops=1").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["center"], "warfarin");
    assert_eq!(body["nodes"].as_array().expect("nodes").len(), 5);
}

#[tokio::test]
async fn ego_graph_rejects_bad_hops() {
    let (status, _) = get("/api/v1/graph/ego?drug=warfarin&hops=9").await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn drugs_list_sorted_by_degree() {
    let (status, body) = get("/api/v1/drugs").await;
    assert_eq!(status, StatusCode::OK);
    let drugs = body["drugs"].as_array().expect("drugs");
    assert_eq!(drugs.len(), 8);
    assert_eq!(drugs[0]["id"], "warfarin", "highest-degree drug first");
}

#[tokio::test]
async fn neighbors_include_mechanism() {
    let (status, body) = get("/api/v1/drugs/warfarin/neighbors").await;
    assert_eq!(status, StatusCode::OK);
    let neighbors = body["neighbors"].as_array().expect("neighbors");
    assert_eq!(neighbors.len(), 4);
    assert!(neighbors.iter().all(|n| n["mechanism"].is_string()));
}

#[tokio::test]
async fn neighbors_unknown_drug_404() {
    let (status, body) = get("/api/v1/drugs/not-a-drug/neighbors").await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert!(body["error"].as_str().unwrap().contains("not-a-drug"));
}

#[tokio::test]
async fn chain_two_hops_via_amiodarone() {
    let (status, body) =
        get("/api/v1/interactions/chain?from=warfarin&to=simvastatin&max_hops=3").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["connected"], true);
    let steps = body["steps"].as_array().expect("steps");
    assert_eq!(steps.len(), 2);
    assert_eq!(steps[0]["from"], "warfarin");
    assert_eq!(steps[1]["to"], "simvastatin");
}

#[tokio::test]
async fn chain_unconnected_within_one_hop() {
    let (status, body) =
        get("/api/v1/interactions/chain?from=warfarin&to=simvastatin&max_hops=1").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["connected"], false);
}

#[tokio::test]
async fn explain_direct_pair_stub() {
    let (status, body) = post_json(
        "/api/v1/explain",
        serde_json::json!({"drug_a": "warfarin", "drug_b": "aspirin"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["direct_interaction"], true);
    assert_eq!(body["chain_length"], 1);
    assert_eq!(body["stub"], true);
    assert!(
        body["disclaimer"]
            .as_str()
            .unwrap()
            .to_lowercase()
            .contains("not medical advice")
    );
    assert!(body["payload"]["explanation"].is_string());
}

#[tokio::test]
async fn explain_indirect_pair_stub() {
    let (status, body) = post_json(
        "/api/v1/explain",
        serde_json::json!({"drug_a": "warfarin", "drug_b": "simvastatin", "max_hops": 3}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["direct_interaction"], false);
    assert_eq!(body["chain_length"], 2);
}

#[tokio::test]
async fn explain_unknown_drug_404() {
    let (status, _) = post_json(
        "/api/v1/explain",
        serde_json::json!({"drug_a": "warfarin", "drug_b": "unknown-drug"}),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}
