//! LLM layer: schema-constrained explanations via Ollama (local) or the
//! Anthropic Messages API (structured outputs), with a deterministic stub
//! backend so demos and tests never need a GPU or network.
//!
//! - `prompts` — system prompt per audience (+ shared grounding rules)
//! - `schema`  — JSON schemas and strict reply parsing
//! - `anthropic`, `ollama`, `stub` — one backend each
//! - `models`  — chooser data and choice validation
//! - `stream`  — streamed replies (Anthropic SSE, Ollama NDJSON, stub)
//! - `extract` — incremental field extraction from partial JSON

mod anthropic;
pub mod extract;
mod models;
mod ollama;
mod prompts;
mod schema;
mod stream;
mod stub;

use serde::{Deserialize, Serialize};

pub use models::{ModelOption, ProviderStatus, list_models, validate_choice};
pub use prompts::system_prompt;
pub use schema::parse_explanation;
pub use stream::{TextStream, explain_stream};

use crate::config::{Config, LlmProvider};
use crate::error::ApiError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExplanationPayload {
    pub explanation: String,
    pub severity: String,
    pub mechanism: String,
    pub recommendation: String,
}

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
        return Ok(stub::explanation(audience, context));
    }
    let system = system_prompt(audience);
    let schema = schema::schema_for(audience);
    let raw = match provider {
        LlmProvider::Ollama => ollama::chat(http, config, model, &system, &schema, context).await?,
        _ => anthropic::messages(http, config, model, &system, &schema, context).await?,
    };
    schema::parse_explanation(audience, &raw)
}

impl Explanation {
    /// The dataset's severity always wins over the model's (when the pair
    /// has a direct interaction in the dataset).
    pub fn assert_dataset_severity(&mut self, dataset: Option<&str>) {
        if let Some(severity) = dataset {
            for section in [self.clinician.as_mut(), self.patient.as_mut()]
                .into_iter()
                .flatten()
            {
                section.severity = severity.to_string();
            }
        }
    }
}

/// Upstream failures are logged with detail; clients get a generic message.
fn upstream(provider: &str, err: impl std::fmt::Display) -> ApiError {
    tracing::error!(provider, error = %err, "llm upstream failure");
    ApiError::LlmUpstream(format!("{provider} request failed"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn both_sections_is_the_default_audience() {
        assert_eq!(Audience::default(), Audience::Both);
    }
}
