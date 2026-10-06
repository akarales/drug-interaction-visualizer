//! `POST /explain/stream` — the same grounded explanation, streamed as
//! NDJSON so text appears while the model writes:
//!
//! ```text
//! {"type":"start", …dataset facts, model, disclaimer}       first line, before any model text
//! {"type":"delta","field":"clinician.explanation","text":"…"}   repeated
//! {"type":"done", …same body as /explain, validated, dataset severity asserted}
//! {"type":"error","code":"llm_upstream","error":"…"}        instead of done
//! ```
//!
//! The model call runs in a task that holds an explain permit for the whole
//! stream. When the client goes away (Stop / navigation), the next send
//! fails, the task returns and drops the upstream stream — closing the
//! model request.

use std::convert::Infallible;

use axum::Json;
use axum::body::Body;
use axum::extract::State;
use axum::http::header;
use axum::response::{IntoResponse, Response};
use futures_util::stream::{self, StreamExt};
use serde_json::{Value, json};
use tokio::sync::{OwnedSemaphorePermit, mpsc};
use tracing::Instrument;

use super::chain::validate_max_hops;
use super::explain::{
    Context, ExplainRequest, build_context, resolve_target, response_body, response_meta,
};
use crate::error::ApiError;
use crate::llm::{self, TextStream, extract::FieldExtractor};
use crate::state::AppState;

pub async fn explain_stream(
    State(state): State<AppState>,
    Json(request): Json<ExplainRequest>,
) -> Result<Response, ApiError> {
    validate_max_hops(request.max_hops)?;
    let context = build_context(&state, &request)?;
    let (provider, model) = resolve_target(&state, &request).await?;
    // queue like /explain: at most EXPLAIN_CONCURRENCY model calls in flight
    let permit = state
        .explain_permits
        .clone()
        .acquire_owned()
        .await
        .map_err(|_| ApiError::Internal)?;
    let upstream = llm::explain_stream(
        &state.http,
        &state.config,
        provider,
        &model,
        request.audience,
        &context.prompt,
    )
    .await?;

    let meta = response_meta(&request, &context, provider, &model);
    let (tx, rx) = mpsc::channel::<String>(64);
    tokio::spawn(
        pump(upstream, tx, permit, request, context, meta).instrument(tracing::Span::current()),
    );

    let body = Body::from_stream(stream::unfold(rx, |mut rx| async move {
        rx.recv()
            .await
            .map(|line| (Ok::<_, Infallible>(format!("{line}\n")), rx))
    }));
    Ok((
        [
            (header::CONTENT_TYPE, "application/x-ndjson"),
            (header::CACHE_CONTROL, "no-cache"),
            (header::HeaderName::from_static("x-accel-buffering"), "no"),
        ],
        body,
    )
        .into_response())
}

fn error_line(err: &ApiError) -> String {
    json!({ "type": "error", "code": err.code(), "error": err.to_string() }).to_string()
}

fn typed(mut value: Value, kind: &str) -> String {
    value["type"] = json!(kind);
    value.to_string()
}

async fn pump(
    mut upstream: TextStream,
    tx: mpsc::Sender<String>,
    _permit: OwnedSemaphorePermit,
    request: ExplainRequest,
    context: Context,
    meta: Value,
) {
    let gone =
        || tracing::info!("explain stream: client disconnected — upstream model request dropped");
    if tx.send(typed(meta.clone(), "start")).await.is_err() {
        return gone();
    }
    let mut extractor = FieldExtractor::new();
    let mut raw = String::new();
    while let Some(fragment) = upstream.next().await {
        let text = match fragment {
            Ok(text) => text,
            Err(err) => {
                let _ = tx.send(error_line(&err)).await;
                return;
            }
        };
        raw.push_str(&text);
        for delta in extractor.feed(&text) {
            let line =
                json!({ "type": "delta", "field": delta.field, "text": delta.text }).to_string();
            if tx.send(line).await.is_err() {
                return gone();
            }
        }
    }
    let last = match llm::parse_explanation(request.audience, &raw) {
        Ok(sections) => typed(response_body(meta, &context, sections), "done"),
        Err(err) => error_line(&err),
    };
    let _ = tx.send(last).await;
}
