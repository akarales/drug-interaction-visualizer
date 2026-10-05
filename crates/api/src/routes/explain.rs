//! LLM explanation endpoint: build interaction context from the engine
//! (all in-memory, synchronous), delegate to the LLM layer (stub by
//! default), always attach the disclaimer.

use std::collections::HashMap;

use axum::Json;
use axum::extract::State;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::error::ApiError;
use crate::llm;
use crate::state::AppState;

const DISCLAIMER: &str = "Demo output from DrugBank-derived public data. \
Not medical advice. Always consult a physician or pharmacist.";

#[derive(Debug, Deserialize)]
pub struct ExplainRequest {
    pub drug_a: String,
    pub drug_b: String,
    #[serde(default = "default_max_hops")]
    pub max_hops: usize,
}

fn default_max_hops() -> usize {
    3
}

fn drug_names(state: &AppState) -> HashMap<String, String> {
    state
        .engine
        .drugs()
        .into_iter()
        .map(|(drug, _)| (drug.id, drug.name))
        .collect()
}

/// (direct?, chain_length, prompt context)
fn build_context(
    state: &AppState,
    request: &ExplainRequest,
) -> Result<(bool, usize, String), ApiError> {
    // Unknown drugs -> 404 before any LLM work.
    state
        .engine
        .degree(&request.drug_a)
        .map_err(|e| ApiError::UnknownDrug(e.to_string()))?;
    state
        .engine
        .degree(&request.drug_b)
        .map_err(|e| ApiError::UnknownDrug(e.to_string()))?;

    let names = drug_names(state);

    let direct = state
        .engine
        .neighbors(&request.drug_a)
        .map_err(|e| ApiError::UnknownDrug(e.to_string()))?
        .into_iter()
        .find(|n| n.drug.id == request.drug_b);

    if let Some(neighbor) = direct {
        let interaction = neighbor.interaction;
        let context = format!(
            "Drug A: {}\nDrug B: {}\nKnown direct interaction: {}, direction {}, \
severity {}.\nMechanism: {}\nEvidence: {}\nExplain this interaction in plain \
language: what happens, why, and what a patient should watch for.",
            names
                .get(&request.drug_a)
                .map(String::as_str)
                .unwrap_or(&request.drug_a),
            names
                .get(&request.drug_b)
                .map(String::as_str)
                .unwrap_or(&request.drug_b),
            interaction.kind,
            interaction.direction,
            interaction.severity,
            interaction.mechanism,
            interaction.evidence,
        );
        return Ok((true, 1, context));
    }

    let chain = state
        .engine
        .interaction_chain(&request.drug_a, &request.drug_b, request.max_hops)
        .map_err(|e| ApiError::UnknownDrug(e.to_string()))?;

    if let Some(steps) = &chain.filter(|steps| !steps.is_empty()) {
        let mut walked = vec![
            names
                .get(&request.drug_a)
                .cloned()
                .unwrap_or_else(|| request.drug_a.clone()),
        ];
        for step in steps {
            walked.push(
                names
                    .get(&step.to)
                    .cloned()
                    .unwrap_or_else(|| step.to.clone()),
            );
        }
        let context = format!(
            "Drug A: {}\nDrug B: {}\nThere is no direct interaction, but there \
is an indirect chain of {} interaction(s): {}.\nExplain in plain language how \
these drugs can affect each other indirectly and what to watch for.",
            names
                .get(&request.drug_a)
                .map(String::as_str)
                .unwrap_or(&request.drug_a),
            names
                .get(&request.drug_b)
                .map(String::as_str)
                .unwrap_or(&request.drug_b),
            steps.len(),
            walked.join(" -> "),
        );
        return Ok((false, steps.len(), context));
    }

    let context = format!(
        "Drug A: {}\nDrug B: {}\nNo known interaction between these drugs in the \
dataset. Explain what that does and does not mean, and general safe-medication \
advice.",
        names
            .get(&request.drug_a)
            .map(String::as_str)
            .unwrap_or(&request.drug_a),
        names
            .get(&request.drug_b)
            .map(String::as_str)
            .unwrap_or(&request.drug_b),
    );
    Ok((false, 0, context))
}

pub async fn explain(
    State(state): State<AppState>,
    Json(request): Json<ExplainRequest>,
) -> Result<Json<Value>, ApiError> {
    if request.max_hops == 0 || request.max_hops > 5 {
        return Err(ApiError::BadRequest(
            "max_hops must be between 1 and 5".into(),
        ));
    }
    let (direct, chain_length, context) = build_context(&state, &request)?;

    let payload = llm::explain(&state.http, &state.config, &context).await?;
    let stub = state.config.llm_stub;
    Ok(Json(json!({
        "drug_a": request.drug_a,
        "drug_b": request.drug_b,
        "direct_interaction": direct,
        "chain_length": chain_length,
        "payload": payload,
        "model": if stub { "stub" } else { state.config.ollama_model.as_str() },
        "stub": stub,
        "disclaimer": DISCLAIMER,
    })))
}
