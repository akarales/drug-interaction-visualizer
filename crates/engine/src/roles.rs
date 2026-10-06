//! Interaction direction (precipitant → object) from a CITABLE source:
//! FDA "For Healthcare Professionals — Examples of Drugs that Interact with
//! CYP Enzymes and Transporter Systems", Table 1 (public domain).
//!
//! Rule: in a pair (A, B), A is the *precipitant* and B the *object* when
//! FDA lists A as an inhibitor or inducer of pathway P and B as a substrate
//! of the same P. Both ways → `Bidirectional`; no match → `None` (direction
//! UNKNOWN — never inferred from the dataset's sentences, whose wording
//! reverses inhibitor roles in most rows; see docs/V3_updates V3-8).
//!
//! The reviewed extract (`data/fda_roles.csv`, regenerated with
//! `scripts/extract_fda_roles.py`) is compiled in, so lookups need no I/O.

use std::collections::HashMap;
use std::sync::LazyLock;

use serde::Serialize;

use crate::graph::EngineError;

/// Citation shown next to every directed edge.
#[derive(Debug, Clone, Copy, Serialize)]
pub struct Source {
    pub label: &'static str,
    pub url: &'static str,
    /// FDA page "content current as of"
    pub content_date: &'static str,
    /// date the extract was taken
    pub retrieved: &'static str,
}

pub const FDA_SOURCE: Source = Source {
    label: "FDA, Examples of Drugs that Interact with CYP Enzymes and Transporter Systems (Table 1)",
    url: "https://www.fda.gov/drugs/drug-interactions-labeling/healthcare-professionals-fdas-examples-drugs-interact-cyp-enzymes-and-transporter-systems",
    content_date: "2026-05-29",
    retrieved: "2026-10-06",
};

const FDA_CSV: &str = include_str!("../data/fda_roles.csv");

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Role {
    Inhibitor,
    Inducer,
    Substrate,
}

#[derive(Debug, Clone)]
struct RoleRow {
    pathway: String,
    role: Role,
    /// strong | moderate | weak | sensitive | moderate-sensitive | unspecified
    level: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Effect {
    Inhibits,
    Induces,
}

/// One FDA-backed reason why `precipitant` changes `object`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DirectedLink {
    pub precipitant: String,
    pub object: String,
    /// e.g. `CYP3A`, `CYP2C9`, `P-gp`, `OATP1B1`
    pub pathway: String,
    pub effect: Effect,
    /// strong | moderate | weak | unspecified (transporters)
    pub strength: String,
    /// sensitive | moderate-sensitive | unspecified (transporters)
    pub object_sensitivity: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "pattern", rename_all = "lowercase")]
pub enum Direction {
    /// every link has the same precipitant
    Directed { links: Vec<DirectedLink> },
    /// each drug acts on the other (possibly through different pathways)
    Bidirectional { links: Vec<DirectedLink> },
}

impl Direction {
    pub fn links(&self) -> &[DirectedLink] {
        match self {
            Direction::Directed { links } | Direction::Bidirectional { links } => links,
        }
    }
}

/// FDA roles per dataset drug id.
#[derive(Debug, Default)]
pub struct RoleTable {
    by_drug: HashMap<String, Vec<RoleRow>>,
}

/// The compiled-in FDA table (parsed once).
pub fn fda() -> &'static RoleTable {
    static TABLE: LazyLock<RoleTable> = LazyLock::new(|| {
        RoleTable::from_csv(FDA_CSV).expect("committed fda_roles.csv is valid (checked by tests)")
    });
    &TABLE
}

fn rank(level: &str) -> u8 {
    match level {
        "strong" | "sensitive" => 0,
        "moderate" | "moderate-sensitive" => 1,
        "weak" => 2,
        _ => 3,
    }
}

impl RoleTable {
    /// Parse the extract: `#` comment lines, then
    /// `drug_id,fda_name,pathway,role,level,source`.
    pub fn from_csv(text: &str) -> Result<Self, EngineError> {
        let body: String = text
            .lines()
            .filter(|l| !l.starts_with('#'))
            .collect::<Vec<_>>()
            .join("\n");
        let mut reader = csv::Reader::from_reader(body.as_bytes());
        let mut by_drug: HashMap<String, Vec<RoleRow>> = HashMap::new();
        for record in reader.records() {
            let r = record.map_err(|e| EngineError::Dataset(format!("fda roles: {e}")))?;
            let field = |i: usize| r.get(i).unwrap_or_default().trim().to_string();
            let role = match field(3).as_str() {
                "inhibitor" => Role::Inhibitor,
                "inducer" => Role::Inducer,
                "substrate" => Role::Substrate,
                other => {
                    return Err(EngineError::Dataset(format!(
                        "fda roles: unknown role {other:?}"
                    )));
                }
            };
            by_drug.entry(field(0)).or_default().push(RoleRow {
                pathway: field(2),
                role,
                level: field(4),
            });
        }
        Ok(Self { by_drug })
    }

    pub fn drug_count(&self) -> usize {
        self.by_drug.len()
    }

    /// Ways `precipitant` changes `object`, strongest first, CYP before transporters.
    fn links(&self, precipitant: &str, object: &str) -> Vec<DirectedLink> {
        let (Some(p), Some(o)) = (self.by_drug.get(precipitant), self.by_drug.get(object)) else {
            return Vec::new();
        };
        let mut out: Vec<DirectedLink> = p
            .iter()
            .filter_map(|a| {
                let effect = match a.role {
                    Role::Inhibitor => Effect::Inhibits,
                    Role::Inducer => Effect::Induces,
                    Role::Substrate => return None,
                };
                o.iter()
                    .find(|b| b.role == Role::Substrate && b.pathway == a.pathway)
                    .map(|b| DirectedLink {
                        precipitant: precipitant.to_string(),
                        object: object.to_string(),
                        pathway: a.pathway.clone(),
                        effect,
                        strength: a.level.clone(),
                        object_sensitivity: b.level.clone(),
                    })
            })
            .collect();
        out.sort_by_key(|l| {
            (
                !l.pathway.starts_with("CYP"),
                rank(&l.strength),
                rank(&l.object_sensitivity),
            )
        });
        out.dedup_by(|x, y| x.pathway == y.pathway && x.effect == y.effect);
        out
    }

    /// Direction of the pair, or `None` when the FDA table gives none.
    pub fn direction(&self, a: &str, b: &str) -> Option<Direction> {
        let ab = self.links(a, b);
        let ba = self.links(b, a);
        match (ab.is_empty(), ba.is_empty()) {
            (true, true) => None,
            (false, true) => Some(Direction::Directed { links: ab }),
            (true, false) => Some(Direction::Directed { links: ba }),
            (false, false) => Some(Direction::Bidirectional {
                links: ab.into_iter().chain(ba).collect(),
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn only(d: Option<Direction>) -> DirectedLink {
        match d {
            Some(Direction::Directed { links }) => links.into_iter().next().expect("one link"),
            other => panic!("expected directed, got {other:?}"),
        }
    }

    #[test]
    fn committed_extract_parses_and_covers_key_drugs() {
        let t = fda();
        assert!(t.drug_count() > 150);
        for id in [
            "fluconazole",
            "warfarin",
            "clarithromycin",
            "simvastatin",
            "rifampicin",
            "midazolam",
        ] {
            assert!(t.by_drug.contains_key(id), "{id} missing");
        }
    }

    #[test]
    fn inhibitor_acts_on_substrate_whatever_the_argument_order() {
        let l = only(fda().direction("warfarin", "fluconazole"));
        assert_eq!(
            (l.precipitant.as_str(), l.object.as_str()),
            ("fluconazole", "warfarin")
        );
        assert_eq!(
            (l.pathway.as_str(), l.effect, l.strength.as_str()),
            ("CYP2C9", Effect::Inhibits, "moderate")
        );
        let l = only(fda().direction("clarithromycin", "simvastatin"));
        assert_eq!(
            (
                l.pathway.as_str(),
                l.strength.as_str(),
                l.object_sensitivity.as_str()
            ),
            ("CYP3A", "strong", "sensitive")
        );
    }

    #[test]
    fn inducers_are_directed_too() {
        let l = only(fda().direction("midazolam", "rifampicin"));
        assert_eq!(
            (l.precipitant.as_str(), l.effect, l.pathway.as_str()),
            ("rifampicin", Effect::Induces, "CYP3A")
        );
    }

    #[test]
    fn both_ways_is_bidirectional() {
        let d = fda()
            .direction("phenytoin", "voriconazole")
            .expect("known pair");
        assert!(matches!(d, Direction::Bidirectional { .. }));
        let precipitants: Vec<&str> = d.links().iter().map(|l| l.precipitant.as_str()).collect();
        assert!(precipitants.contains(&"phenytoin") && precipitants.contains(&"voriconazole"));
    }

    #[test]
    fn no_fda_roles_means_unknown() {
        assert_eq!(fda().direction("warfarin", "acetylsalicylic-acid"), None);
        assert_eq!(fda().direction("not-a-drug", "warfarin"), None);
    }

    #[test]
    fn rejects_unknown_roles() {
        let bad = "drug_id,fda_name,pathway,role,level,source\nx,x,CYP3A,blocker,strong,fda\n";
        assert!(RoleTable::from_csv(bad).is_err());
    }
}
