//! Saved regimens + override audit through the real router, in-memory store.

use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use drug_interaction_api::config::{Config, LlmProvider};
use drug_interaction_api::routes;
use drug_interaction_api::state::AppState;
use interaction_graph::graph::InteractionGraph;
use serde_json::{Value, json};
use tower::ServiceExt;

const DATASET: &str = r#"{
  "drugs": [
    {"id": "clarithromycin", "name": "Clarithromycin", "category": "metabolism"},
    {"id": "simvastatin", "name": "Simvastatin", "category": "exposure"},
    {"id": "warfarin", "name": "Warfarin", "category": "activity:anticoagulant"}
  ],
  "interactions": [
    {"from": "clarithromycin", "to": "simvastatin", "kind": "exposure", "direction": "increase",
     "severity": "contraindicated", "severity_basis": "onc:11", "mechanism": "m", "evidence": "e"},
    {"from": "clarithromycin", "to": "warfarin", "kind": "activity:anticoagulant", "direction": "increase",
     "severity": "severe", "severity_basis": "kind:anticoagulant", "mechanism": "m", "evidence": "e"}
  ]
}"#;

fn app() -> axum::Router {
    let config = Config {
        dataset_path: "unused".into(),
        llm_stub: true,
        llm_provider: LlmProvider::Stub,
        ollama_url: String::new(),
        ollama_model: String::new(),
        anthropic_url: String::new(),
        anthropic_model: String::new(),
        anthropic_api_key: None,
        ollama_keep_alive: "2m".into(),
        rxnav_url: None,
        aliases_path: "does-not-exist.json".into(),
        port: 0,
        database_url: None,
    };
    let engine = InteractionGraph::from_json(DATASET).expect("inline dataset is valid");
    routes::router(AppState::new(config, engine))
}

async fn call(
    app: &axum::Router,
    method: Method,
    path: &str,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let mut req = Request::builder().method(method).uri(path);
    if body.is_some() {
        req = req.header("content-type", "application/json");
    }
    let req = req
        .body(body.map_or_else(Body::empty, |b| Body::from(b.to_string())))
        .expect("request builds");
    let response = app
        .clone()
        .oneshot(req)
        .await
        .expect("in-process request succeeds");
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("body reads");
    let value = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).expect("json body")
    };
    (status, value)
}

#[tokio::test]
async fn save_open_update_and_soft_delete_a_regimen() {
    let app = app();
    let (status, body) = call(
        &app,
        Method::POST,
        "/api/v1/regimens",
        Some(json!({
            "label": "Statin switch review",
            "drug_ids": ["simvastatin", "clarithromycin", "simvastatin"],
            "overrides": [{"drug_a": "simvastatin", "drug_b": "clarithromycin", "reason": "Short course, statin paused"}]
        })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let id = body["regimen"]["id"].as_str().expect("id").to_string();
    // order kept, duplicates dropped; the dataset build is recorded
    assert_eq!(
        body["regimen"]["drug_ids"],
        json!(["simvastatin", "clarithromycin"])
    );
    assert_eq!(body["regimen"]["dataset_version"], "ddi:3:2");
    // the override is stored with the SERVER's facts and an ordered pair key
    let event = &body["audit"][0];
    assert_eq!(
        (event["drug_a"].as_str(), event["drug_b"].as_str()),
        (Some("clarithromycin"), Some("simvastatin"))
    );
    assert_eq!(event["severity"], "contraindicated");
    assert_eq!(event["severity_basis"], "onc:11");
    assert_eq!(event["actor"], "demo-clinician");

    let (status, body) = call(&app, Method::GET, &format!("/api/v1/regimens/{id}"), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["active_overrides"].as_array().map(Vec::len), Some(1));
    assert_eq!(body["current_dataset"], true);

    let (status, body) = call(
        &app,
        Method::PUT,
        &format!("/api/v1/regimens/{id}"),
        Some(json!({"label": "Statin switch v2", "drug_ids": ["warfarin", "clarithromycin"]})),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["regimen"]["label"], "Statin switch v2");

    let (status, _) = call(
        &app,
        Method::DELETE,
        &format!("/api/v1/regimens/{id}"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (status, body) = call(&app, Method::GET, &format!("/api/v1/regimens/{id}"), None).await;
    assert_eq!(
        (status, body["code"].as_str()),
        (StatusCode::NOT_FOUND, Some("not_found"))
    );
    let (_, body) = call(&app, Method::GET, "/api/v1/regimens", None).await;
    assert_eq!(body["regimens"], json!([]));
    // soft delete keeps the audit trail
    let (_, body) = call(
        &app,
        Method::GET,
        &format!("/api/v1/overrides?regimen_id={id}"),
        None,
    )
    .await;
    assert_eq!(body["events"].as_array().map(Vec::len), Some(1));
}

#[tokio::test]
async fn revoking_ends_an_override_but_keeps_both_events() {
    let app = app();
    let (_, body) = call(
        &app,
        Method::POST,
        "/api/v1/regimens",
        Some(json!({"label": "Revoke demo", "drug_ids": ["clarithromycin", "simvastatin"]})),
    )
    .await;
    let id = body["regimen"]["id"].as_str().expect("id").to_string();
    for (action, reason) in [
        ("override", "Specialist recommendation"),
        ("revoke", "Course finished early"),
    ] {
        let (status, _) = call(
            &app,
            Method::POST,
            "/api/v1/overrides",
            Some(json!({"regimen_id": id, "drug_a": "clarithromycin", "drug_b": "simvastatin", "action": action, "reason": reason})),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);
    }
    let (_, body) = call(&app, Method::GET, &format!("/api/v1/regimens/{id}"), None).await;
    assert_eq!(body["audit"].as_array().map(Vec::len), Some(2));
    assert_eq!(body["active_overrides"], json!([]));
}

#[tokio::test]
async fn rejects_identifiers_unknown_drugs_and_needless_overrides() {
    let app = app();
    let bad_label = json!({"label": "Jane D, DOB 03/14/1961", "drug_ids": ["warfarin"]});
    let (status, body) = call(&app, Method::POST, "/api/v1/regimens", Some(bad_label)).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(
        body["error"]
            .as_str()
            .unwrap_or_default()
            .contains("synthetic data only")
    );

    let unknown = json!({"label": "Ok", "drug_ids": ["not-a-drug"]});
    let (status, body) = call(&app, Method::POST, "/api/v1/regimens", Some(unknown)).await;
    assert_eq!(
        (status, body["code"].as_str()),
        (StatusCode::NOT_FOUND, Some("unknown_drug"))
    );

    // severe ≠ contraindicated: no override needed (or accepted)
    let needless = json!({"drug_a": "warfarin", "drug_b": "clarithromycin", "reason": "Because"});
    let (status, _) = call(&app, Method::POST, "/api/v1/overrides", Some(needless)).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    let ghost = json!({"regimen_id": "00000000-0000-4000-8000-000000000000",
                       "drug_a": "clarithromycin", "drug_b": "simvastatin", "reason": "Specialist advice"});
    let (status, _) = call(&app, Method::POST, "/api/v1/overrides", Some(ghost)).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn unsaved_overrides_are_audited_too() {
    let app = app();
    let body = json!({"drug_a": "simvastatin", "drug_b": "clarithromycin", "reason": "Benefit outweighs risk"});
    let (status, created) = call(&app, Method::POST, "/api/v1/overrides", Some(body)).await;
    assert_eq!(status, StatusCode::CREATED);
    assert!(created["event"]["regimen_id"].is_null());
    let (_, body) = call(&app, Method::GET, "/api/v1/overrides", None).await;
    assert_eq!(body["events"].as_array().map(Vec::len), Some(1));
}
