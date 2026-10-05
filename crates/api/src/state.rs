//! Shared application state. Cheap to clone: Arc'd engine + handle clients.

use std::sync::Arc;
use std::time::Duration;

use interaction_graph::graph::InteractionGraph;

use crate::config::Config;
use crate::rxnorm::{AliasIndex, AliasTable, RxNormClient, load_alias_table};

/// A hung Ollama must not hold a request forever.
const LLM_CONNECT_TIMEOUT: Duration = Duration::from_secs(3);
const LLM_TOTAL_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Clone)]
pub struct AppState {
    pub engine: Arc<InteractionGraph>,
    pub http: reqwest::Client,
    pub config: Arc<Config>,
    /// Offline RxNorm names per drug id (brands, ingredients, salts).
    pub aliases: Arc<AliasTable>,
    /// Any known name → drug ids (dataset names + alias table).
    pub alias_index: Arc<AliasIndex>,
    /// Live fallback; `None` when APP_RXNAV_ENABLED=false.
    pub rxnorm: Option<RxNormClient>,
}

impl AppState {
    pub fn new(config: Config, engine: InteractionGraph) -> Self {
        let http = reqwest::Client::builder()
            .connect_timeout(LLM_CONNECT_TIMEOUT)
            .timeout(LLM_TOTAL_TIMEOUT)
            .user_agent(concat!(
                "drug-interaction-visualizer/",
                env!("CARGO_PKG_VERSION")
            ))
            .build()
            .expect("static reqwest client configuration is valid");
        let aliases = load_alias_table(&config.aliases_path);
        let alias_index = AliasIndex::new(
            &aliases,
            engine
                .indices()
                .map(|idx| engine.drug(idx))
                .map(|d| (d.id.as_str(), d.name.as_str())),
        );
        let rxnorm = config
            .rxnav_url
            .as_deref()
            .map(|url| RxNormClient::new(http.clone(), url));
        Self {
            engine: Arc::new(engine),
            http,
            config: Arc::new(config),
            aliases: Arc::new(aliases),
            alias_index: Arc::new(alias_index),
            rxnorm,
        }
    }
}
