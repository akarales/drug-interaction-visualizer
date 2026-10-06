//! LLM explanation endpoint: build interaction context from the engine
//! (all in-memory, synchronous), delegate to the LLM layer (stub by
//! default), always attach the disclaimer.

use axum::Json;
use axum::extract::State;
use serde::Deserialize;
use serde_json::{Value, json};

use interaction_graph::roles::{self, Effect};

use super::chain::{default_max_hops, validate_max_hops};
use crate::config::LlmProvider;
use crate::error::ApiError;
use crate::llm::{self, Audience, Explanation};
use crate::state::AppState;

pub(super) const DISCLAIMER: &str = "Demo output from DrugBank-derived public data. \
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

/// Prompt context plus the dataset facts the UI shows next to model text.
pub(super) struct Context {
    pub direct: bool,
    pub chain_length: usize,
    /// Dataset severity of the direct interaction — authoritative over the model.
    pub severity: Option<String>,
    pub severity_basis: Option<String>,
    pub prompt: String,
}

/// FDA precipitant → object facts for the prompt (or an explicit "not established").
fn direction_context(state: &AppState, a: &str, b: &str) -> String {
    let Some(direction) = roles::fda().direction(a, b) else {
        return "Pharmacokinetic direction: not established by the FDA CYP/transporter table; \
do not state which drug affects which."
            .to_string();
    };
    let facts: Vec<String> = direction
        .links()
        .iter()
        .map(|l| {
            let verb = match l.effect {
                Effect::Inhibits => "inhibits",
                Effect::Induces => "induces",
            };
            format!(
                "{} ({} {}) {verb} {}; {} is a {} {} substrate",
                state.engine.display_name(&l.precipitant),
                l.strength,
                l.pathway,
                l.pathway,
                state.engine.display_name(&l.object),
                l.object_sensitivity,
                l.pathway,
            )
        })
        .collect();
    format!(
        "Pharmacokinetic direction (FDA CYP/transporter table, authoritative over the record's \
wording): {}.",
        facts.join("; ")
    )
}

pub(super) fn build_context(
    state: &AppState,
    request: &ExplainRequest,
) -> Result<Context, ApiError> {
    // Unknown drugs -> 404 before any LLM work.
    state.engine.degree(&request.drug_a)?;
    state.engine.degree(&request.drug_b)?;
    let name_a = state.engine.display_name(&request.drug_a);
    let name_b = state.engine.display_name(&request.drug_b);

    let direct = state
        .engine
        .neighbors(&request.drug_a)?
        .into_iter()
        .find(|n| n.drug.id == request.drug_b);

    if let Some(neighbor) = direct {
        let interaction = neighbor.interaction;
        let prompt = format!(
            "Drug A: {name_a}\nDrug B: {name_b}\nKnown direct interaction: {}, direction {}, \
severity {}.\nMechanism: {}\nEvidence: {}\n{}\nTask: explain this interaction.",
            interaction.kind,
            interaction.direction,
            interaction.severity,
            interaction.mechanism,
            interaction.evidence,
            direction_context(state, &request.drug_a, &request.drug_b),
        );
        return Ok(Context {
            direct: true,
            chain_length: 1,
            severity: Some(interaction.severity.clone()),
            severity_basis: Some(interaction.severity_basis.clone()),
            prompt,
        });
    }

    let chain =
        state
            .engine
            .interaction_chain(&request.drug_a, &request.drug_b, request.max_hops)?;

    if let Some(steps) = &chain.filter(|steps| !steps.is_empty()) {
        let walked: Vec<&str> = std::iter::once(name_a)
            .chain(steps.iter().map(|step| state.engine.display_name(&step.to)))
            .collect();
        let prompt = format!(
            "Drug A: {name_a}\nDrug B: {name_b}\nThere is no direct interaction, but there \
is an indirect chain of {} interaction(s): {}.\nTask: explain how these drugs \
could affect each other indirectly through this chain and how relevant that is.",
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
        "Drug A: {name_a}\nDrug B: {name_b}\nNo interaction between these drugs was found in \
this dataset.\nTask: state only that no interaction was found in this dataset \
and that absence from one pairwise dataset does not establish safety (dose, \
patient factors and multi-drug effects are not covered).",
    );
    Ok(Context {
        direct: false,
        chain_length: 0,
        severity: None,
        severity_basis: None,
        prompt,
    })
}

/// Provider + model for a request (server defaults when absent), validated
/// against what is actually available.
pub(super) async fn resolve_target(
    state: &AppState,
    request: &ExplainRequest,
) -> Result<(LlmProvider, String), ApiError> {
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
    Ok((provider, model))
}

/// Dataset facts + model identity: shared by the JSON response, the
/// stream's first line (`start`) and its last line (`done`).
pub(super) fn response_meta(
    request: &ExplainRequest,
    context: &Context,
    provider: LlmProvider,
    model: &str,
) -> Value {
    json!({
        "drug_a": request.drug_a,
        "drug_b": request.drug_b,
        "direct_interaction": context.direct,
        "chain_length": context.chain_length,
        "dataset_severity": context.severity,
        "severity_basis": context.severity_basis,
        "provider": provider,
        "model": model,
        "audience": request.audience,
        "stub": provider == LlmProvider::Stub,
        "disclaimer": DISCLAIMER,
    })
}

/// Final body: meta + validated sections, dataset severity asserted.
pub(super) fn response_body(meta: Value, context: &Context, mut sections: Explanation) -> Value {
    sections.assert_dataset_severity(context.severity.as_deref());
    let mut body = meta;
    // `payload` kept for API consumers that read a single section
    body["payload"] = json!(sections.clinician.as_ref().or(sections.patient.as_ref()));
    body["sections"] = json!(sections);
    body
}

pub async fn explain(
    State(state): State<AppState>,
    Json(request): Json<ExplainRequest>,
) -> Result<Json<Value>, ApiError> {
    validate_max_hops(request.max_hops)?;
    let context = build_context(&state, &request)?;
    let (provider, model) = resolve_target(&state, &request).await?;
    let sections = llm::explain(
        &state.http,
        &state.config,
        provider,
        &model,
        request.audience,
        &context.prompt,
    )
    .await?;
    let meta = response_meta(&request, &context, provider, &model);
    Ok(Json(response_body(meta, &context, sections)))
}
