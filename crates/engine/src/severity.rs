//! Severity grading — EDITORIAL, not clinical grading.
//!
//! The source data has no severity field. Severity is assigned in two
//! documented layers, and every edge records which layer decided it
//! (`Interaction::severity_basis`):
//!
//! 1. **Kind table** ([`KIND_SEVERITY`]) — a reviewed lookup from the
//!    interaction template kind to a tier, one rationale per row. Kinds not
//!    in the table default to `moderate` and are listed in the build report
//!    as "defaulted" so no decision is hidden.
//! 2. **ONC high-priority pairs** ([`ONC_RULES`]) — the 15 drug-drug
//!    interactions an expert panel judged contraindicated for concurrent use
//!    (Phansalkar et al., "High-priority drug-drug interactions for use in
//!    electronic health records", JAMIA 2012;19(5):735-43,
//!    doi:10.1136/amiajnl-2011-000612). An existing dataset edge whose two
//!    drugs fall in a rule's value sets is upgraded to `contraindicated`.
//!    The panel's classes ("MAOIs", "strong CYP3A4 inhibitors") are not
//!    published as drug lists, and references disagree on membership
//!    (Phansalkar follow-up, AJHP 2022, PMC9218784), so the value sets below
//!    are conservative editorial picks using the FDA "Drug Development and
//!    Drug Interactions" CYP inhibitor/inducer examples where applicable.
//!    The ONC layer never creates edges — it only regrades existing ones.
//!
//! Tier vocabulary follows the common knowledge-base scale
//! (contraindicated > severe/major > moderate > mild/minor).

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

/// One ONC high-priority interaction with editorial value sets (drug ids).
#[derive(Debug, Clone, Copy)]
pub struct OncRule {
    pub id: u8,
    pub label: &'static str,
    pub a: &'static [&'static str],
    pub b: &'static [&'static str],
}

const MAOIS: &[&str] = &[
    "phenelzine",
    "tranylcypromine",
    "isocarboxazid",
    "selegiline",
    "rasagiline",
    "safinamide",
    "linezolid",
    "procarbazine",
    "methylene-blue",
    "moclobemide",
];
const STRONG_CYP3A4_INHIBITORS: &[&str] = &[
    "clarithromycin",
    "indinavir",
    "itraconazole",
    "ketoconazole",
    "nelfinavir",
    "ritonavir",
    "saquinavir",
    "telithromycin",
    "voriconazole",
    "posaconazole",
    "cobicistat",
    "nefazodone",
    "lopinavir",
];
const PROTEASE_INHIBITORS: &[&str] = &[
    "atazanavir",
    "darunavir",
    "fosamprenavir",
    "indinavir",
    "lopinavir",
    "nelfinavir",
    "ritonavir",
    "saquinavir",
    "tipranavir",
];
const CYP3A4_AND_PIS: &[&str] = &[
    "clarithromycin",
    "erythromycin",
    "telithromycin",
    "itraconazole",
    "ketoconazole",
    "posaconazole",
    "voriconazole",
    "nefazodone",
    "cobicistat",
    "atazanavir",
    "darunavir",
    "fosamprenavir",
    "indinavir",
    "lopinavir",
    "nelfinavir",
    "ritonavir",
    "saquinavir",
    "tipranavir",
];
const CYP1A2_INHIBITORS: &[&str] = &["fluvoxamine", "ciprofloxacin", "enoxacin"];

/// The ONC list (JAMIA 2012, Table 1 as reproduced in PMC9218784).
pub const ONC_RULES: &[OncRule] = &[
    OncRule {
        id: 1,
        label: "Amphetamines + MAOIs",
        a: &[
            "amphetamine",
            "dextroamphetamine",
            "lisdexamfetamine",
            "benzphetamine",
            "phentermine",
        ],
        b: MAOIS,
    },
    OncRule {
        id: 2,
        label: "Atazanavir + PPIs",
        a: &["atazanavir"],
        b: &[
            "omeprazole",
            "esomeprazole",
            "lansoprazole",
            "dexlansoprazole",
            "pantoprazole",
            "rabeprazole",
        ],
    },
    OncRule {
        id: 3,
        label: "Febuxostat + azathioprine/mercaptopurine",
        a: &["febuxostat"],
        b: &["azathioprine", "mercaptopurine"],
    },
    OncRule {
        id: 4,
        label: "SSRIs + MAOIs",
        a: &[
            "fluoxetine",
            "sertraline",
            "paroxetine",
            "citalopram",
            "escitalopram",
            "fluvoxamine",
            "vilazodone",
        ],
        b: MAOIS,
    },
    OncRule {
        id: 5,
        label: "Irinotecan + strong CYP3A4 inhibitors",
        a: &["irinotecan"],
        b: STRONG_CYP3A4_INHIBITORS,
    },
    OncRule {
        id: 6,
        label: "Narcotic analgesics + MAOIs",
        a: &[
            "meperidine",
            "methadone",
            "tramadol",
            "tapentadol",
            "fentanyl",
            "dextromethorphan",
        ],
        b: MAOIS,
    },
    OncRule {
        id: 7,
        label: "Tricyclic antidepressants + MAOIs",
        a: &[
            "amitriptyline",
            "nortriptyline",
            "imipramine",
            "desipramine",
            "clomipramine",
            "doxepin",
            "protriptyline",
            "trimipramine",
            "amoxapine",
        ],
        b: MAOIS,
    },
    OncRule {
        id: 8,
        label: "High-risk QT-prolonging agents (pairwise)",
        a: &[
            "arsenic-trioxide",
            "disopyramide",
            "dofetilide",
            "ibutilide",
            "procainamide",
            "quinidine",
            "sotalol",
            "thioridazine",
        ],
        b: &[
            "arsenic-trioxide",
            "disopyramide",
            "dofetilide",
            "ibutilide",
            "procainamide",
            "quinidine",
            "sotalol",
            "thioridazine",
        ],
    },
    OncRule {
        id: 9,
        label: "Ramelteon + strong CYP1A2 inhibitors",
        a: &["ramelteon"],
        b: CYP1A2_INHIBITORS,
    },
    OncRule {
        id: 10,
        label: "Strong CYP3A4 inducers + protease inhibitors",
        a: &[
            "rifampicin",
            "rifapentine",
            "carbamazepine",
            "phenytoin",
            "enzalutamide",
            "mitotane",
        ],
        b: PROTEASE_INHIBITORS,
    },
    OncRule {
        id: 11,
        label: "Simvastatin/lovastatin + CYP3A4 inhibitors & PIs",
        a: &["simvastatin", "lovastatin"],
        b: CYP3A4_AND_PIS,
    },
    OncRule {
        id: 12,
        label: "Ergot alkaloids + CYP3A4 inhibitors & PIs",
        a: &[
            "ergotamine",
            "dihydroergotamine",
            "methylergometrine",
            "ergometrine",
        ],
        b: CYP3A4_AND_PIS,
    },
    OncRule {
        id: 13,
        label: "Tizanidine + CYP1A2 inhibitors",
        a: &["tizanidine"],
        b: CYP1A2_INHIBITORS,
    },
    OncRule {
        id: 14,
        label: "Tranylcypromine + procarbazine",
        a: &["tranylcypromine"],
        b: &["procarbazine"],
    },
    OncRule {
        id: 15,
        label: "Triptans + MAOIs",
        a: &[
            "sumatriptan",
            "rizatriptan",
            "zolmitriptan",
            "almotriptan",
            "eletriptan",
            "frovatriptan",
            "naratriptan",
        ],
        b: MAOIS,
    },
];

/// First ONC rule matching the unordered pair, if any.
pub fn onc_rule_for(x: &str, y: &str) -> Option<&'static OncRule> {
    ONC_RULES
        .iter()
        .find(|r| (r.a.contains(&x) && r.b.contains(&y)) || (r.a.contains(&y) && r.b.contains(&x)))
}

/// Every value-set id across the ONC rules (for the build report).
pub fn onc_value_set_ids() -> impl Iterator<Item = &'static str> {
    ONC_RULES
        .iter()
        .flat_map(|r| r.a.iter().chain(r.b.iter()).copied())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kind_table_has_no_duplicates_and_valid_tiers() {
        for (i, r) in KIND_SEVERITY.iter().enumerate() {
            assert!(
                ["severe", "moderate", "mild"].contains(&r.severity),
                "{}",
                r.kind
            );
            assert!(!r.rationale.is_empty(), "{} needs a rationale", r.kind);
            assert!(
                KIND_SEVERITY[i + 1..].iter().all(|o| o.kind != r.kind),
                "duplicate kind {}",
                r.kind
            );
        }
    }

    #[test]
    fn activity_prefix_is_stripped_and_unknown_defaults() {
        assert_eq!(
            severity_for_kind("activity:anticoagulant"),
            ("severe", false)
        );
        assert_eq!(severity_for_kind("cns-depressant"), ("severe", false));
        assert_eq!(
            severity_for_kind("activity:photosensitizing"),
            ("mild", false)
        );
        assert_eq!(severity_for_kind("activity:made-up"), ("moderate", true));
    }

    #[test]
    fn onc_rules_match_either_order() {
        assert_eq!(
            onc_rule_for("tizanidine", "ciprofloxacin").map(|r| r.id),
            Some(13)
        );
        assert_eq!(
            onc_rule_for("ciprofloxacin", "tizanidine").map(|r| r.id),
            Some(13)
        );
        assert_eq!(onc_rule_for("sotalol", "quinidine").map(|r| r.id), Some(8));
        assert!(onc_rule_for("warfarin", "aspirin").is_none());
    }
}
