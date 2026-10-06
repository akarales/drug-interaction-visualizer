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

mod kind_table;
mod onc;

pub use kind_table::{KIND_SEVERITY, KindRule, severity_for_kind};
pub use onc::{ONC_RULES, OncRule, onc_rule_for, onc_value_set_ids};

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
