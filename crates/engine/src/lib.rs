//! interaction-graph — drug-drug interaction knowledge graph engine.
//!
//! Rust core (petgraph) exposed two ways:
//! - rlib (this crate) consumed by the axum API service
//! - the `interaction-graph-cli` binary: dataset build + JSON queries

pub mod dataset;
pub mod graph;
pub mod queries;
pub mod severity;
