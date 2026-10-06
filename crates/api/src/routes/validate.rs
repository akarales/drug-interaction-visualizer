//! Input validation for persisted free text. The app stores synthetic demo
//! data only: labels and reasons that look like patient identifiers are
//! rejected (a conservative pattern screen, not a de-identification tool).

use std::sync::LazyLock;

use regex::Regex;

use crate::error::ApiError;
use crate::state::AppState;

pub const LABEL_MAX: usize = 80;
pub const REASON_MIN: usize = 3;
pub const REASON_MAX: usize = 500;
pub const MAX_DRUGS: usize = 20;

static PHI_PATTERNS: LazyLock<Vec<(&'static str, Regex)>> = LazyLock::new(|| {
    [
        ("an email address", r"[\w.+-]+@[\w-]+\.[\w.]+"),
        (
            "a date",
            r"\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b(19|20)\d{2}-\d{2}-\d{2}\b",
        ),
        ("a phone number", r"\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b"),
        ("an ID number", r"\b\d{3}-\d{2}-\d{4}\b|\d{6,}"),
        (
            "an identifier keyword",
            r"(?i)\b(mrn|dob|ssn|date of birth|medical record|patient name)\b",
        ),
    ]
    .into_iter()
    .map(|(what, pattern)| {
        (
            what,
            Regex::new(pattern).expect("static PHI pattern compiles"),
        )
    })
    .collect()
});

/// Reject text that looks like it carries patient identifiers.
pub fn no_identifiers(field: &str, text: &str) -> Result<(), ApiError> {
    match PHI_PATTERNS.iter().find(|(_, re)| re.is_match(text)) {
        Some((what, _)) => Err(ApiError::BadRequest(format!(
            "{field} looks like it contains {what}; this demo stores synthetic data only — \
             use a neutral label (e.g. \"anticoagulation review 3\")"
        ))),
        None => Ok(()),
    }
}

pub fn label(raw: &str) -> Result<String, ApiError> {
    let label = raw.trim();
    let len = label.chars().count();
    if len == 0 || len > LABEL_MAX {
        return Err(ApiError::BadRequest(format!(
            "label must be 1..={LABEL_MAX} characters"
        )));
    }
    no_identifiers("label", label)?;
    Ok(label.to_string())
}

pub fn reason(raw: &str) -> Result<String, ApiError> {
    let reason = raw.trim();
    let len = reason.chars().count();
    if !(REASON_MIN..=REASON_MAX).contains(&len) {
        return Err(ApiError::BadRequest(format!(
            "reason must be {REASON_MIN}..={REASON_MAX} characters"
        )));
    }
    no_identifiers("reason", reason)?;
    Ok(reason.to_string())
}

/// 1..=20 distinct known drug ids, order preserved (= regimen order).
pub fn drug_ids(state: &AppState, ids: &[String]) -> Result<Vec<String>, ApiError> {
    let mut out: Vec<String> = Vec::with_capacity(ids.len());
    for id in ids {
        state.engine.index(id)?;
        if !out.contains(id) {
            out.push(id.clone());
        }
    }
    if out.is_empty() || out.len() > MAX_DRUGS {
        return Err(ApiError::BadRequest(format!(
            "drug_ids must hold 1..={MAX_DRUGS} drugs"
        )));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn neutral_labels_pass() {
        for ok in [
            "Anticoagulation review",
            "Cardiology regimen B",
            "Case 3 — statin switch",
            "CYP3A demo",
        ] {
            assert!(no_identifiers("label", ok).is_ok(), "{ok}");
        }
    }

    #[test]
    fn identifier_like_text_is_rejected() {
        for bad in [
            "john.doe@example.org",
            "DOB 03/14/1961",
            "seen 2026-10-06",
            "call 555-123-4567",
            "MRN 00123456",
            "ssn 123-45-6789",
            "Patient name: Jane",
        ] {
            assert!(no_identifiers("label", bad).is_err(), "{bad}");
        }
    }
}
