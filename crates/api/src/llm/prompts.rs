//! System prompts per audience. Grounding rules are shared by every audience.

use super::Audience;

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn combined_prompt_contains_both_framings() {
        let prompt = system_prompt(Audience::Both);
        assert!(prompt.contains("licensed physician"));
        assert!(prompt.contains("physician will review"));
        assert!(prompt.contains("must agree on the facts"));
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
