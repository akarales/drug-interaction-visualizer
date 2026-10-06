//! In-memory store: same semantics as Postgres (soft delete, append-only
//! events, regimen must exist), so tests and the e2e run need no database.

use std::sync::{Arc, Mutex, MutexGuard};

use chrono::Utc;
use uuid::Uuid;

use super::{ACTOR, NewOverrideEvent, OverrideEvent, Regimen, RegimenInput, StoreError};

#[derive(Default)]
struct Inner {
    regimens: Vec<(Regimen, bool)>, // (regimen, deleted)
    events: Vec<OverrideEvent>,
}

#[derive(Clone, Default)]
pub struct MemoryStore {
    inner: Arc<Mutex<Inner>>,
}

impl MemoryStore {
    fn lock(&self) -> MutexGuard<'_, Inner> {
        // a panic while holding the lock leaves plain data intact: keep serving
        self.inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn list_regimens(&self) -> Vec<Regimen> {
        let mut out: Vec<Regimen> = self
            .lock()
            .regimens
            .iter()
            .filter(|(_, d)| !d)
            .map(|(r, _)| r.clone())
            .collect();
        out.sort_by_key(|r| std::cmp::Reverse(r.updated_at));
        out
    }

    pub fn get_regimen(&self, id: Uuid) -> Result<Regimen, StoreError> {
        self.lock()
            .regimens
            .iter()
            .find(|(r, d)| r.id == id && !d)
            .map(|(r, _)| r.clone())
            .ok_or(StoreError::NotFound)
    }

    pub fn create_regimen(
        &self,
        input: RegimenInput,
        dataset_version: &str,
        overrides: Vec<NewOverrideEvent>,
    ) -> (Regimen, Vec<OverrideEvent>) {
        let now = Utc::now();
        let regimen = Regimen {
            id: Uuid::new_v4(),
            label: input.label,
            drug_ids: input.drug_ids,
            dataset_version: dataset_version.to_string(),
            created_at: now,
            updated_at: now,
        };
        self.lock().regimens.push((regimen.clone(), false));
        let events = overrides
            .into_iter()
            .map(|o| {
                self.push_event(NewOverrideEvent {
                    regimen_id: Some(regimen.id),
                    ..o
                })
            })
            .collect();
        (regimen, events)
    }

    pub fn update_regimen(&self, id: Uuid, input: RegimenInput) -> Result<Regimen, StoreError> {
        let mut inner = self.lock();
        let (regimen, _) = inner
            .regimens
            .iter_mut()
            .find(|(r, d)| r.id == id && !d)
            .ok_or(StoreError::NotFound)?;
        regimen.label = input.label;
        regimen.drug_ids = input.drug_ids;
        regimen.updated_at = Utc::now();
        Ok(regimen.clone())
    }

    pub fn delete_regimen(&self, id: Uuid) -> Result<(), StoreError> {
        let mut inner = self.lock();
        let (_, deleted) = inner
            .regimens
            .iter_mut()
            .find(|(r, d)| r.id == id && !d)
            .ok_or(StoreError::NotFound)?;
        *deleted = true;
        Ok(())
    }

    pub fn append_override(&self, event: NewOverrideEvent) -> Result<OverrideEvent, StoreError> {
        if let Some(id) = event.regimen_id {
            // like the foreign key: the regimen must exist (deleted ones still count)
            if !self.lock().regimens.iter().any(|(r, _)| r.id == id) {
                return Err(StoreError::NotFound);
            }
        }
        Ok(self.push_event(event))
    }

    fn push_event(&self, e: NewOverrideEvent) -> OverrideEvent {
        let mut inner = self.lock();
        let event = OverrideEvent {
            id: inner.events.len() as i64 + 1,
            regimen_id: e.regimen_id,
            drug_a: e.drug_a,
            drug_b: e.drug_b,
            action: e.action,
            reason: e.reason,
            actor: ACTOR.to_string(),
            severity: e.severity,
            severity_basis: e.severity_basis,
            created_at: Utc::now(),
        };
        inner.events.push(event.clone());
        event
    }

    pub fn list_overrides(&self, regimen: Option<Uuid>, limit: i64) -> Vec<OverrideEvent> {
        let inner = self.lock();
        let matching: Vec<&OverrideEvent> = inner
            .events
            .iter()
            .filter(|e| regimen.is_none_or(|id| e.regimen_id == Some(id)))
            .collect();
        let skip = matching
            .len()
            .saturating_sub(usize::try_from(limit).unwrap_or(usize::MAX));
        matching.into_iter().skip(skip).cloned().collect()
    }
}
