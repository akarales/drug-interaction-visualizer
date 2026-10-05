//! Graph queries: neighbors, multi-hop interaction chains, hub stats,
//! and subgraph exports (the full dataset never crosses into Python).

use std::collections::{HashMap, HashSet, VecDeque};

use petgraph::graph::NodeIndex;
use petgraph::visit::EdgeRef;
use serde_json::json;

use crate::graph::{Drug, EngineError, Interaction, InteractionGraph};

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct Neighbor {
    pub drug: Drug,
    pub interaction: Interaction,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct ChainStep {
    pub from: String,
    pub to: String,
    pub kind: String,
    pub direction: String,
    pub severity: String,
}

/// Severity tiers in display order (worst first).
pub const SEVERITY_ORDER: [&str; 4] = ["contraindicated", "severe", "moderate", "mild"];

impl InteractionGraph {
    /// (drug, degree) for every drug, sorted by degree desc then name.
    pub fn drugs(&self) -> Vec<(Drug, usize)> {
        let mut out: Vec<(Drug, usize)> = self
            .indices()
            .map(|idx| (self.drug(idx).clone(), self.graph().neighbors(idx).count()))
            .collect();
        out.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.name.cmp(&b.0.name)));
        out
    }
    /// Interaction count per severity tier across the whole dataset.
    pub fn severity_mix(&self) -> std::collections::BTreeMap<String, usize> {
        let mut mix = std::collections::BTreeMap::new();
        for edge in self.graph().edge_references() {
            *mix.entry(edge.weight().severity.clone()).or_insert(0) += 1;
        }
        mix
    }

    /// Per-drug interaction counts by tier, in [`SEVERITY_ORDER`]; one pass
    /// over the edges. Unknown tiers are ignored.
    pub fn severity_mix_by_drug(&self) -> HashMap<NodeIndex, [usize; 4]> {
        let mut out: HashMap<NodeIndex, [usize; 4]> = HashMap::new();
        for edge in self.graph().edge_references() {
            let Some(tier) = SEVERITY_ORDER
                .iter()
                .position(|s| *s == edge.weight().severity)
            else {
                continue;
            };
            out.entry(edge.source()).or_default()[tier] += 1;
            out.entry(edge.target()).or_default()[tier] += 1;
        }
        out
    }

    pub fn degree(&self, drug_id: &str) -> Result<usize, EngineError> {
        let idx = self.index(drug_id)?;
        Ok(self.graph().neighbors(idx).count())
    }

    pub fn neighbors(&self, drug_id: &str) -> Result<Vec<Neighbor>, EngineError> {
        let idx = self.index(drug_id)?;
        let mut out: Vec<Neighbor> = self
            .graph()
            .edges(idx)
            .map(|edge| Neighbor {
                drug: self.graph()[edge.target()].clone(),
                interaction: edge.weight().clone(),
            })
            .collect();
        out.sort_by(|a, b| a.drug.name.cmp(&b.drug.name));
        Ok(out)
    }

    /// Shortest interaction chain between two drugs, up to `max_hops` edges.
    /// `None` when they are not connected within the limit.
    pub fn interaction_chain(
        &self,
        from: &str,
        to: &str,
        max_hops: usize,
    ) -> Result<Option<Vec<ChainStep>>, EngineError> {
        let start = self.index(from)?;
        let goal = self.index(to)?;
        if start == goal {
            return Ok(Some(Vec::new()));
        }

        // BFS: parent map node -> (previous node, edge id on the path)
        let mut parent: Vec<Option<(NodeIndex, petgraph::graph::EdgeIndex)>> =
            vec![None; self.graph().node_count().max(1)];
        let mut visited = vec![false; self.graph().node_count().max(1)];
        let mut queue = VecDeque::from([(start, 0usize)]);
        visited[start.index()] = true;
        let mut found = false;

        while let Some((node, depth)) = queue.pop_front() {
            if depth >= max_hops {
                continue;
            }
            for edge in self.graph().edges(node) {
                let next = edge.target();
                if visited[next.index()] {
                    continue;
                }
                visited[next.index()] = true;
                parent[next.index()] = Some((node, edge.id()));
                if next == goal {
                    found = true;
                    break;
                }
                queue.push_back((next, depth + 1));
            }
            if found {
                break;
            }
        }
        if !found {
            return Ok(None);
        }

        // Reconstruct the path goal -> start, then reverse.
        let mut steps_rev = Vec::new();
        let mut current = goal;
        while current != start {
            let Some((prev, edge_id)) = parent[current.index()] else {
                return Ok(None);
            };
            let interaction = self.graph().edge_weight(edge_id).expect("edge exists");
            steps_rev.push(ChainStep {
                from: self.drug(prev).id.clone(),
                to: self.drug(current).id.clone(),
                kind: interaction.kind.clone(),
                direction: interaction.direction.clone(),
                severity: interaction.severity.clone(),
            });
            current = prev;
        }
        steps_rev.reverse();
        Ok(Some(steps_rev))
    }

    /// Top `n` drugs by interaction count.
    pub fn hubs(&self, n: usize) -> Vec<(Drug, usize)> {
        let mut hubs: Vec<(Drug, usize)> = self
            .indices()
            .map(|idx| (self.drug(idx).clone(), self.graph().neighbors(idx).count()))
            .collect();
        hubs.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.name.cmp(&b.0.name)));
        hubs.truncate(n);
        hubs
    }

    fn nodes_json(&self, keep: &HashSet<NodeIndex>) -> Vec<serde_json::Value> {
        self.indices()
            .filter(|idx| keep.contains(idx))
            .map(|idx| {
                let drug = self.drug(idx);
                json!({
                    "id": drug.id,
                    "name": drug.name,
                    "category": drug.category,
                    "degree": self.graph().neighbors(idx).count(),
                })
            })
            .collect()
    }

    fn edges_json(&self, keep: &HashSet<NodeIndex>) -> Vec<serde_json::Value> {
        self.graph()
            .edge_references()
            .filter(|edge| keep.contains(&edge.source()) && keep.contains(&edge.target()))
            .map(|edge| {
                let interaction = edge.weight();
                json!({
                    "source": self.drug(edge.source()).id,
                    "target": self.drug(edge.target()).id,
                    "kind": interaction.kind,
                    "direction": interaction.direction,
                    "severity": interaction.severity,
                    "mechanism": interaction.mechanism,
                    "evidence": interaction.evidence,
                })
            })
            .collect()
    }

    fn stats_json(&self, returned_nodes: usize, returned_edges: usize) -> serde_json::Value {
        json!({
            "drugs": self.node_count(),
            "interactions": self.edge_count(),
            "returned_nodes": returned_nodes,
            "returned_edges": returned_edges,
            "hubs": self.hubs(5)
                .into_iter()
                .map(|(drug, degree)| json!({"id": drug.id, "name": drug.name, "degree": degree}))
                .collect::<Vec<_>>(),
        })
    }

    /// Subgraph of the `top` highest-degree drugs (the whole graph when
    /// `top` is `None` or 0). Stats always describe the FULL dataset.
    pub fn export_graph_json(&self, top: Option<usize>) -> serde_json::Value {
        let keep: HashSet<NodeIndex> = match top.filter(|t| *t > 0) {
            Some(t) => {
                let degree_by_idx: HashMap<NodeIndex, usize> = self
                    .indices()
                    .map(|idx| (idx, self.graph().neighbors(idx).count()))
                    .collect();
                let mut ranked: Vec<NodeIndex> = self.indices().collect();
                ranked.sort_by(|a, b| {
                    let (da, db) = (degree_by_idx[a], degree_by_idx[b]);
                    db.cmp(&da)
                        .then_with(|| self.drug(*b).name.cmp(&self.drug(*a).name))
                });
                ranked.truncate(t);
                ranked.into_iter().collect()
            }
            None => self.indices().collect(),
        };
        let nodes = self.nodes_json(&keep);
        let edges = self.edges_json(&keep);
        json!({
            "nodes": nodes,
            "edges": edges,
            "stats": self.stats_json(nodes.len(), edges.len()),
        })
    }

    /// Ego graph: everything within `hops` of `drug_id`, with induced edges.
    pub fn export_ego_graph_json(
        &self,
        drug_id: &str,
        hops: usize,
    ) -> Result<serde_json::Value, EngineError> {
        let center = self.index(drug_id)?;
        let mut keep: HashSet<NodeIndex> = HashSet::from([center]);
        let mut frontier = vec![center];
        for _ in 0..hops {
            let mut next_frontier = Vec::new();
            for node in &frontier {
                for neighbor in self.graph().neighbors(*node) {
                    if keep.insert(neighbor) {
                        next_frontier.push(neighbor);
                    }
                }
            }
            frontier = next_frontier;
        }
        let nodes = self.nodes_json(&keep);
        let edges = self.edges_json(&keep);
        Ok(json!({
            "center": self.drug(center).id,
            "nodes": nodes,
            "edges": edges,
            "stats": self.stats_json(nodes.len(), edges.len()),
        }))
    }
}
