-- Saved regimens and the append-only override audit trail.
-- Synthetic demo data only: there are NO patient fields anywhere.

create table regimens (
    id              uuid primary key,
    label           text not null check (char_length(label) between 1 and 80),
    drug_ids        text[] not null check (cardinality(drug_ids) between 1 and 20),
    -- which dataset build the ids refer to (engine counts), so an old save is recognisable
    dataset_version text not null,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    -- soft delete: audit rows keep their foreign key
    deleted_at      timestamptz
);

create index regimens_live on regimens (updated_at desc) where deleted_at is null;

create table override_events (
    id             bigint generated always as identity primary key,
    -- null = recorded on an unsaved regimen (still audited)
    regimen_id     uuid references regimens (id),
    -- ordered pair key: drug_a < drug_b
    drug_a         text not null,
    drug_b         text not null check (drug_a < drug_b),
    action         text not null check (action in ('override', 'revoke')),
    reason         text not null check (char_length(reason) between 3 and 500),
    -- pseudonym, never a person (no login in this demo)
    actor          text not null default 'demo-clinician',
    -- dataset facts at decision time
    severity       text not null,
    severity_basis text not null,
    created_at     timestamptz not null default now()
);

create index override_events_by_regimen on override_events (regimen_id, created_at);

-- Append-only: an audit trail that can be edited is not an audit trail.
create function override_events_append_only() returns trigger
language plpgsql as $$
begin
    raise exception 'override_events is append-only (% rejected)', tg_op
        using errcode = 'insufficient_privilege';
end
$$;

create trigger override_events_no_update_delete
    before update or delete on override_events
    for each row execute function override_events_append_only();

create trigger override_events_no_truncate
    before truncate on override_events
    for each statement execute function override_events_append_only();
