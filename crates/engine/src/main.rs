//! interaction-graph-cli — dataset builder + standalone JSON queries.
//!
//! Examples:
//!   interaction-graph-cli build data/raw/db_drug_interactions.csv data/ddi_dataset.json
//!   interaction-graph-cli graph data/ddi_dataset.json --top 150
//!   interaction-graph-cli neighbors data/ddi_dataset.json warfarin
//!   interaction-graph-cli chain data/ddi_dataset.json warfarin simvastatin --max-hops 3
//!   interaction-graph-cli hubs data/ddi_dataset.json 10

use std::path::PathBuf;
use std::process::ExitCode;

use clap::Parser;

use interaction_graph::dataset::build;
use interaction_graph::graph::InteractionGraph;

#[derive(Parser)]
#[command(
    name = "interaction-graph",
    about = "Drug-drug interaction graph engine CLI"
)]
enum Cli {
    /// Build the dataset JSON from the raw Kaggle DDI CSV.
    Build {
        /// Path to db_drug_interactions.csv
        raw: PathBuf,
        /// Output dataset JSON path
        out: PathBuf,
    },
    /// Export the graph as JSON (optionally top-N hubs only).
    Graph {
        dataset: PathBuf,
        /// Top-N drugs by degree (0 = full graph)
        #[arg(long, default_value_t = 0)]
        top: usize,
    },
    /// Direct interactions of a drug.
    Neighbors { dataset: PathBuf, drug: String },
    /// Shortest interaction chain between two drugs.
    Chain {
        dataset: PathBuf,
        from: String,
        to: String,
        #[arg(long, default_value_t = 3)]
        max_hops: usize,
    },
    /// Top drugs by interaction count.
    Hubs {
        dataset: PathBuf,
        #[arg(default_value_t = 10)]
        n: usize,
    },
}

fn load(dataset: &PathBuf) -> Result<InteractionGraph, String> {
    let json = std::fs::read_to_string(dataset)
        .map_err(|e| format!("cannot read {}: {e}", dataset.display()))?;
    InteractionGraph::from_json(&json).map_err(|e| e.to_string())
}

fn print_json(value: impl serde::Serialize) -> ExitCode {
    match serde_json::to_string_pretty(&value) {
        Ok(output) => {
            println!("{output}");
            ExitCode::SUCCESS
        }
        Err(err) => {
            eprintln!("error: serialization failed: {err}");
            ExitCode::FAILURE
        }
    }
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    match cli {
        Cli::Build { raw, out } => match build(&raw, &out) {
            Ok(()) => ExitCode::SUCCESS,
            Err(err) => {
                eprintln!("error: {err}");
                ExitCode::FAILURE
            }
        },
        Cli::Graph { dataset, top } => match load(&dataset) {
            Ok(engine) => {
                print_json(engine.export_graph_json(if top > 0 { Some(top) } else { None }))
            }
            Err(err) => {
                eprintln!("error: {err}");
                ExitCode::FAILURE
            }
        },
        Cli::Neighbors { dataset, drug } => match load(&dataset)
            .and_then(|engine| engine.neighbors(&drug).map_err(|e| e.to_string()))
        {
            Ok(neighbors) => print_json(neighbors),
            Err(err) => {
                eprintln!("error: {err}");
                ExitCode::FAILURE
            }
        },
        Cli::Chain {
            dataset,
            from,
            to,
            max_hops,
        } => match load(&dataset).and_then(|engine| {
            engine
                .interaction_chain(&from, &to, max_hops)
                .map_err(|e| e.to_string())
        }) {
            Ok(chain) => print_json(chain),
            Err(err) => {
                eprintln!("error: {err}");
                ExitCode::FAILURE
            }
        },
        Cli::Hubs { dataset, n } => match load(&dataset) {
            Ok(engine) => print_json(engine.hubs(n)),
            Err(err) => {
                eprintln!("error: {err}");
                ExitCode::FAILURE
            }
        },
    }
}
