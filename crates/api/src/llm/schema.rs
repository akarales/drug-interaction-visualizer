//! JSON schemas the model must comply with, and strict parsing of its reply.

use std::sync::LazyLock;

use serde::Deserialize;
use serde_json::json;

use super::{Audience, Explanation, ExplanationPayload};
use crate::error::ApiError;

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

pub fn schema_for(audience: Audience) -> serde_json::Value {
    match audience {
        Audience::Both => COMBINED_SCHEMA.clone(),
        Audience::Clinician | Audience::Patient => SECTION_SCHEMA.clone(),
    }
}

/// Strict shape for `both`: a reply missing either section is rejected.
#[derive(Debug, Deserialize)]
struct CombinedResponse {
    clinician: ExplanationPayload,
    patient: ExplanationPayload,
}

pub fn parse_explanation(audience: Audience, raw: &str) -> Result<Explanation, ApiError> {
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

#[cfg(test)]
mod tests {
    use super::*;

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
}
