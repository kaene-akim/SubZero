-- Defense-in-depth row level security.
-- The application connects as the database owner, which bypasses RLS; every
-- repository query is additionally scoped by user_id in code. These policies
-- protect the data when the database is exposed through a secondary role
-- (for example Supabase's PostgREST / anon key). In production, connect the
-- application through a non-owner role with FORCE ROW LEVEL SECURITY enabled.

create or replace function app_current_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

alter table users enable row level security;
drop policy if exists users_self on users;
create policy users_self on users using (id = app_current_user_id()) with check (id = app_current_user_id());

alter table sessions enable row level security;
drop policy if exists sessions_owner on sessions;
create policy sessions_owner on sessions using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());

alter table auth_tokens enable row level security;
drop policy if exists auth_tokens_owner on auth_tokens;
create policy auth_tokens_owner on auth_tokens using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());

alter table oauth_states enable row level security;
drop policy if exists oauth_states_owner on oauth_states;
create policy oauth_states_owner on oauth_states using (user_id = app_current_user_id() or user_id is null) with check (user_id = app_current_user_id() or user_id is null);

alter table connected_accounts enable row level security;
drop policy if exists connected_accounts_owner on connected_accounts;
create policy connected_accounts_owner on connected_accounts using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());

alter table push_subscriptions enable row level security;
drop policy if exists push_subscriptions_owner on push_subscriptions;
create policy push_subscriptions_owner on push_subscriptions using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());

alter table subscriptions enable row level security;
drop policy if exists subscriptions_owner on subscriptions;
create policy subscriptions_owner on subscriptions using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());

alter table price_history enable row level security;
drop policy if exists price_history_owner on price_history;
create policy price_history_owner on price_history using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());

alter table bundles enable row level security;
drop policy if exists bundles_owner on bundles;
create policy bundles_owner on bundles using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());

alter table bundle_items enable row level security;
drop policy if exists bundle_items_owner on bundle_items;
create policy bundle_items_owner on bundle_items using (
  exists (select 1 from bundles b where b.id = bundle_items.bundle_id and b.user_id = app_current_user_id())
) with check (
  exists (select 1 from bundles b where b.id = bundle_items.bundle_id and b.user_id = app_current_user_id())
);

alter table payments enable row level security;
drop policy if exists payments_owner on payments;
create policy payments_owner on payments using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());

alter table notifications enable row level security;
drop policy if exists notifications_owner on notifications;
create policy notifications_owner on notifications using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());

alter table email_detections enable row level security;
drop policy if exists email_detections_owner on email_detections;
create policy email_detections_owner on email_detections using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());

alter table transaction_records enable row level security;
drop policy if exists transaction_records_owner on transaction_records;
create policy transaction_records_owner on transaction_records using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());

alter table watched_discounts enable row level security;
drop policy if exists watched_discounts_owner on watched_discounts;
create policy watched_discounts_owner on watched_discounts using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());

alter table audit_logs enable row level security;
drop policy if exists audit_logs_owner on audit_logs;
create policy audit_logs_owner on audit_logs using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());

alter table idempotency_keys enable row level security;
drop policy if exists idempotency_keys_owner on idempotency_keys;
create policy idempotency_keys_owner on idempotency_keys using (user_id = app_current_user_id() or user_id is null) with check (user_id = app_current_user_id() or user_id is null);

-- Public catalog is readable by any authenticated role. Writes are performed by
-- the service role only (no insert/update policies are defined).
alter table providers enable row level security;
drop policy if exists providers_public_read on providers;
create policy providers_public_read on providers for select using (true);

alter table offers enable row level security;
drop policy if exists offers_public_read on offers;
create policy offers_public_read on offers for select using (true);

alter table discounts enable row level security;
drop policy if exists discounts_public_read on discounts;
create policy discounts_public_read on discounts for select using (true);

alter table provider_integrations enable row level security;
drop policy if exists provider_integrations_public_read on provider_integrations;
create policy provider_integrations_public_read on provider_integrations for select using (true);

alter table exchange_rates enable row level security;
drop policy if exists exchange_rates_public_read on exchange_rates;
create policy exchange_rates_public_read on exchange_rates for select using (true);

alter table offer_verifications enable row level security;
drop policy if exists offer_verifications_public_read on offer_verifications;
create policy offer_verifications_public_read on offer_verifications for select using (true);
