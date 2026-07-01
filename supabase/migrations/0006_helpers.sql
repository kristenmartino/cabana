-- 0006_helpers.sql — actor helper for the audit trail
-- Server actions and edge functions call this (via rpc) before any status
-- write so the transition guard (0002) records who acted through which channel.
-- Transaction-local (third arg true): the setting dies with the transaction.

create or replace function set_actor(actor text)
returns void language sql as $$
  select set_config('cabana.actor', actor, true);
$$;

-- Service-role only: no grant to anon/authenticated (write lockdown in 0005
-- already revoked; rpc from the browser would fail RLS-side anyway, but be explicit).
revoke execute on function set_actor(text) from anon, authenticated;
