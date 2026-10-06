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
    state_with(|_| {})
}

fn state_with(customize: impl FnOnce(&mut drug_interaction_api::config::Config)) -> AppState {
    let mut config = drug_interaction_api::config::Config {
        dataset_path: fixture_path(),
        llm_stub: true,
        llm_provider: drug_interaction_api::config::LlmProvider::Ollama,
        ollama_url: "http://localhost:11434".to_string(),
        ollama_model: "qwen3:14b".to_string(),
        anthropic_url: "https://api.anthropic.com".to_string(),
        anthropic_model: "claude-sonnet-5-5".to_string(),
        anthropic_api_key: None,
        ollama_keep_alive: "2m".to_string(),
        rxnav_url: None,
        aliases_path: PathBuf::from("does-not-exist.json"),
        port: 0,
        database_url: None,
    };
    customize(&mut config);
    let dataset = std::fs::read_to_string(fixture_path()).expect("fixture exists");
    let engine = InteractionGraph::from_json(&dataset).expect("fixture is valid");
    AppState::new(config, engine)
}

async fn get(path: &str) -> (StatusCode, Value) {
    get_with(test_state(), path).await
}

async fn get_with(state: AppState, path: &str) -> (StatusCode, Value) {
    let app = routes::router(state);
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
async fn graph_top_is_clamped_never_full() {
    let (status, body) = get("/api/v1/graph?top=0").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body["nodes"].as_array().expect("nodes").len(),
        1,
        "top=0 no longer means the full graph"
    );
    let (_, body) = get("/api/v1/graph?top=999999").await;
    assert_eq!(body["nodes"].as_array().expect("nodes").len(), 8);
}

#[tokio::test]
async fn ego_graph_caps_hops_at_two() {
    let (status, _) = get("/api/v1/graph/ego?drug=warfarin&hops=3").await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
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
    assert_eq!(body["stats"]["interactions"], 7);
    assert_eq!(body["stats"]["severity_mix"]["severe"], 1);
    assert_eq!(
        drugs[0]["severity_mix"],
        serde_json::json!([0, 1, 3, 0]),
        "warfarin: 1 severe (aspirin) + 3 moderate"
    );
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
    assert_eq!(body["error"], "unknown drug id: not-a-drug");
    assert_eq!(body["code"], "unknown_drug");
}

#[tokio::test]
async fn bad_request_carries_a_stable_code() {
    let (status, body) = get("/api/v1/graph/ego?drug=warfarin&hops=9").await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["code"], "bad_request");
}

#[tokio::test]
async fn every_response_has_a_request_id() {
    let send = |id: Option<&str>| {
        let mut req = Request::get("/health");
        if let Some(id) = id {
            req = req.header("x-request-id", id);
        }
        routes::router(test_state()).oneshot(req.body(Body::empty()).expect("request builds"))
    };
    let generated = send(None).await.expect("request succeeds");
    let id = generated.headers()["x-request-id"].to_str().expect("ascii");
    assert!(!id.is_empty());
    let echoed = send(Some("trace-abc_1")).await.expect("request succeeds");
    assert_eq!(echoed.headers()["x-request-id"], "trace-abc_1");
    let replaced = send(Some("bad id with spaces"))
        .await
        .expect("request succeeds");
    assert_ne!(replaced.headers()["x-request-id"], "bad id with spaces");
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

/// Minimal fake RxNav: "coumadn" → brand rxcui 202421 → ingredient warfarin.
async fn fake_rxnav() -> String {
    use axum::Router;
    use axum::routing::get as route_get;
    let app = Router::new()
        .route(
            "/REST/approximateTerm.json",
            route_get(|| async {
                axum::Json(serde_json::json!({
                    "approximateGroup": {"candidate": [{"rxcui": "202421"}]}
                }))
            }),
        )
        .route(
            "/REST/rxcui/{id}/related.json",
            route_get(|| async {
                axum::Json(serde_json::json!({"relatedGroup": {"conceptGroup": [
                    {"tty": "IN", "conceptProperties": [{"name": "warfarin"}]},
                    {"tty": "BN", "conceptProperties": [{"name": "Coumadin"}]}
                ]}}))
            }),
        );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind fake rxnav");
    let addr = listener.local_addr().expect("local addr");
    tokio::spawn(async move { axum::serve(listener, app).await.expect("serve") });
    format!("http://{addr}")
}

#[tokio::test]
async fn resolve_local_name_without_network() {
    let (status, body) = get("/api/v1/resolve?q=Warfarin").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["matches"][0]["id"], "warfarin");
    assert_eq!(body["matches"][0]["source"], "local");
    assert_eq!(body["rxnav"], "disabled");
}

#[tokio::test]
async fn resolve_falls_back_to_rxnav_for_typos() {
    let url = fake_rxnav().await;
    let state = state_with(|c| c.rxnav_url = Some(url));
    let (status, body) = get_with(state, "/api/v1/resolve?q=coumadn").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["rxnav"], "ok");
    assert_eq!(body["matches"][0]["id"], "warfarin");
    assert_eq!(body["matches"][0]["source"], "rxnav");
}

#[tokio::test]
async fn resolve_rejects_empty_query() {
    let (status, _) = get("/api/v1/resolve?q=%20").await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn models_lists_providers_without_mutating_ollama() {
    let state = state_with(|c| c.ollama_url = "http://127.0.0.1:9".to_string());
    let (status, body) = get_with(state, "/api/v1/llm/models").await;
    assert_eq!(status, StatusCode::OK);
    let providers = body["providers"].as_array().expect("providers");
    let find = |p: &str| {
        providers
            .iter()
            .find(|x| x["provider"] == p)
            .expect("provider")
    };
    assert_eq!(find("anthropic")["available"], false, "no key in tests");
    assert_eq!(
        find("ollama")["available"],
        false,
        "unreachable ollama is reported, not fatal"
    );
    assert_eq!(find("stub")["available"], true);
    assert_eq!(body["default"]["provider"], "stub");
}

#[tokio::test]
async fn explain_rejects_unavailable_model_choice() {
    let (status, _) = post_json(
        "/api/v1/explain",
        serde_json::json!({"drug_a": "warfarin", "drug_b": "aspirin",
                           "provider": "anthropic", "model": "claude-sonnet-5-5"}),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "no API key configured in tests"
    );
}

#[tokio::test]
async fn explain_returns_dataset_severity() {
    let (_, body) = post_json(
        "/api/v1/explain",
        serde_json::json!({"drug_a": "warfarin", "drug_b": "aspirin", "provider": "stub"}),
    )
    .await;
    assert_eq!(body["dataset_severity"], "severe");
    assert_eq!(body["provider"], "stub");
    assert_eq!(
        body["audience"], "both",
        "clinician + patient handout by default"
    );
    assert!(body["sections"]["clinician"]["explanation"].is_string());
    assert!(body["sections"]["patient"]["explanation"].is_string());
}

#[tokio::test]
async fn drugs_are_gzipped_and_cacheable() {
    let response = routes::router(test_state())
        .oneshot(
            Request::get("/api/v1/drugs")
                .header("accept-encoding", "gzip")
                .body(Body::empty())
                .expect("request builds"),
        )
        .await
        .expect("in-process request succeeds");
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["content-encoding"], "gzip");
    assert_eq!(response.headers()["cache-control"], "public, max-age=300");
}

#[tokio::test]
async fn uncompressed_when_not_requested() {
    let response = routes::router(test_state())
        .oneshot(
            Request::get("/api/v1/drugs")
                .body(Body::empty())
                .expect("request builds"),
        )
        .await
        .expect("in-process request succeeds");
    assert!(response.headers().get("content-encoding").is_none());
}

#[tokio::test]
async fn neighbors_carry_fda_direction_only_when_established() {
    let (status, body) = get("/api/v1/drugs/warfarin/neighbors").await;
    assert_eq!(status, StatusCode::OK);
    let neighbors = body["neighbors"].as_array().expect("neighbors");
    let by_id = |id: &str| {
        neighbors
            .iter()
            .find(|n| n["id"] == id)
            .expect("neighbor present")
    };

    let fluconazole = &by_id("fluconazole")["roles"];
    assert_eq!(fluconazole["pattern"], "directed");
    let link = &fluconazole["links"][0];
    assert_eq!(link["precipitant"], "fluconazole");
    assert_eq!(link["object"], "warfarin");
    assert_eq!(link["pathway"], "CYP2C9");
    assert_eq!(link["effect"], "inhibits");

    // no FDA roles for the pair → no direction field at all (unknown, never guessed)
    assert!(by_id("aspirin").get("roles").is_none());
}

#[tokio::test]
async fn drugs_list_cites_the_direction_source() {
    let (_, body) = get("/api/v1/drugs").await;
    assert!(
        body["sources"]["direction"]["url"]
            .as_str()
            .expect("url")
            .starts_with("https://www.fda.gov/")
    );
    assert_eq!(body["sources"]["direction"]["content_date"], "2026-05-29");
}

async fn post_stream(state: AppState, payload: Value, gzip: bool) -> axum::response::Response {
    let mut req =
        Request::post("/api/v1/explain/stream").header("content-type", "application/json");
    if gzip {
        req = req.header("accept-encoding", "gzip");
    }
    routes::router(state)
        .oneshot(
            req.body(Body::from(payload.to_string()))
                .expect("request builds"),
        )
        .await
        .expect("in-process request succeeds")
}

#[tokio::test]
async fn explain_stream_sends_start_deltas_then_validated_done() {
    // warfarin + aspirin is SEVERE in the dataset; the stub model says "moderate"
    let response = post_stream(
        test_state(),
        serde_json::json!({"drug_a": "warfarin", "drug_b": "aspirin"}),
        true,
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["content-type"], "application/x-ndjson");
    assert!(
        response.headers().get("content-encoding").is_none(),
        "never gzipped: gzip buffers deltas"
    );
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("body reads");
    let events: Vec<Value> = std::str::from_utf8(&bytes)
        .expect("utf-8")
        .lines()
        .map(|l| serde_json::from_str(l).expect("each line is JSON"))
        .collect();

    let first = &events[0];
    assert_eq!(first["type"], "start");
    assert!(
        first["disclaimer"]
            .as_str()
            .expect("disclaimer")
            .contains("Not medical advice")
    );
    assert_eq!(first["dataset_severity"], "severe");

    let streamed: String = events
        .iter()
        .filter(|e| e["type"] == "delta" && e["field"] == "clinician.explanation")
        .map(|e| e["text"].as_str().expect("text"))
        .collect();
    assert!(
        events.iter().filter(|e| e["type"] == "delta").count() > 3,
        "arrives progressively"
    );

    let done = events.last().expect("events");
    assert_eq!(done["type"], "done");
    assert_eq!(
        done["sections"]["clinician"]["explanation"],
        streamed.as_str()
    );
    // dataset severity wins over the model in the final payload
    assert_eq!(done["sections"]["clinician"]["severity"], "severe");
    assert_eq!(done["sections"]["patient"]["severity"], "severe");
}

#[tokio::test]
async fn explain_stream_validates_before_streaming() {
    let response = post_stream(
        test_state(),
        serde_json::json!({"drug_a": "warfarin", "drug_b": "nope"}),
        false,
    )
    .await;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    assert_eq!(response.headers()["content-type"], "application/json");
}

#[tokio::test]
async fn cancelled_stream_releases_its_model_slot() {
    let state = test_state();
    let permits = state.explain_permits.clone();
    let total = permits.available_permits();
    let response = post_stream(
        state,
        serde_json::json!({"drug_a": "warfarin", "drug_b": "fluconazole"}),
        false,
    )
    .await;
    let mut body = response.into_body().into_data_stream();
    use futures_util::StreamExt;
    let first = body.next().await.expect("first chunk").expect("ok");
    assert!(
        std::str::from_utf8(&first)
            .expect("utf-8")
            .contains("\"start\"")
    );
    assert!(
        permits.available_permits() < total,
        "the stream holds a slot while running"
    );
    drop(body); // the browser pressed Stop
    for _ in 0..100 {
        if permits.available_permits() == total {
            return;
        }
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    }
    panic!("the model slot was not released after the client disconnected");
}
