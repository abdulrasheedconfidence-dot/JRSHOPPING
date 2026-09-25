create table if not exists public.event_ticket_orders (
  id uuid primary key default gen_random_uuid(),
  event_slug text not null default 'sheen-awards-2026',
  tx_ref text not null unique,
  payment_status text not null default 'pending_payment'
    check (payment_status in ('pending_payment', 'payment_setup_failed', 'paid')),
  currency text not null,
  amount numeric(12, 2) not null check (amount > 0),
  ticket_items jsonb not null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  payment_link text,
  flutterwave_transaction_id text,
  paid_at timestamptz,
  customer_receipt_sent boolean not null default false,
  owner_notification_sent boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists event_ticket_orders_created_at_idx on public.event_ticket_orders (created_at desc);
create index if not exists event_ticket_orders_payment_status_idx on public.event_ticket_orders (payment_status);

alter table public.event_ticket_orders enable row level security;
revoke all on table public.event_ticket_orders from anon, authenticated;
grant all on table public.event_ticket_orders to service_role;

create or replace function public.reserve_sheen_ticket_order(
  p_tx_ref text,
  p_currency text,
  p_amount numeric,
  p_ticket_items jsonb,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_general_limit integer default 0,
  p_vip_limit integer default 0
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  reserved_id uuid;
  general_sold integer;
  vip_sold integer;
  general_requested integer := coalesce((p_ticket_items->>'general_admission')::integer, 0);
  vip_requested integer := coalesce((p_ticket_items->>'vip_experience')::integer, 0);
begin
  perform pg_advisory_xact_lock(hashtext('sheen-awards-2026-ticket-inventory'));

  select coalesce(sum(coalesce((ticket_items->>'general_admission')::integer, 0)), 0),
         coalesce(sum(coalesce((ticket_items->>'vip_experience')::integer, 0)), 0)
    into general_sold, vip_sold
    from public.event_ticket_orders
   where event_slug = 'sheen-awards-2026'
     and (payment_status = 'paid' or (payment_status = 'pending_payment' and created_at > now() - interval '30 minutes'));

  if p_general_limit > 0 and general_sold + general_requested > p_general_limit then
    raise exception 'There are not enough General Admission tickets remaining.' using errcode = 'P0001';
  end if;
  if p_vip_limit > 0 and vip_sold + vip_requested > p_vip_limit then
    raise exception 'There are not enough VIP tickets remaining.' using errcode = 'P0001';
  end if;

  insert into public.event_ticket_orders (
    tx_ref, currency, amount, ticket_items, customer_name, customer_email, customer_phone
  ) values (
    p_tx_ref, p_currency, p_amount, p_ticket_items, p_customer_name, p_customer_email, p_customer_phone
  ) returning id into reserved_id;

  return reserved_id;
end;
$$;

revoke all on function public.reserve_sheen_ticket_order(text, text, numeric, jsonb, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_sheen_ticket_order(text, text, numeric, jsonb, text, text, text, integer, integer) to service_role;
