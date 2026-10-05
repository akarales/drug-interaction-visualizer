//! Environment configuration — read once, validated, fail-fast.

use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct Config {
    pub dataset_path: PathBuf,
    pub llm_stub: bool,
    pub ollama_url: String,
    pub ollama_model: String,
    pub port: u16,
}

#[derive(Debug, thiserror::Error)]
#[error("invalid configuration: {0}")]
pub struct ConfigError(String);

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        let dataset_path = PathBuf::from(env_or("APP_DATASET_PATH", "data/ddi_dataset.json"));
        if !dataset_path.exists() {
            return Err(ConfigError(format!(
                "dataset not found at {} — run scripts/fetch_dataset.sh, then \
                 `cargo run -p interaction-graph -- build \
                 data/raw/db_drug_interactions.csv data/ddi_dataset.json` (see README)",
                dataset_path.display()
            )));
        }
        Ok(Self {
            llm_stub: env_or("APP_LLM_STUB", "true").to_lowercase() != "false",
            ollama_url: env_or("APP_OLLAMA_URL", "http://localhost:11434"),
            ollama_model: env_or("APP_OLLAMA_MODEL", "qwen3:14b"),
            port: env_or("APP_PORT", "8001")
                .parse()
                .map_err(|_| ConfigError("APP_PORT must be a valid port number".to_string()))?,
            dataset_path,
        })
    }
}
