//! LLM layer: schema-constrained explanations via Ollama, with a
//! deterministic stub backend so demos and tests never need a GPU.

use std::sync::LazyLock;

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::config::Config;
use crate::error::ApiError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExplanationPayload {
    pub explanation: String,
    pub severity: String,
    pub mechanism: String,
    pub recommendation: String,
}

/// JSON schema passed as Ollama's `format` — the model must comply.
static EXPLANATION_SCHEMA: LazyLock<serde_json::Value> = LazyLock::new(|| {
    json!({
        "type": "object",
        "properties": {
            "explanation": {"type": "string"},
            "severity": {"type": "string", "enum": ["mild", "moderate", "severe"]},
            "mechanism": {"type": "string"},
            "recommendation": {"type": "string"}
        },
        "required": ["explanation", "severity", "mechanism", "recommendation"]
    })
});

const SYSTEM_PROMPT: &str = "You are a pharmacology educator. Explain drug-drug \
interactions in plain language for a patient. Be factual and cautious. You are \
not providing medical advice.";

#[derive(Debug, Deserialize)]
struct ChatResponse {
    message: ChatMessage,
}

#[derive(Debug, Deserialize)]
struct ChatMessage {
    content: String,
}

pub async fn explain(
    http: &reqwest::Client,
    config: &Config,
    context: &str,
) -> Result<ExplanationPayload, ApiError> {
    if config.llm_stub {
        return Ok(stub_explanation(context));
    }

    let body = json!({
        "model": config.ollama_model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": context}
        ],
        "format": EXPLANATION_SCHEMA.clone(),
        "stream": false,
        "options": {"temperature": 0.1}
    });
    let response: ChatResponse = http
        .post(format!("{}/api/chat", config.ollama_url))
        .json(&body)
        .send()
        .await
        .map_err(|e| ApiError::LlmUpstream(e.to_string()))?
        .error_for_status()
        .map_err(|e| ApiError::LlmUpstream(e.to_string()))?
        .json()
        .await
        .map_err(|e| ApiError::LlmUpstream(e.to_string()))?;
    serde_json::from_str(&response.message.content)
        .map_err(|e| ApiError::LlmUpstream(format!("model output did not match schema: {e}")))
}

fn stub_explanation(context: &str) -> ExplanationPayload {
    let trimmed: String = context.chars().take(400).collect();
    ExplanationPayload {
        explanation: format!(
            "Offline stub explanation. Enable a running Ollama instance with \
             APP_LLM_STUB=false for a real schema-constrained explanation. \
             Context: {trimmed}"
        ),
        severity: "moderate".to_string(),
        mechanism: "stub mode: no model call was made".to_string(),
        recommendation: "Consult a pharmacist or physician about this \
combination. This demo is not medical advice."
            .to_string(),
    }
}
