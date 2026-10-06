//! `/llm/models` — model chooser data: providers, models, availability
//! (Ollama discovered read-only).

use axum::Json;
use axum::extract::State;
use serde_json::{Value, json};

use crate::llm;
use crate::state::AppState;

pub async fn list_models(State(state): State<AppState>) -> Json<Value> {
    let (provider, model) = state.config.default_target();
    Json(json!({
        "default": { "provider": provider, "model": model },
        "providers": llm::list_models(&state.http, &state.config).await,
    }))
}
