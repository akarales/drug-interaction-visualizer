//! Graph model: drugs as nodes, interactions as typed undirected edges.

use std::collections::HashMap;

use petgraph::Undirected;
use petgraph::graph::{Graph, NodeIndex};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Drug {
    pub id: String,
    pub name: String,
    pub category: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Interaction {
    pub from: String,
    pub to: String,
    /// Mechanism class: metabolism | exposure | efficacy | adverse-effects |
    /// qtc-prolonging | cns-depressant | excretion | absorption |
    /// bioavailability | activity:<word> | unclassified
    pub kind: String,
    /// increase | decrease | mixed — direction of the effect
    pub direction: String,
    /// mild | moderate | severe | contraindicated — EDITORIAL grading
    /// (documented in severity.rs; the source data has no severity field)
    pub severity: String,
    pub mechanism: String,
    pub evidence: String,
    /// Which rule assigned `severity`: `kind:<kind>`, `default:<kind>`
    /// (fell through the kind table) or `onc:<rule id>` (ONC high-priority).
    #[serde(default)]
    pub severity_basis: String,
}

#[derive(Debug, thiserror::Error)]
pub enum EngineError {
    #[error("unknown drug id: {0}")]
    UnknownDrug(String),
    #[error("dataset error: {0}")]
    Dataset(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Dataset {
    pub drugs: Vec<Drug>,
    pub interactions: Vec<Interaction>,
}

#[derive(Debug)]
pub struct InteractionGraph {
    graph: Graph<Drug, Interaction, Undirected>,
    index_by_id: HashMap<String, NodeIndex>,
}

impl InteractionGraph {
    pub fn from_dataset(dataset: &Dataset) -> Result<Self, EngineError> {
        let mut graph = Graph::new_undirected();
        let mut index_by_id = HashMap::new();
        for drug in &dataset.drugs {
            let idx = graph.add_node(drug.clone());
            if index_by_id.insert(drug.id.clone(), idx).is_some() {
                return Err(EngineError::Dataset(format!(
                    "duplicate drug id: {}",
                    drug.id
                )));
            }
        }
        for interaction in &dataset.interactions {
            let (a, b) = (
                *index_by_id
                    .get(&interaction.from)
                    .ok_or_else(|| EngineError::UnknownDrug(interaction.from.clone()))?,
                *index_by_id
                    .get(&interaction.to)
                    .ok_or_else(|| EngineError::UnknownDrug(interaction.to.clone()))?,
            );
            graph.add_edge(a, b, interaction.clone());
        }
        Ok(Self { graph, index_by_id })
    }

    pub fn from_json(json: &str) -> Result<Self, EngineError> {
        let dataset: Dataset = serde_json::from_str(json)
            .map_err(|e| EngineError::Dataset(format!("invalid dataset JSON: {e}")))?;
        Self::from_dataset(&dataset)
    }

    pub fn node_count(&self) -> usize {
        self.graph.node_count()
    }

    pub fn edge_count(&self) -> usize {
        self.graph.edge_count()
    }

    pub fn index(&self, drug_id: &str) -> Result<NodeIndex, EngineError> {
        self.index_by_id
            .get(drug_id)
            .copied()
            .ok_or_else(|| EngineError::UnknownDrug(drug_id.to_string()))
    }

    pub fn drug(&self, idx: NodeIndex) -> &Drug {
        &self.graph[idx]
    }

    /// Display name for a drug id; the id itself when unknown (O(1), no allocation).
    pub fn display_name<'a>(&'a self, drug_id: &'a str) -> &'a str {
        self.index_by_id
            .get(drug_id)
            .map_or(drug_id, |&idx| self.graph[idx].name.as_str())
    }

    pub fn indices(&self) -> impl Iterator<Item = NodeIndex> + '_ {
        self.graph.node_indices()
    }

    pub fn graph(&self) -> &Graph<Drug, Interaction, Undirected> {
        &self.graph
    }
}
