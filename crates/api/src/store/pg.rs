//! Postgres store (sqlx 0.9). Queries are compile-time checked against the
//! migrations (`query!` macros; offline metadata in `.sqlx/`, refresh with
//! `cargo sqlx prepare --workspace` against a migrated database).

use std::time::Duration;

use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;
use uuid::Uuid;

use super::{
    ACTOR, NewOverrideEvent, OverrideAction, OverrideEvent, Regimen, RegimenInput, StoreError,
};

#[derive(Clone)]
pub struct PgStore {
    pool: PgPool,
}

macro_rules! event_from_row {
    ($r:expr) => {
        OverrideEvent {
            id: $r.id,
            regimen_id: $r.regimen_id,
            drug_a: $r.drug_a,
            drug_b: $r.drug_b,
            action: OverrideAction::parse(&$r.action),
            reason: $r.reason,
            actor: $r.actor,
            severity: $r.severity,
            severity_basis: $r.severity_basis,
            created_at: $r.created_at,
        }
    };
}

impl PgStore {
    pub async fn connect(url: &str) -> Result<Self, StoreError> {
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .acquire_timeout(Duration::from_secs(5))
            .connect(url)
            .await?;
        sqlx::migrate!("./migrations").run(&pool).await?;
        Ok(Self { pool })
    }

    /// For tests that bring their own (migrated) pool.
    pub fn from_pool(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn list_regimens(&self) -> Result<Vec<Regimen>, StoreError> {
        let rows = sqlx::query_as!(
            Regimen,
            "select id, label, drug_ids, dataset_version, created_at, updated_at
             from regimens where deleted_at is null order by updated_at desc limit 200"
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    pub async fn get_regimen(&self, id: Uuid) -> Result<Regimen, StoreError> {
        sqlx::query_as!(
            Regimen,
            "select id, label, drug_ids, dataset_version, created_at, updated_at
             from regimens where id = $1 and deleted_at is null",
            id
        )
        .fetch_optional(&self.pool)
        .await?
        .ok_or(StoreError::NotFound)
    }

    pub async fn create_regimen(
        &self,
        input: RegimenInput,
        dataset_version: &str,
        overrides: Vec<NewOverrideEvent>,
    ) -> Result<(Regimen, Vec<OverrideEvent>), StoreError> {
        let mut tx = self.pool.begin().await?;
        let regimen = sqlx::query_as!(
            Regimen,
            "insert into regimens (id, label, drug_ids, dataset_version) values ($1, $2, $3, $4)
             returning id, label, drug_ids, dataset_version, created_at, updated_at",
            Uuid::new_v4(),
            input.label,
            &input.drug_ids,
            dataset_version
        )
        .fetch_one(&mut *tx)
        .await?;
        let mut events = Vec::with_capacity(overrides.len());
        for o in overrides {
            let r = sqlx::query!(
                "insert into override_events
                   (regimen_id, drug_a, drug_b, action, reason, actor, severity, severity_basis)
                 values ($1, $2, $3, $4, $5, $6, $7, $8)
                 returning id, regimen_id, drug_a, drug_b, action, reason, actor, severity, severity_basis, created_at",
                regimen.id,
                o.drug_a,
                o.drug_b,
                o.action.as_str(),
                o.reason,
                ACTOR,
                o.severity,
                o.severity_basis
            )
            .fetch_one(&mut *tx)
            .await?;
            events.push(event_from_row!(r));
        }
        tx.commit().await?;
        Ok((regimen, events))
    }

    pub async fn update_regimen(
        &self,
        id: Uuid,
        input: RegimenInput,
    ) -> Result<Regimen, StoreError> {
        sqlx::query_as!(
            Regimen,
            "update regimens set label = $2, drug_ids = $3, updated_at = now()
             where id = $1 and deleted_at is null
             returning id, label, drug_ids, dataset_version, created_at, updated_at",
            id,
            input.label,
            &input.drug_ids
        )
        .fetch_optional(&self.pool)
        .await?
        .ok_or(StoreError::NotFound)
    }

    pub async fn delete_regimen(&self, id: Uuid) -> Result<(), StoreError> {
        let done = sqlx::query!(
            "update regimens set deleted_at = now() where id = $1 and deleted_at is null",
            id
        )
        .execute(&self.pool)
        .await?;
        if done.rows_affected() == 0 {
            return Err(StoreError::NotFound);
        }
        Ok(())
    }

    pub async fn append_override(&self, o: NewOverrideEvent) -> Result<OverrideEvent, StoreError> {
        let r = sqlx::query!(
            "insert into override_events
               (regimen_id, drug_a, drug_b, action, reason, actor, severity, severity_basis)
             values ($1, $2, $3, $4, $5, $6, $7, $8)
             returning id, regimen_id, drug_a, drug_b, action, reason, actor, severity, severity_basis, created_at",
            o.regimen_id,
            o.drug_a,
            o.drug_b,
            o.action.as_str(),
            o.reason,
            ACTOR,
            o.severity,
            o.severity_basis
        )
        .fetch_one(&self.pool)
        .await
        .map_err(|e| match &e {
            // unknown regimen id → foreign key violation
            sqlx::Error::Database(db) if db.code().as_deref() == Some("23503") => StoreError::NotFound,
            _ => StoreError::Db(e),
        })?;
        Ok(event_from_row!(r))
    }

    pub async fn list_overrides(
        &self,
        regimen: Option<Uuid>,
        limit: i64,
    ) -> Result<Vec<OverrideEvent>, StoreError> {
        let rows = sqlx::query!(
            "select * from (
               select id, regimen_id, drug_a, drug_b, action, reason, actor, severity, severity_basis, created_at
               from override_events
               where ($1::uuid is null or regimen_id = $1)
               order by id desc limit $2
             ) recent order by id",
            regimen,
            limit
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|r| event_from_row!(r)).collect())
    }
}
