//! Deterministic offline backend: demos and tests never need a GPU or network.

use super::{Audience, Explanation, ExplanationPayload};

pub fn explanation(audience: Audience, context: &str) -> Explanation {
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
