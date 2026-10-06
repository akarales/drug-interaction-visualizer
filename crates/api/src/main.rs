//! Binary entry point: tracing init, config validation, engine load, serve.

use drug_interaction_api::config::Config;
use drug_interaction_api::routes;
use drug_interaction_api::state::AppState;
use drug_interaction_api::store::Store;
use tower_http::trace::TraceLayer;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Optional local .env (gitignored); real environment variables win.
    let dotenv_loaded = dotenvy::dotenv().is_ok();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,drug_interaction_api=debug".into()),
        )
        .init();

    let config = Config::from_env()?;
    tracing::info!(
        dataset = %config.dataset_path.display(),
        llm_stub = config.llm_stub,
        llm_provider = ?config.llm_provider,
        default_model = config.default_target().1,
        dotenv_loaded,
        "starting drug interaction visualizer api"
    );

    let dataset = std::fs::read_to_string(&config.dataset_path)?;
    let engine = interaction_graph::graph::InteractionGraph::from_json(&dataset)?;

    let store = match config.database_url.as_deref() {
        Some(url) => Store::postgres(url).await?,
        None => Store::memory(),
    };
    tracing::info!(store = store.kind(), "persistence ready");
    let state = AppState::with_store(config.clone(), engine, store);
    let app = routes::router(state).layer(TraceLayer::new_for_http());

    let addr = format!("0.0.0.0:{}", config.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!(%addr, "listening");
    axum::serve(listener, app).await?;
    Ok(())
}
