//! Persistence: saved regimens and the append-only override audit trail.
//!
//! Two interchangeable stores behind one enum (no trait objects needed):
//! `Memory` (default — tests, e2e, demos without infrastructure) and
//! `Postgres` (`APP_DATABASE_URL`; migrations run at startup). Data only —
//! validation lives in the routes. Synthetic data only: no patient fields.

mod memory;
mod pg;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub use memory::MemoryStore;
pub use pg::PgStore;

/// Who made a decision. There is no login in this demo, so it is a fixed
/// pseudonym — never a person's name.
pub const ACTOR: &str = "demo-clinician";

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Regimen {
    pub id: Uuid,
    pub label: String,
    pub drug_ids: Vec<String>,
    pub dataset_version: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// What a client may set on a regimen.
#[derive(Debug, Clone)]
pub struct RegimenInput {
    pub label: String,
    pub drug_ids: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OverrideAction {
    /// keep a contraindicated pair, with a documented reason
    Override,
    /// withdraw an earlier override (the alert fires again)
    Revoke,
}

impl OverrideAction {
    fn as_str(self) -> &'static str {
        match self {
            OverrideAction::Override => "override",
            OverrideAction::Revoke => "revoke",
        }
    }

    fn parse(s: &str) -> Self {
        if s == "revoke" {
            Self::Revoke
        } else {
            Self::Override
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct OverrideEvent {
    pub id: i64,
    pub regimen_id: Option<Uuid>,
    /// ordered pair: drug_a < drug_b
    pub drug_a: String,
    pub drug_b: String,
    pub action: OverrideAction,
    pub reason: String,
    pub actor: String,
    pub severity: String,
    pub severity_basis: String,
    pub created_at: DateTime<Utc>,
}

/// An event to append (the store fills id, actor and time).
#[derive(Debug, Clone)]
pub struct NewOverrideEvent {
    pub regimen_id: Option<Uuid>,
    pub drug_a: String,
    pub drug_b: String,
    pub action: OverrideAction,
    pub reason: String,
    pub severity: String,
    pub severity_basis: String,
}

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("not found")]
    NotFound,
    #[error("database error: {0}")]
    Db(#[from] sqlx::Error),
    #[error("migration error: {0}")]
    Migrate(#[from] sqlx::migrate::MigrateError),
}

#[derive(Clone)]
pub enum Store {
    Memory(MemoryStore),
    Postgres(PgStore),
}

impl Store {
    pub fn memory() -> Self {
        Store::Memory(MemoryStore::default())
    }

    /// Connect, run migrations; fail fast at startup when the DB is unusable.
    pub async fn postgres(url: &str) -> Result<Self, StoreError> {
        Ok(Store::Postgres(PgStore::connect(url).await?))
    }

    pub fn kind(&self) -> &'static str {
        match self {
            Store::Memory(_) => "memory",
            Store::Postgres(_) => "postgres",
        }
    }

    /// Live (not deleted) regimens, most recently updated first.
    pub async fn list_regimens(&self) -> Result<Vec<Regimen>, StoreError> {
        match self {
            Store::Memory(m) => Ok(m.list_regimens()),
            Store::Postgres(p) => p.list_regimens().await,
        }
    }

    pub async fn get_regimen(&self, id: Uuid) -> Result<Regimen, StoreError> {
        match self {
            Store::Memory(m) => m.get_regimen(id),
            Store::Postgres(p) => p.get_regimen(id).await,
        }
    }

    /// Save a regimen and attach the overrides decided before it was saved
    /// (one transaction in Postgres).
    pub async fn create_regimen(
        &self,
        input: RegimenInput,
        dataset_version: &str,
        overrides: Vec<NewOverrideEvent>,
    ) -> Result<(Regimen, Vec<OverrideEvent>), StoreError> {
        match self {
            Store::Memory(m) => Ok(m.create_regimen(input, dataset_version, overrides)),
            Store::Postgres(p) => p.create_regimen(input, dataset_version, overrides).await,
        }
    }

    pub async fn update_regimen(
        &self,
        id: Uuid,
        input: RegimenInput,
    ) -> Result<Regimen, StoreError> {
        match self {
            Store::Memory(m) => m.update_regimen(id, input),
            Store::Postgres(p) => p.update_regimen(id, input).await,
        }
    }

    /// Soft delete: the regimen disappears from lists; its audit rows stay.
    pub async fn delete_regimen(&self, id: Uuid) -> Result<(), StoreError> {
        match self {
            Store::Memory(m) => m.delete_regimen(id),
            Store::Postgres(p) => p.delete_regimen(id).await,
        }
    }

    pub async fn append_override(
        &self,
        event: NewOverrideEvent,
    ) -> Result<OverrideEvent, StoreError> {
        match self {
            Store::Memory(m) => m.append_override(event),
            Store::Postgres(p) => p.append_override(event).await,
        }
    }

    /// Audit events, oldest first: for one regimen, or the most recent
    /// `limit` across all regimens (incl. unsaved) when `regimen` is None.
    pub async fn list_overrides(
        &self,
        regimen: Option<Uuid>,
        limit: i64,
    ) -> Result<Vec<OverrideEvent>, StoreError> {
        match self {
            Store::Memory(m) => Ok(m.list_overrides(regimen, limit)),
            Store::Postgres(p) => p.list_overrides(regimen, limit).await,
        }
    }
}

/// Overrides currently in force: the latest event per pair is an override.
pub fn active_overrides(events: &[OverrideEvent]) -> Vec<&OverrideEvent> {
    let mut latest: Vec<&OverrideEvent> = Vec::new();
    for e in events {
        match latest
            .iter_mut()
            .find(|l| l.drug_a == e.drug_a && l.drug_b == e.drug_b)
        {
            Some(slot) if slot.created_at <= e.created_at => *slot = e,
            Some(_) => {}
            None => latest.push(e),
        }
    }
    latest.retain(|e| e.action == OverrideAction::Override);
    latest
}
