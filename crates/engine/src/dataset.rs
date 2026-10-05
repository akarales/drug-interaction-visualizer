//! Dataset builder: normalize the Kaggle DrugBank-derived DDI CSV into the
//! engine's dataset JSON.
//!
//! Classification (deterministic, documented):
//! - `kind` — parsed from the description template (metabolism,
//!   exposure, qtc-prolonging, activity:\<word\>, ...)
//! - `direction` — increase / decrease / mixed, from the template
//! - `severity` — HEURISTIC (the source has no severity field):
//!   severe: cardiotoxic, arrhythmogenic, nephrotoxic, hepatotoxic,
//!   neurotoxic, hypertensive, serotonergic, teratogenic, qtc-prolonging,
//!   av-block, neuromuscular-blocking. mild: photosensitizing.
//!   moderate: everything else (safe default)
//! - `category` — per drug: the most common kind across its edges
//! - `evidence` — provenance string
//!
//! Dedup: (Drug 1, Drug 2) normalized to unordered pairs; first occurrence
//! in the source file wins.

use std::collections::{HashMap, HashSet};
use std::io::Write;
use std::path::Path;

use regex::Regex;

use crate::graph::{Dataset, Drug, Interaction};

const SEVERE_ACTIVITIES: [&str; 11] = [
    "cardiotoxic",
    "arrhythmogenic",
    "nephrotoxic",
    "hepatotoxic",
    "neurotoxic",
    "hypertensive",
    "serotonergic",
    "teratogenic",
    "qtc-prolonging",
    "av-block",
    "neuromuscular-blocking",
];
const MILD_ACTIVITIES: [&str; 1] = ["photosensitizing"];
const EVIDENCE: &str = "DrugBank-derived via Kaggle (mghobashy/drug-drug-interactions)";

#[derive(Debug, thiserror::Error)]
pub enum BuildError {
    #[error("csv error: {0}")]
    Csv(#[from] csv::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
}

fn templates() -> Vec<(&'static str, Regex)> {
    [
        ("qtc-prolonging", r"^(?P<a>.+?) may (?:increase|decrease) the QTc-prolonging activities of (?P<b>.+?)\.$"),
        ("qtc-prolonging", r"^The risk or severity of QTc prolongation can be (?:increased|decreased) when (?P<a>.+?) is combined with (?P<b>.+?)\.$"),
        ("cns-depressant", r"^(?P<a>.+?) may (?:increase|decrease) the central nervous system depressant \(CNS depressant\) activities of (?P<b>.+?)\.$"),
        ("av-block", r"^(?P<a>.+?) may (?:increase|decrease) the atrioventricular blocking \(AV block\) activities of (?P<b>.+?)\.$"),
        ("excretion", r"^(?P<a>.+?) may (?:increase|decrease) the excretion rate of (?P<b>.+?) which could result in a (?:higher|lower) serum level\.$"),
        ("absorption", r"^(?P<a>.+?) can cause an? (?:increase|decrease) in the absorption of (?P<b>.+?) resulting in a reduced serum concentration"),
        ("metabolism", r"^The metabolism of (?P<b>.+?) can be (?:increased|decreased) when combined with (?P<a>.+?)\.$"),
        ("exposure", r"^The serum concentration of the active metabolites of (?P<b>.+?) can be (?:increased|decreased) when (?P<a>.+?) is used in combination with"),
        ("exposure", r"^The serum concentration of (?P<b>.+?) can be (?:increased|decreased) when it is combined with (?P<a>.+?)\.$"),
        ("bioavailability", r"^The bioavailability of (?P<b>.+?) can be (?:increased|decreased) when combined with (?P<a>.+?)\.$"),
        ("efficacy", r"^The therapeutic efficacy of (?P<b>.+?) can be (?:increased|decreased) when used in combination with (?P<a>.+?)\.$"),
        ("adverse-effects", r"^The risk or severity of adverse effects can be (?:increased|decreased) when (?P<a>.+?) is combined with (?P<b>.+?)\.$"),
        ("activity", r"^(?P<a>.+?) may (?:increase|decrease) the (?P<activity>[a-z\- ]+?) activities of (?P<b>.+?)\.$"),
    ]
    .into_iter()
    .map(|(kind, pattern)| (kind, Regex::new(pattern).expect("template regex is valid")))
    .collect()
}

fn severity_for(kind: &str) -> &'static str {
    let base = kind.strip_prefix("activity:").unwrap_or(kind);
    if SEVERE_ACTIVITIES.contains(&base) {
        "severe"
    } else if MILD_ACTIVITIES.contains(&base) {
        "mild"
    } else {
        "moderate"
    }
}

fn normalize_name(name: &str) -> String {
    let lower = name.trim().to_lowercase();
    let cleaned: String = lower
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    cleaned.trim_matches('-').to_string()
}

fn direction_of(description: &str) -> &'static str {
    if description.contains(" increase ") || description.contains(" increased ") {
        "increase"
    } else if description.contains(" decrease ") || description.contains(" decreased ") {
        "decrease"
    } else {
        "mixed"
    }
}

/// Build the dataset JSON from the raw Kaggle CSV.
pub fn build(raw_csv: &Path, out_json: &Path) -> Result<(), BuildError> {
    let templates = templates();
    let mut reader = csv::Reader::from_path(raw_csv)?;

    let mut drug_names: HashMap<String, String> = HashMap::new(); // id -> display
    let mut seen_pairs: HashSet<(String, String)> = HashSet::new();
    let mut interactions: Vec<Interaction> = Vec::new();
    let mut source_rows = 0usize;
    let mut unmatched = 0usize;

    for record in reader.records() {
        let record = record?;
        source_rows += 1;
        let (name_a, name_b, description) = (
            record.get(0).unwrap_or_default().trim().to_string(),
            record.get(1).unwrap_or_default().trim().to_string(),
            record.get(2).unwrap_or_default().trim().to_string(),
        );
        if name_a.is_empty() || name_b.is_empty() || name_a == name_b {
            continue;
        }

        let (id_a, id_b) = (normalize_name(&name_a), normalize_name(&name_b));
        let pair = if id_a <= id_b {
            (id_a.clone(), id_b.clone())
        } else {
            (id_b.clone(), id_a.clone())
        };
        if !seen_pairs.insert(pair) {
            continue;
        }

        let mut kind = "unclassified".to_string();
        for (template_kind, pattern) in &templates {
            let Some(matches) = pattern.captures(&description) else {
                continue;
            };
            kind = if *template_kind == "activity" {
                let activity = matches
                    .name("activity")
                    .map(|m| m.as_str().trim().replace(' ', "-"))
                    .unwrap_or_default();
                format!("activity:{activity}")
            } else {
                (*template_kind).to_string()
            };
            break;
        }
        if kind == "unclassified" {
            unmatched += 1;
        }

        drug_names.entry(id_a.clone()).or_insert(name_a.clone());
        drug_names.entry(id_b.clone()).or_insert(name_b.clone());

        interactions.push(Interaction {
            from: id_a,
            to: id_b,
            severity: severity_for(&kind).to_string(),
            direction: direction_of(&description).to_string(),
            kind,
            mechanism: description,
            evidence: EVIDENCE.to_string(),
        });
    }

    // Data-driven category per drug: most common kind among its edges.
    let mut kind_counts: HashMap<&str, HashMap<&str, usize>> = drug_names
        .keys()
        .map(|id| (id.as_str(), HashMap::new()))
        .collect();
    for interaction in &interactions {
        kind_counts
            .get_mut(interaction.from.as_str())
            .expect("drug registered")
            .entry(interaction.kind.as_str())
            .and_modify(|count| *count += 1)
            .or_insert(1);
        kind_counts
            .get_mut(interaction.to.as_str())
            .expect("drug registered")
            .entry(interaction.kind.as_str())
            .and_modify(|count| *count += 1)
            .or_insert(1);
    }

    let drugs: Vec<Drug> = drug_names
        .iter()
        .map(|(id, name)| {
            let counts = kind_counts
                .get(id.as_str())
                .expect("counts registered for every drug");
            let category = counts
                .iter()
                .max_by_key(|(kind, count)| (**count, std::cmp::Reverse(**kind)))
                .map(|(kind, _)| (*kind).to_string())
                .unwrap_or_else(|| "uncategorized".to_string());
            Drug {
                id: id.clone(),
                name: name.clone(),
                category,
            }
        })
        .collect();

    let severity_mix = {
        let mut counts: HashMap<&str, usize> = HashMap::new();
        for interaction in &interactions {
            *counts.entry(interaction.severity.as_str()).or_insert(0) += 1;
        }
        (
            counts.get("moderate").copied().unwrap_or(0),
            counts.get("severe").copied().unwrap_or(0),
            counts.get("mild").copied().unwrap_or(0),
        )
    };

    let dataset = Dataset {
        drugs,
        interactions,
    };
    if let Some(parent) = out_json.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut file = std::fs::File::create(out_json)?;
    serde_json::to_writer(&mut file, &dataset)?;
    file.flush()?;

    tracing::info!(
        drugs = dataset.drugs.len(),
        interactions = dataset.interactions.len(),
        source_rows,
        unmatched,
        severity_mix = ?severity_mix,
        out = %out_json.display(),
        "dataset built"
    );
    println!("drugs:         {}", dataset.drugs.len());
    println!(
        "interactions:  {} (from {source_rows} source rows)",
        dataset.interactions.len()
    );
    println!("unclassified:  {unmatched}");
    println!(
        "severity mix:  moderate={} severe={} mild={}",
        severity_mix.0, severity_mix.1, severity_mix.2
    );
    println!("wrote:         {}", out_json.display());
    Ok(())
}
