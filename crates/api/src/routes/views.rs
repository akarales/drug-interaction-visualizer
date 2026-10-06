//! JSON shaping shared by the route handlers (engine types → API bodies).

use interaction_graph::graph::Drug;
use interaction_graph::queries::{ChainStep, Neighbor};
use interaction_graph::roles;
use serde_json::{Value, json};

use crate::rxnorm::AliasTable;

/// RxNorm names other than the dataset name (brands, INN/USAN, salts).
fn aliases<'a>(table: &'a AliasTable, drug: &Drug) -> Vec<&'a str> {
    let mut out: Vec<&str> = Vec::new();
    if let Some(entry) = table.get(&drug.id) {
        for alias in entry.all() {
            if !alias.eq_ignore_ascii_case(&drug.name) && !out.contains(&alias.as_str()) {
                out.push(alias);
            }
        }
    }
    out
}

/// One row of `/drugs`.
pub fn drug_summary(
    table: &AliasTable,
    drug: &Drug,
    degree: usize,
    severity_mix: [usize; 4],
) -> Value {
    json!({
        "id": drug.id,
        "name": drug.name,
        "category": drug.category,
        "degree": degree,
        // [contraindicated, severe, moderate, mild] — node severity ring
        "severity_mix": severity_mix,
        "aliases": aliases(table, drug),
    })
}

/// One entry of `/drugs/{focus}/neighbors`. `roles` (FDA precipitant →
/// object links) is present only when the FDA table establishes a
/// direction; absent = direction unknown.
pub fn neighbor(focus: &str, n: &Neighbor) -> Value {
    let mut body = json!({
        "id": n.drug.id,
        "name": n.drug.name,
        "category": n.drug.category,
        "kind": n.interaction.kind,
        "direction": n.interaction.direction,
        "severity": n.interaction.severity,
        "severity_basis": n.interaction.severity_basis,
        "mechanism": n.interaction.mechanism,
    });
    if let Some(direction) = roles::fda().direction(focus, &n.drug.id) {
        body["roles"] = json!(direction);
    }
    body
}

/// One hop of `/interactions/chain`.
pub fn chain_step(step: &ChainStep) -> Value {
    json!({
        "from": step.from,
        "to": step.to,
        "kind": step.kind,
        "direction": step.direction,
        "severity": step.severity,
    })
}
