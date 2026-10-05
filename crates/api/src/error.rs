//! API error taxonomy mapped onto HTTP responses.

use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("unknown drug id: {0}")]
    UnknownDrug(String),
    #[error("llm upstream error: {0}")]
    LlmUpstream(String),
    #[error("bad request: {0}")]
    BadRequest(String),
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            ApiError::UnknownDrug(_) => (StatusCode::NOT_FOUND, self.to_string()),
            ApiError::LlmUpstream(_) => (StatusCode::BAD_GATEWAY, self.to_string()),
            ApiError::BadRequest(_) => (StatusCode::BAD_REQUEST, self.to_string()),
        };
        (status, Json(json!({ "error": message }))).into_response()
    }
}
