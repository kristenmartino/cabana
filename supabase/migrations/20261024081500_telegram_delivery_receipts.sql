-- Telegram sends run from Supabase rather than the unreliable Railway egress.
-- A short lease prevents overlapping n8n sweeps from sending the same event.
-- Receipts are written only after Telegram returns a successful message ID.
alter table public.outbox
  add column telegram_message_id bigint check (telegram_message_id > 0),
  add column telegram_claim_token uuid,
  add column telegram_claim_until timestamptz;

-- Validate the caller's database role, rather than comparing its JWT bytes
-- with the platform's internally minted service token.
create function public.authorize_telegram_worker()
returns boolean language sql stable security invoker set search_path = public as $$
  select current_user = 'service_role';
$$;
revoke all on function public.authorize_telegram_worker() from public, anon, authenticated;
grant execute on function public.authorize_telegram_worker() to service_role;

create function public.claim_telegram_delivery(p_outbox_id bigint)
returns uuid language sql security invoker set search_path = public as $$
  update outbox
  set telegram_claim_token = gen_random_uuid(),
      telegram_claim_until = now() + interval '45 seconds'
  where id = p_outbox_id
    and telegram_delivered_at is null
    and dead_lettered_at is null
    and (telegram_claim_until is null or telegram_claim_until < now())
  returning telegram_claim_token;
$$;

create function public.complete_telegram_delivery(
  p_outbox_id bigint, p_claim_token uuid, p_message_id bigint
) returns boolean language plpgsql security invoker set search_path = public as $$
begin
  update outbox
  set telegram_delivered_at = now(), telegram_message_id = p_message_id,
      telegram_claim_token = null, telegram_claim_until = null
  where id = p_outbox_id and telegram_claim_token = p_claim_token
    and telegram_delivered_at is null;
  if not found then return false; end if;
  -- Keep the original failure details; resolving is distinct from deleting.
  update dead_letters set resolved_at = now()
  where outbox_id = p_outbox_id and resolved_at is null;
  return true;
end;
$$;

revoke all on function public.claim_telegram_delivery(bigint) from public, anon, authenticated;
revoke all on function public.complete_telegram_delivery(bigint, uuid, bigint) from public, anon, authenticated;
grant execute on function public.claim_telegram_delivery(bigint) to service_role;
grant execute on function public.complete_telegram_delivery(bigint, uuid, bigint) to service_role;
