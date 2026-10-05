//! Drug Interaction Visualizer API — axum service over the graph engine.
//! Library crate so integration tests exercise the real router assembly.

pub mod config;
pub mod error;
pub mod llm;
pub mod routes;
pub mod rxnorm;
pub mod state;
