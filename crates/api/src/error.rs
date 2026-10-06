//! API error taxonomy mapped onto HTTP responses.
//!
//! Every error body is `{"error": "<message>", "code": "<stable code>"}`;
//! clients branch on `code`, humans read `error`. Upstream and internal
//! details are logged, never sent to the client.

use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use interaction_graph::graph::EngineError;
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("unknown drug id: {0}")]
    UnknownDrug(String),
    #[error("llm upstream error: {0}")]
    LlmUpstream(String),
    #[error("bad request: {0}")]
    BadRequest(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("internal error")]
    Internal,
}

impl ApiError {
    /// Stable machine-readable code for the response body.
    pub fn code(&self) -> &'static str {
        match self {
            ApiError::UnknownDrug(_) => "unknown_drug",
            ApiError::LlmUpstream(_) => "llm_upstream",
            ApiError::BadRequest(_) => "bad_request",
            ApiError::NotFound(_) => "not_found",
            ApiError::Internal => "internal",
        }
    }

    fn status(&self) -> StatusCode {
        match self {
            ApiError::UnknownDrug(_) => StatusCode::NOT_FOUND,
            ApiError::LlmUpstream(_) => StatusCode::BAD_GATEWAY,
            ApiError::BadRequest(_) => StatusCode::BAD_REQUEST,
            ApiError::NotFound(_) => StatusCode::NOT_FOUND,
            ApiError::Internal => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
}

impl From<EngineError> for ApiError {
    fn from(err: EngineError) -> Self {
        match err {
            EngineError::UnknownDrug(id) => ApiError::UnknownDrug(id),
            EngineError::Dataset(detail) => {
                tracing::error!(error = %detail, "engine dataset error");
                ApiError::Internal
            }
        }
    }
}

impl From<crate::store::StoreError> for ApiError {
    fn from(err: crate::store::StoreError) -> Self {
        match err {
            crate::store::StoreError::NotFound => ApiError::NotFound("no such regimen".into()),
            other => {
                tracing::error!(error = %other, "store error");
                ApiError::Internal
            }
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = json!({ "error": self.to_string(), "code": self.code() });
        (self.status(), Json(body)).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn engine_errors_map_to_their_own_variants() {
        let unknown: ApiError = EngineError::UnknownDrug("x".into()).into();
        assert!(matches!(unknown, ApiError::UnknownDrug(ref id) if id == "x"));
        assert_eq!(unknown.to_string(), "unknown drug id: x");
        let dataset: ApiError = EngineError::Dataset("broken".into()).into();
        assert!(matches!(dataset, ApiError::Internal));
        assert_eq!(dataset.status(), StatusCode::INTERNAL_SERVER_ERROR);
        assert!(
            !dataset.to_string().contains("broken"),
            "details stay in the log"
        );
    }
}
