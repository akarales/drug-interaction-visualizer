//! Postgres store against a real database (CI job with a postgres:17
//! service; locally `docker compose up -d db`). Run with:
//!   DATABASE_URL=postgresql://app:app@127.0.0.1:5434/ddi_visualizer \
//!     cargo test -p drug-interaction-api --features pg-tests --test pg_store
//! `#[sqlx::test]` creates a fresh database per test and applies the migrations.
#![cfg(feature = "pg-tests")]

use drug_interaction_api::store::{
    NewOverrideEvent, OverrideAction, PgStore, RegimenInput, Store, StoreError,
};
use sqlx::PgPool;

fn event(regimen_id: Option<uuid::Uuid>, action: OverrideAction) -> NewOverrideEvent {
    NewOverrideEvent {
        regimen_id,
        drug_a: "clarithromycin".into(),
        drug_b: "simvastatin".into(),
        action,
        reason: "Specialist recommendation".into(),
        severity: "contraindicated".into(),
        severity_basis: "onc:11".into(),
    }
}

fn input(label: &str) -> RegimenInput {
    RegimenInput {
        label: label.into(),
        drug_ids: vec!["simvastatin".into(), "clarithromycin".into()],
    }
}

#[sqlx::test(migrations = "./migrations")]
async fn regimen_lifecycle_with_soft_delete(pool: PgPool) {
    let store = Store::Postgres(PgStore::from_pool(pool));
    let (regimen, audit) = store
        .create_regimen(
            input("Statin review"),
            "ddi:3:2",
            vec![event(None, OverrideAction::Override)],
        )
        .await
        .expect("create");
    assert_eq!(regimen.drug_ids, vec!["simvastatin", "clarithromycin"]);
    assert_eq!(audit[0].regimen_id, Some(regimen.id));
    assert_eq!(audit[0].actor, "demo-clinician");

    let updated = store
        .update_regimen(regimen.id, input("Statin review v2"))
        .await
        .expect("update");
    assert!(updated.updated_at >= regimen.updated_at);
    store.delete_regimen(regimen.id).await.expect("delete");
    assert!(matches!(
        store.get_regimen(regimen.id).await,
        Err(StoreError::NotFound)
    ));
    assert!(store.list_regimens().await.expect("list").is_empty());
    // audit rows survive the soft delete (and the FK still points at the row)
    assert_eq!(
        store
            .list_overrides(Some(regimen.id), 50)
            .await
            .expect("audit")
            .len(),
        1
    );
}

#[sqlx::test(migrations = "./migrations")]
async fn override_events_are_append_only(pool: PgPool) {
    let store = Store::Postgres(PgStore::from_pool(pool.clone()));
    store
        .append_override(event(None, OverrideAction::Override))
        .await
        .expect("append");
    for sql in [
        "update override_events set reason = 'edited'",
        "delete from override_events",
        "truncate override_events",
    ] {
        let err = sqlx::query(sql).execute(&pool).await.expect_err(sql);
        assert!(err.to_string().contains("append-only"), "{sql}: {err}");
    }
    assert_eq!(
        store.list_overrides(None, 50).await.expect("audit").len(),
        1
    );
}

#[sqlx::test(migrations = "./migrations")]
async fn unknown_regimen_is_not_found(pool: PgPool) {
    let store = Store::Postgres(PgStore::from_pool(pool));
    let ghost = Some(uuid::Uuid::new_v4());
    assert!(matches!(
        store
            .append_override(event(ghost, OverrideAction::Override))
            .await,
        Err(StoreError::NotFound)
    ));
}

#[sqlx::test(migrations = "./migrations")]
async fn database_enforces_the_pair_key_and_limits(pool: PgPool) {
    let store = Store::Postgres(PgStore::from_pool(pool));
    let mut reversed = event(None, OverrideAction::Override);
    std::mem::swap(&mut reversed.drug_a, &mut reversed.drug_b);
    assert!(
        store.append_override(reversed).await.is_err(),
        "drug_a < drug_b is a CHECK constraint"
    );
    let too_long = RegimenInput {
        label: "x".repeat(81),
        drug_ids: vec!["a".into()],
    };
    assert!(store.create_regimen(too_long, "v", vec![]).await.is_err());
}
