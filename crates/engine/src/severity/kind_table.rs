//! Reviewed interaction-kind → severity table (layer 1).

/// One reviewed row of the kind table.
#[derive(Debug, Clone, Copy)]
pub struct KindRule {
    /// Template kind with any `activity:` prefix stripped.
    pub kind: &'static str,
    pub severity: &'static str,
    pub rationale: &'static str,
}

const fn rule(kind: &'static str, severity: &'static str, rationale: &'static str) -> KindRule {
    KindRule {
        kind,
        severity,
        rationale,
    }
}

/// Reviewed kind → severity table. Reviewer: editorial (portfolio demo),
/// 2026-10. Must be re-reviewed by a pharmacist before any non-demo use.
pub const KIND_SEVERITY: &[KindRule] = &[
    // --- severe: life-threatening additive effects ---
    rule(
        "qtc-prolonging",
        "severe",
        "QT prolongation → torsades de pointes risk",
    ),
    rule("av-block", "severe", "conduction block"),
    rule("arrhythmogenic", "severe", "arrhythmia risk"),
    rule("cardiotoxic", "severe", "direct cardiac toxicity"),
    rule(
        "cns-depressant",
        "severe",
        "FDA 2016 boxed warning: opioid + benzodiazepine/CNS depressant → respiratory depression, death",
    ),
    rule(
        "respiratory-depressant",
        "severe",
        "same FDA 2016 boxed-warning mechanism",
    ),
    rule(
        "anticoagulant",
        "severe",
        "additive anticoagulation → major bleeding",
    ),
    rule(
        "antiplatelet",
        "severe",
        "additive platelet inhibition → major bleeding",
    ),
    rule(
        "thrombogenic",
        "severe",
        "thrombosis / thromboembolism risk",
    ),
    rule("serotonergic", "severe", "serotonin syndrome risk"),
    rule("hypertensive", "severe", "hypertensive crisis risk"),
    rule("hyperkalemic", "severe", "hyperkalemia → arrhythmia risk"),
    rule(
        "neuromuscular-blocking",
        "severe",
        "prolonged paralysis / apnea",
    ),
    rule(
        "myelosuppressive",
        "severe",
        "additive bone-marrow suppression",
    ),
    rule(
        "myopathic-rhabdomyolysis",
        "severe",
        "rhabdomyolysis → renal failure",
    ),
    rule("nephrotoxic", "severe", "additive kidney injury"),
    rule("hepatotoxic", "severe", "additive liver injury"),
    rule("neurotoxic", "severe", "additive neurotoxicity"),
    rule("central-neurotoxic", "severe", "additive CNS toxicity"),
    rule(
        "ototoxic",
        "severe",
        "potentially irreversible hearing loss",
    ),
    rule("teratogenic", "severe", "fetal harm"),
    // --- moderate: monitor / context-dependent ---
    rule(
        "metabolism",
        "moderate",
        "PK change; severity depends on the drugs (narrow therapeutic index?)",
    ),
    rule("exposure", "moderate", "PK change; context-dependent"),
    rule("absorption", "moderate", "PK change; context-dependent"),
    rule("excretion", "moderate", "PK change; context-dependent"),
    rule(
        "bioavailability",
        "moderate",
        "PK change; context-dependent",
    ),
    rule(
        "efficacy",
        "moderate",
        "loss/gain of efficacy; can be serious (anti-infectives, contraceptives)",
    ),
    rule(
        "adverse-effects",
        "moderate",
        "generic additive adverse effects",
    ),
    rule(
        "hypotensive",
        "moderate",
        "additive blood-pressure lowering; monitor",
    ),
    rule("orthostatic-hypotensive", "moderate", "falls risk; monitor"),
    rule(
        "antihypertensive",
        "moderate",
        "additive blood-pressure lowering; monitor",
    ),
    rule(
        "bradycardic",
        "moderate",
        "additive heart-rate lowering; monitor",
    ),
    rule(
        "tachycardic",
        "moderate",
        "additive heart-rate increase; monitor",
    ),
    rule("hypoglycemic", "moderate", "hypoglycemia; monitor glucose"),
    rule(
        "hyperglycemic",
        "moderate",
        "hyperglycemia; monitor glucose",
    ),
    rule("hypokalemic", "moderate", "electrolyte change; monitor"),
    rule("hyponatremic", "moderate", "electrolyte change; monitor"),
    rule("hypocalcemic", "moderate", "electrolyte change; monitor"),
    rule("hypercalcemic", "moderate", "electrolyte change; monitor"),
    rule(
        "sedative",
        "moderate",
        "additive sedation (non-opioid wording)",
    ),
    rule(
        "anticholinergic",
        "moderate",
        "additive anticholinergic burden",
    ),
    rule("immunosuppressive", "moderate", "infection risk; monitor"),
    rule("neuroexcitatory", "moderate", "seizure threshold; monitor"),
    // --- mild: limited clinical effect ---
    rule(
        "photosensitizing",
        "mild",
        "photosensitivity; sun protection",
    ),
    rule("constipating", "mild", "additive constipation"),
];

/// Tier for a kind, and whether it fell through to the default.
pub fn severity_for_kind(kind: &str) -> (&'static str, bool) {
    let base = kind.strip_prefix("activity:").unwrap_or(kind);
    KIND_SEVERITY
        .iter()
        .find(|r| r.kind == base)
        .map_or(("moderate", true), |r| (r.severity, false))
}
