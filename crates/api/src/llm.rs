//! LLM layer: schema-constrained explanations via Ollama (local) or the
//! Anthropic Messages API (structured outputs), with a deterministic stub
//! backend so demos and tests never need a GPU or network.

use std::sync::LazyLock;

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::config::{Config, LlmProvider};
use crate::error::ApiError;

const ANTHROPIC_VERSION: &str = "2023-06-01";
/// Room for both the clinician and the patient section in one response.
const ANTHROPIC_MAX_TOKENS: u32 = 2048;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExplanationPayload {
    pub explanation: String,
    pub severity: String,
    pub mechanism: String,
    pub recommendation: String,
}

/// Schema of one section (clinician or patient) — the model must comply.
static SECTION_SCHEMA: LazyLock<serde_json::Value> = LazyLock::new(|| {
    json!({
        "type": "object",
        "properties": {
            "explanation": {"type": "string"},
            "severity": {"type": "string", "enum": ["mild", "moderate", "severe", "contraindicated"]},
            "mechanism": {"type": "string"},
            "recommendation": {"type": "string"}
        },
        "required": ["explanation", "severity", "mechanism", "recommendation"],
        "additionalProperties": false
    })
});

/// Both sections in one response: one model call, consistent content.
static COMBINED_SCHEMA: LazyLock<serde_json::Value> = LazyLock::new(|| {
    json!({
        "type": "object",
        "properties": {
            "clinician": SECTION_SCHEMA.clone(),
            "patient": SECTION_SCHEMA.clone()
        },
        "required": ["clinician", "patient"],
        "additionalProperties": false
    })
});

/// Who the explanation is written for. The app's user is a clinician;
/// `both` (default) also drafts a patient handout the clinician can review
/// and give to the patient.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Audience {
    #[default]
    Both,
    Clinician,
    Patient,
}

/// Generated sections; which ones are present depends on the audience.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Explanation {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub clinician: Option<ExplanationPayload>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub patient: Option<ExplanationPayload>,
}

/// Grounding rules shared by every audience.
const GROUNDING_RULES: &str = "Ground every statement in the dataset record \
provided. When a severity is given, repeat it exactly; never re-grade it. Never \
give specific doses. If the record is silent on something (risk factors, \
frequency, onset, management), say it is not in this dataset rather than \
guessing; label any general pharmacology beyond the record as \
'General pharmacology:'.";

const CLINICIAN_PROMPT: &str = "You are a clinical pharmacology reference \
assistant. The reader is a licensed physician reviewing a potential drug-drug \
interaction for one of their patients. Write for a clinician: concise, precise \
clinical terminology (for example QTc, INR, CYP3A4, serotonin toxicity), no lay \
explanations, and never address the patient directly. Fields: `explanation` is \
a 2-4 sentence clinical summary of the interaction and its likely clinical \
consequence; `mechanism` is the pharmacokinetic or pharmacodynamic mechanism; \
`recommendation` lists monitoring and management considerations for the \
prescriber (for example baseline and periodic ECG and electrolytes, INR \
monitoring, or considering an alternative agent), framed as considerations for \
clinical judgement, not orders.";

const PATIENT_PROMPT: &str = "You are drafting a patient handout that a \
physician will review before giving it to their patient. Use plain language at \
about an 8th-grade reading level, a calm tone, and explain any medical term you \
use. Fields: `explanation` is what may happen and why; `mechanism` is a simple \
explanation of how the drugs affect each other; `recommendation` lists symptoms \
to report and when to seek urgent care. Do not tell the patient to start, stop \
or change any medicine; the printed handout already ends with a standard line \
asking them to talk to their care team before changing medicines, so do not \
repeat it.";

const BOTH_PROMPT: &str = "Return two sections for the same interaction. \
`clinician`: written for the physician — CLINICIAN. `patient`: a handout draft \
the physician will review and give to their patient — PATIENT. Both sections \
must agree on the facts and the severity.";

/// System prompt for an audience (audience framing + shared grounding rules).
pub fn system_prompt(audience: Audience) -> String {
    let framing = match audience {
        Audience::Clinician => CLINICIAN_PROMPT.to_string(),
        Audience::Patient => PATIENT_PROMPT.to_string(),
        Audience::Both => BOTH_PROMPT
            .replace("CLINICIAN", CLINICIAN_PROMPT)
            .replace("PATIENT", PATIENT_PROMPT),
    };
    format!("{framing} {GROUNDING_RULES}")
}

fn schema_for(audience: Audience) -> serde_json::Value {
    match audience {
        Audience::Both => COMBINED_SCHEMA.clone(),
        Audience::Clinician | Audience::Patient => SECTION_SCHEMA.clone(),
    }
}

#[derive(Debug, Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicBlock>,
}

#[derive(Debug, Deserialize)]
struct AnthropicBlock {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    text: String,
}

#[derive(Debug, Deserialize)]
struct ChatResponse {
    message: ChatMessage,
}

#[derive(Debug, Deserialize)]
struct ChatMessage {
    content: String,
}

/// Generate an explanation with an explicit provider + model (already
/// validated by the caller against [`list_models`]).
pub async fn explain(
    http: &reqwest::Client,
    config: &Config,
    provider: LlmProvider,
    model: &str,
    audience: Audience,
    context: &str,
) -> Result<Explanation, ApiError> {
    if provider == LlmProvider::Stub {
        return Ok(stub_explanation(audience, context));
    }
    let system = system_prompt(audience);
    let schema = schema_for(audience);
    let raw = match provider {
        LlmProvider::Ollama => ollama_chat(http, config, model, &system, &schema, context).await?,
        _ => anthropic_messages(http, config, model, &system, &schema, context).await?,
    };
    parse_explanation(audience, &raw)
}

/// Strict shape for `both`: a reply missing either section is rejected.
#[derive(Debug, Deserialize)]
struct CombinedResponse {
    clinician: ExplanationPayload,
    patient: ExplanationPayload,
}

fn parse_explanation(audience: Audience, raw: &str) -> Result<Explanation, ApiError> {
    let invalid = |e: serde_json::Error| {
        tracing::warn!(error = %e, "model output did not match the explanation schema");
        ApiError::LlmUpstream("model output did not match schema".to_string())
    };
    Ok(match audience {
        Audience::Both => {
            let both: CombinedResponse = serde_json::from_str(raw).map_err(invalid)?;
            Explanation {
                clinician: Some(both.clinician),
                patient: Some(both.patient),
            }
        }
        Audience::Clinician => Explanation {
            clinician: Some(serde_json::from_str(raw).map_err(invalid)?),
            patient: None,
        },
        Audience::Patient => Explanation {
            clinician: None,
            patient: Some(serde_json::from_str(raw).map_err(invalid)?),
        },
    })
}

/// Upstream failures are logged with detail; clients get a generic message.
fn upstream(provider: &str, err: impl std::fmt::Display) -> ApiError {
    tracing::error!(provider, error = %err, "llm upstream failure");
    ApiError::LlmUpstream(format!("{provider} request failed"))
}

async fn anthropic_messages(
    http: &reqwest::Client,
    config: &Config,
    model: &str,
    system: &str,
    schema: &serde_json::Value,
    context: &str,
) -> Result<String, ApiError> {
    let key = config
        .anthropic_api_key
        .as_deref()
        .ok_or_else(|| ApiError::LlmUpstream("anthropic api key not configured".into()))?;
    let body = json!({
        "model": model,
        "max_tokens": ANTHROPIC_MAX_TOKENS,
        // no `temperature`: current Claude models reject it; determinism comes
        // from the JSON-schema constraint and the grounded prompt instead
        "system": system,
        "messages": [{"role": "user", "content": context}],
        "output_config": {
            "format": {"type": "json_schema", "schema": schema}
        }
    });
    let response = http
        .post(format!("{}/v1/messages", config.anthropic_url))
        .header("x-api-key", key)
        .header("anthropic-version", ANTHROPIC_VERSION)
        .json(&body)
        .send()
        .await
        .map_err(|e| upstream("anthropic", e))?;
    let status = response.status();
    if !status.is_success() {
        let detail = response.text().await.unwrap_or_default();
        return Err(upstream("anthropic", format!("{status}: {detail}")));
    }
    let parsed: AnthropicResponse = response
        .json()
        .await
        .map_err(|e| upstream("anthropic", e))?;
    parsed
        .content
        .into_iter()
        .find(|block| block.kind == "text")
        .map(|block| block.text)
        .ok_or_else(|| upstream("anthropic", "response had no text block"))
}

/// Chat against the SHARED Ollama instance. Read/infer only: never pulls,
/// deletes or configures models, and sends no options that force a model
/// reload (e.g. `num_ctx`); `keep_alive` is short so our model releases
/// memory quickly for the other applications using this Ollama.
async fn ollama_chat(
    http: &reqwest::Client,
    config: &Config,
    model: &str,
    system: &str,
    schema: &serde_json::Value,
    context: &str,
) -> Result<String, ApiError> {
    let body = json!({
        "model": model,
        "keep_alive": config.ollama_keep_alive,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": context}
        ],
        "format": schema,
        "stream": false,
        "options": {"temperature": 0.1}
    });
    let response: ChatResponse = http
        .post(format!("{}/api/chat", config.ollama_url))
        .json(&body)
        .send()
        .await
        .map_err(|e| upstream("ollama", e))?
        .error_for_status()
        .map_err(|e| upstream("ollama", e))?
        .json()
        .await
        .map_err(|e| upstream("ollama", e))?;
    Ok(response.message.content)
}

fn stub_explanation(audience: Audience, context: &str) -> Explanation {
    let trimmed: String = context.chars().take(400).collect();
    let section = |who: &str| ExplanationPayload {
        explanation: format!(
            "Offline stub ({who} section). Choose an Ollama or Claude model in the \
             model chooser for a real schema-constrained explanation. \
             Context: {trimmed}"
        ),
        severity: "moderate".to_string(),
        mechanism: "stub mode: no model call was made".to_string(),
        recommendation: "Discuss this combination with the care team. This demo \
is not medical advice."
            .to_string(),
    };
    Explanation {
        clinician: (audience != Audience::Patient).then(|| section("clinician")),
        patient: (audience != Audience::Clinician).then(|| section("patient")),
    }
}

/// One selectable model in the chooser.
#[derive(Debug, Clone, Serialize)]
pub struct ModelOption {
    pub provider: LlmProvider,
    pub id: String,
    pub label: String,
    /// Ollama only: currently resident in memory (no load / no eviction).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loaded: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size_gb: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProviderStatus {
    pub provider: LlmProvider,
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    pub models: Vec<ModelOption>,
}

#[derive(Debug, Deserialize)]
struct OllamaTags {
    #[serde(default)]
    models: Vec<OllamaModel>,
}

#[derive(Debug, Deserialize)]
struct OllamaModel {
    name: String,
    #[serde(default)]
    size: u64,
    #[serde(default)]
    capabilities: Option<Vec<String>>,
}

/// Read-only discovery of the shared Ollama: `GET /api/tags` (installed)
/// and `GET /api/ps` (loaded). Never mutates the instance.
async fn ollama_status(http: &reqwest::Client, config: &Config) -> ProviderStatus {
    let get = |path: &str| {
        http.get(format!("{}{path}", config.ollama_url))
            .timeout(std::time::Duration::from_secs(3))
            .send()
    };
    let tags = match get("/api/tags").await {
        Ok(r) => r.json::<OllamaTags>().await.ok(),
        Err(_) => None,
    };
    let Some(tags) = tags else {
        return ProviderStatus {
            provider: LlmProvider::Ollama,
            available: false,
            note: Some(format!("Ollama not reachable at {}", config.ollama_url)),
            models: Vec::new(),
        };
    };
    let loaded: Vec<String> = match get("/api/ps").await {
        Ok(r) => r
            .json::<OllamaTags>()
            .await
            .map(|ps| ps.models.into_iter().map(|m| m.name).collect())
            .unwrap_or_default(),
        Err(_) => Vec::new(),
    };
    let models = tags
        .models
        .into_iter()
        .filter(|m| match &m.capabilities {
            Some(caps) => caps.iter().any(|c| c == "completion"),
            None => !m.name.contains("embed"),
        })
        .map(|m| ModelOption {
            provider: LlmProvider::Ollama,
            label: m.name.clone(),
            loaded: Some(loaded.contains(&m.name)),
            size_gb: Some((m.size as f64 / 1e9 * 10.0).round() / 10.0),
            id: m.name,
        })
        .collect();
    ProviderStatus {
        provider: LlmProvider::Ollama,
        available: true,
        note: Some("shared instance — models are used as-is, never pulled or changed".into()),
        models,
    }
}

/// Every provider and model the chooser may offer, with availability.
pub async fn list_models(http: &reqwest::Client, config: &Config) -> Vec<ProviderStatus> {
    let has_key = config.anthropic_api_key.is_some();
    vec![
        ProviderStatus {
            provider: LlmProvider::Anthropic,
            available: has_key,
            note: (!has_key).then(|| "set ANTHROPIC_API_KEY to enable".to_string()),
            models: crate::config::ANTHROPIC_MODELS
                .iter()
                .map(|(id, label)| ModelOption {
                    provider: LlmProvider::Anthropic,
                    id: (*id).to_string(),
                    label: (*label).to_string(),
                    loaded: None,
                    size_gb: None,
                })
                .collect(),
        },
        ollama_status(http, config).await,
        ProviderStatus {
            provider: LlmProvider::Stub,
            available: true,
            note: Some("deterministic offline text, no model call".into()),
            models: vec![ModelOption {
                provider: LlmProvider::Stub,
                id: "stub".into(),
                label: "Offline stub".into(),
                loaded: None,
                size_gb: None,
            }],
        },
    ]
}

/// Is `(provider, model)` selectable right now?
pub async fn validate_choice(
    http: &reqwest::Client,
    config: &Config,
    provider: LlmProvider,
    model: &str,
) -> Result<(), ApiError> {
    let ok = match provider {
        LlmProvider::Stub => true,
        LlmProvider::Anthropic => {
            config.anthropic_api_key.is_some()
                && crate::config::ANTHROPIC_MODELS
                    .iter()
                    .any(|(id, _)| *id == model)
        }
        LlmProvider::Ollama => ollama_status(http, config)
            .await
            .models
            .iter()
            .any(|m| m.id == model),
    };
    if ok {
        Ok(())
    } else {
        Err(ApiError::BadRequest(format!(
            "model `{model}` is not available for provider {provider:?}"
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn both_sections_is_the_default_audience() {
        assert_eq!(Audience::default(), Audience::Both);
    }

    #[test]
    fn combined_prompt_contains_both_framings() {
        let prompt = system_prompt(Audience::Both);
        assert!(prompt.contains("licensed physician"));
        assert!(prompt.contains("physician will review"));
        assert!(prompt.contains("must agree on the facts"));
    }

    #[test]
    fn parses_combined_and_single_sections() {
        let section =
            r#"{"explanation":"e","severity":"severe","mechanism":"m","recommendation":"r"}"#;
        let both = parse_explanation(
            Audience::Both,
            &format!(r#"{{"clinician":{section},"patient":{section}}}"#),
        )
        .expect("combined parses");
        assert!(both.clinician.is_some() && both.patient.is_some());
        let one = parse_explanation(Audience::Patient, section).expect("single parses");
        assert!(one.clinician.is_none() && one.patient.is_some());
        assert!(
            parse_explanation(Audience::Both, section).is_err(),
            "single ≠ combined"
        );
    }

    #[test]
    fn clinician_prompt_addresses_a_physician_not_the_patient() {
        let prompt = system_prompt(Audience::Clinician);
        assert!(prompt.contains("licensed physician"));
        assert!(prompt.contains("never address the patient"));
        assert!(!prompt.contains("for a patient"));
        assert!(
            prompt.contains("repeat it exactly"),
            "grounding rules included"
        );
    }

    #[test]
    fn patient_prompt_is_a_reviewed_handout() {
        let prompt = system_prompt(Audience::Patient);
        assert!(prompt.contains("physician will review"));
        assert!(prompt.contains("Never give specific doses"));
        assert!(prompt.contains("Do not tell the patient to start, stop or change"));
    }
}
