//! Saved regimens (`/regimens`) and the append-only override audit
//! (`/overrides`). Shared `?meds=` links never carry overrides; a saved
//! regimen brings back the overrides decided on it (latest event per pair).

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use super::validate;
use crate::error::ApiError;
use crate::state::AppState;
use crate::store::{NewOverrideEvent, OverrideAction, RegimenInput, active_overrides};

const AUDIT_LIMIT: i64 = 200;

#[derive(Debug, Deserialize)]
pub struct RegimenBody {
    pub label: String,
    pub drug_ids: Vec<String>,
    /// overrides decided before saving (attached in the same transaction)
    #[serde(default)]
    pub overrides: Vec<OverrideBody>,
}

#[derive(Debug, Deserialize)]
pub struct OverrideBody {
    #[serde(default)]
    pub regimen_id: Option<Uuid>,
    pub drug_a: String,
    pub drug_b: String,
    #[serde(default = "default_action")]
    pub action: OverrideAction,
    pub reason: String,
}

fn default_action() -> OverrideAction {
    OverrideAction::Override
}

#[derive(Debug, Deserialize)]
pub struct AuditQuery {
    pub regimen_id: Option<Uuid>,
}

/// Validate an override and stamp it with the dataset's facts for the pair
/// (the server's severity, never the client's).
fn override_event(
    state: &AppState,
    body: &OverrideBody,
    regimen_id: Option<Uuid>,
) -> Result<NewOverrideEvent, ApiError> {
    let (a, b) = if body.drug_a < body.drug_b {
        (&body.drug_a, &body.drug_b)
    } else {
        (&body.drug_b, &body.drug_a)
    };
    if a == b {
        return Err(ApiError::BadRequest(
            "an override needs two different drugs".into(),
        ));
    }
    let pair = state
        .engine
        .neighbors(a)?
        .into_iter()
        .find(|n| n.drug.id == *b);
    state.engine.index(b)?;
    let Some(pair) = pair else {
        return Err(ApiError::BadRequest(format!(
            "{a} + {b} has no interaction in this dataset to override"
        )));
    };
    if body.action == OverrideAction::Override && pair.interaction.severity != "contraindicated" {
        return Err(ApiError::BadRequest(format!(
            "only contraindicated pairs need an override ({a} + {b} is {})",
            pair.interaction.severity
        )));
    }
    Ok(NewOverrideEvent {
        regimen_id,
        drug_a: a.clone(),
        drug_b: b.clone(),
        action: body.action,
        reason: validate::reason(&body.reason)?,
        severity: pair.interaction.severity,
        severity_basis: pair.interaction.severity_basis,
    })
}

fn input(state: &AppState, body: &RegimenBody) -> Result<RegimenInput, ApiError> {
    Ok(RegimenInput {
        label: validate::label(&body.label)?,
        drug_ids: validate::drug_ids(state, &body.drug_ids)?,
    })
}

pub async fn list(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    let regimens = state.store.list_regimens().await?;
    Ok(Json(
        json!({ "store": state.store.kind(), "regimens": regimens }),
    ))
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<RegimenBody>,
) -> Result<impl IntoResponse, ApiError> {
    let input = input(&state, &body)?;
    let overrides = body
        .overrides
        .iter()
        .map(|o| override_event(&state, o, None))
        .collect::<Result<Vec<_>, _>>()?;
    let (regimen, audit) = state
        .store
        .create_regimen(input, &state.dataset_version(), overrides)
        .await?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "regimen": regimen, "audit": audit })),
    ))
}

/// A saved regimen, its full audit trail and the overrides in force.
pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    let regimen = state.store.get_regimen(id).await?;
    let audit = state.store.list_overrides(Some(id), AUDIT_LIMIT).await?;
    let active = active_overrides(&audit);
    Ok(Json(json!({
        "regimen": regimen,
        "audit": audit,
        "active_overrides": active,
        "current_dataset": regimen.dataset_version == state.dataset_version(),
    })))
}

pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(body): Json<RegimenBody>,
) -> Result<Json<Value>, ApiError> {
    let regimen = state
        .store
        .update_regimen(id, input(&state, &body)?)
        .await?;
    Ok(Json(json!({ "regimen": regimen })))
}

pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    state.store.delete_regimen(id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Append one override / revoke event (never updates or deletes).
pub async fn append_override(
    State(state): State<AppState>,
    Json(body): Json<OverrideBody>,
) -> Result<impl IntoResponse, ApiError> {
    let event = override_event(&state, &body, body.regimen_id)?;
    let event = state.store.append_override(event).await?;
    Ok((StatusCode::CREATED, Json(json!({ "event": event }))))
}

pub async fn audit(
    State(state): State<AppState>,
    Query(q): Query<AuditQuery>,
) -> Result<Json<Value>, ApiError> {
    let events = state
        .store
        .list_overrides(q.regimen_id, AUDIT_LIMIT)
        .await?;
    Ok(Json(json!({ "events": events })))
}
