//! LLM explanation endpoint: build interaction context from the engine
//! (all in-memory, synchronous), delegate to the LLM layer (stub by
//! default), always attach the disclaimer.

use std::collections::HashMap;

use axum::Json;
use axum::extract::State;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::config::LlmProvider;
use crate::error::ApiError;
use crate::llm::{self, Audience};
use crate::state::AppState;

const DISCLAIMER: &str = "Demo output from DrugBank-derived public data. \
Not medical advice. Always consult a physician or pharmacist.";

#[derive(Debug, Deserialize)]
pub struct ExplainRequest {
    pub drug_a: String,
    pub drug_b: String,
    #[serde(default = "default_max_hops")]
    pub max_hops: usize,
    /// Model chooser: provider (`stub` | `ollama` | `anthropic`); server default when absent.
    #[serde(default)]
    pub provider: Option<LlmProvider>,
    /// Model id within the provider; the provider's configured default when absent.
    #[serde(default)]
    pub model: Option<String>,
    /// `both` (default: clinician section + patient handout draft in one
    /// call), `clinician` or `patient`.
    #[serde(default)]
    pub audience: Audience,
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

/// Prompt context plus the dataset facts the UI shows next to model text.
struct Context {
    direct: bool,
    chain_length: usize,
    /// Dataset severity of the direct interaction — authoritative over the model.
    severity: Option<String>,
    severity_basis: Option<String>,
    prompt: String,
}

fn build_context(state: &AppState, request: &ExplainRequest) -> Result<Context, ApiError> {
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
        let prompt = format!(
            "Drug A: {}\nDrug B: {}\nKnown direct interaction: {}, direction {}, \
severity {}.\nMechanism: {}\nEvidence: {}\nTask: explain this interaction.",
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
        return Ok(Context {
            direct: true,
            chain_length: 1,
            severity: Some(interaction.severity.clone()),
            severity_basis: Some(interaction.severity_basis.clone()),
            prompt,
        });
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
        let prompt = format!(
            "Drug A: {}\nDrug B: {}\nThere is no direct interaction, but there \
is an indirect chain of {} interaction(s): {}.\nTask: explain how these drugs \
could affect each other indirectly through this chain and how relevant that is.",
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
        return Ok(Context {
            direct: false,
            chain_length: steps.len(),
            severity: None,
            severity_basis: None,
            prompt,
        });
    }

    let prompt = format!(
        "Drug A: {}\nDrug B: {}\nNo interaction between these drugs was found in \
this dataset.\nTask: state only that no interaction was found in this dataset \
and that absence from one pairwise dataset does not establish safety (dose, \
patient factors and multi-drug effects are not covered).",
        names
            .get(&request.drug_a)
            .map(String::as_str)
            .unwrap_or(&request.drug_a),
        names
            .get(&request.drug_b)
            .map(String::as_str)
            .unwrap_or(&request.drug_b),
    );
    Ok(Context {
        direct: false,
        chain_length: 0,
        severity: None,
        severity_basis: None,
        prompt,
    })
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
    let context = build_context(&state, &request)?;

    let (default_provider, default_model) = state.config.default_target();
    let provider = request.provider.unwrap_or(default_provider);
    let model = match (&request.model, provider) {
        (Some(model), _) => model.clone(),
        (None, p) if p == default_provider => default_model,
        (None, LlmProvider::Stub) => "stub".to_string(),
        (None, LlmProvider::Ollama) => state.config.ollama_model.clone(),
        (None, LlmProvider::Anthropic) => state.config.anthropic_model.clone(),
    };
    llm::validate_choice(&state.http, &state.config, provider, &model).await?;

    let sections = llm::explain(
        &state.http,
        &state.config,
        provider,
        &model,
        request.audience,
        &context.prompt,
    )
    .await?;
    Ok(Json(json!({
        "drug_a": request.drug_a,
        "drug_b": request.drug_b,
        "direct_interaction": context.direct,
        "chain_length": context.chain_length,
        "dataset_severity": context.severity,
        "severity_basis": context.severity_basis,
        // `payload` kept for API consumers that read a single section
        "payload": sections.clinician.as_ref().or(sections.patient.as_ref()),
        "sections": sections,
        "provider": provider,
        "model": model,
        "audience": request.audience,
        "stub": provider == LlmProvider::Stub,
        "disclaimer": DISCLAIMER,
    })))
}

/// Model chooser data: providers, models, availability (Ollama read-only).
pub async fn list_models(State(state): State<AppState>) -> Json<Value> {
    let (provider, model) = state.config.default_target();
    Json(json!({
        "default": { "provider": provider, "model": model },
        "providers": llm::list_models(&state.http, &state.config).await,
    }))
}
