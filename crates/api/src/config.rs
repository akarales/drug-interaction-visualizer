//! Environment configuration — read once, validated, fail-fast.

use std::fmt;
use std::path::PathBuf;

/// Which hosted/local model backend serves explanations when stub=false.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LlmProvider {
    Stub,
    Ollama,
    Anthropic,
}

/// Claude models offered in the model chooser (validated server-side).
pub const ANTHROPIC_MODELS: &[(&str, &str)] = &[
    ("claude-sonnet-5-5", "Claude Sonnet 5.5 — fast, strong"),
    ("claude-haiku-4-5", "Claude Haiku 4.5 — fastest"),
    ("claude-opus-5-5", "Claude Opus 5.5 — most capable"),
];

#[derive(Clone)]
pub struct Config {
    pub dataset_path: PathBuf,
    pub llm_stub: bool,
    pub llm_provider: LlmProvider,
    pub ollama_url: String,
    pub ollama_model: String,
    pub anthropic_url: String,
    pub anthropic_model: String,
    /// Secret — never logged (see the manual `Debug` impl).
    pub anthropic_api_key: Option<String>,
    /// How long Ollama keeps OUR model in memory after a call. Short by
    /// default: the Ollama instance is shared with other applications.
    pub ollama_keep_alive: String,
    /// RxNav base URL for live brand/typo fallback; `None` = offline only.
    pub rxnav_url: Option<String>,
    pub aliases_path: PathBuf,
    pub port: u16,
}

impl fmt::Debug for Config {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Config")
            .field("dataset_path", &self.dataset_path)
            .field("llm_stub", &self.llm_stub)
            .field("llm_provider", &self.llm_provider)
            .field("ollama_url", &self.ollama_url)
            .field("ollama_model", &self.ollama_model)
            .field("anthropic_url", &self.anthropic_url)
            .field("anthropic_model", &self.anthropic_model)
            .field(
                "anthropic_api_key",
                &self.anthropic_api_key.as_ref().map(|_| "<redacted>"),
            )
            .field("ollama_keep_alive", &self.ollama_keep_alive)
            .field("rxnav_url", &self.rxnav_url)
            .field("aliases_path", &self.aliases_path)
            .field("port", &self.port)
            .finish()
    }
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
        let llm_stub = env_or("APP_LLM_STUB", "true").to_lowercase() != "false";
        let llm_provider = match env_or("APP_LLM_PROVIDER", "ollama").to_lowercase().as_str() {
            "ollama" => LlmProvider::Ollama,
            "anthropic" => LlmProvider::Anthropic,
            "stub" => LlmProvider::Stub,
            other => {
                return Err(ConfigError(format!(
                    "APP_LLM_PROVIDER must be `ollama`, `anthropic` or `stub`, got `{other}`"
                )));
            }
        };
        let anthropic_api_key = std::env::var("ANTHROPIC_API_KEY")
            .ok()
            .filter(|k| !k.trim().is_empty());
        if !llm_stub && llm_provider == LlmProvider::Anthropic && anthropic_api_key.is_none() {
            return Err(ConfigError(
                "APP_LLM_PROVIDER=anthropic needs ANTHROPIC_API_KEY (or set APP_LLM_STUB=true)"
                    .to_string(),
            ));
        }
        Ok(Self {
            llm_stub,
            llm_provider,
            ollama_url: env_or("APP_OLLAMA_URL", "http://localhost:11434"),
            ollama_model: env_or("APP_OLLAMA_MODEL", "qwen3:14b"),
            anthropic_url: env_or("APP_ANTHROPIC_URL", "https://api.anthropic.com"),
            anthropic_model: env_or("APP_ANTHROPIC_MODEL", "claude-sonnet-5-5"),
            anthropic_api_key,
            ollama_keep_alive: env_or("APP_OLLAMA_KEEP_ALIVE", "2m"),
            rxnav_url: (env_or("APP_RXNAV_ENABLED", "true").to_lowercase() != "false")
                .then(|| env_or("APP_RXNAV_URL", "https://rxnav.nlm.nih.gov")),
            aliases_path: PathBuf::from(env_or("APP_ALIASES_PATH", "data/aliases.json")),
            port: env_or("APP_PORT", "8001")
                .parse()
                .map_err(|_| ConfigError("APP_PORT must be a valid port number".to_string()))?,
            dataset_path,
        })
    }

    /// Provider + model used when a request doesn't choose one.
    pub fn default_target(&self) -> (LlmProvider, String) {
        match (self.llm_stub, self.llm_provider) {
            (true, _) | (_, LlmProvider::Stub) => (LlmProvider::Stub, "stub".to_string()),
            (false, LlmProvider::Ollama) => (LlmProvider::Ollama, self.ollama_model.clone()),
            (false, LlmProvider::Anthropic) => {
                (LlmProvider::Anthropic, self.anthropic_model.clone())
            }
        }
    }
}
