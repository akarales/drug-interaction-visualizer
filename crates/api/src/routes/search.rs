//! Hybrid drug-name resolution: offline alias table first, then the live
//! RxNav fallback for brands, abbreviations and typos the table misses.

use axum::Json;
use axum::extract::{Query, State};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::error::ApiError;
use crate::state::AppState;

const MAX_QUERY_LEN: usize = 100;
/// Live lookups only for queries long enough to be meaningful.
const MIN_LIVE_QUERY_LEN: usize = 3;

#[derive(Debug, Deserialize)]
pub struct ResolveQuery {
    pub q: String,
}

pub async fn resolve(
    State(state): State<AppState>,
    Query(params): Query<ResolveQuery>,
) -> Result<Json<Value>, ApiError> {
    let q = params.q.trim();
    if q.is_empty() || q.len() > MAX_QUERY_LEN {
        return Err(ApiError::BadRequest(format!(
            "q must be 1..={MAX_QUERY_LEN} characters"
        )));
    }

    let mut matches: Vec<Value> = Vec::new();
    let push = |matches: &mut Vec<Value>, id: &str, via: &str, source: &str| {
        if matches.iter().any(|m| m["id"] == id) {
            return;
        }
        if let Ok(idx) = state.engine.index(id) {
            matches.push(json!({
                "id": id,
                "name": state.engine.drug(idx).name,
                "via": via,
                "source": source,
            }));
        }
    };

    for id in state.alias_index.lookup(q) {
        push(&mut matches, id, q, "local");
    }

    let rxnav = match (
        &state.rxnorm,
        matches.is_empty() && q.len() >= MIN_LIVE_QUERY_LEN,
    ) {
        (None, _) => "disabled",
        (Some(_), false) => "skipped",
        (Some(client), true) => match client.resolve_ingredients(q).await {
            Ok(ingredients) => {
                for ingredient in &ingredients {
                    for id in state.alias_index.lookup(ingredient) {
                        push(&mut matches, id, ingredient, "rxnav");
                    }
                }
                "ok"
            }
            Err(e) => {
                tracing::warn!(error = %e, "rxnav fallback failed");
                "unavailable"
            }
        },
    };

    Ok(Json(
        json!({ "query": q, "matches": matches, "rxnav": rxnav }),
    ))
}
