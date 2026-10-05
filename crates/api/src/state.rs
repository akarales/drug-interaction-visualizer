//! Shared application state. Cheap to clone: Arc'd engine + handle clients.

use std::sync::Arc;

use interaction_graph::graph::InteractionGraph;

use crate::config::Config;

#[derive(Clone)]
pub struct AppState {
    pub engine: Arc<InteractionGraph>,
    pub http: reqwest::Client,
    pub config: Arc<Config>,
}

impl AppState {
    pub fn new(config: Config, engine: InteractionGraph) -> Self {
        Self {
            engine: Arc::new(engine),
            http: reqwest::Client::new(),
            config: Arc::new(config),
        }
    }
}
