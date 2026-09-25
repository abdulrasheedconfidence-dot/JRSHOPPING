create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  tx_ref text not null unique,
  payment_status text not null default 'pending_payment'
    check (payment_status in ('pending_payment', 'payment_setup_failed', 'paid')),
  currency text not null,
  amount numeric(12, 2) not null check (amount > 0),
  items jsonb not null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  shipping_address jsonb not null,
  payment_link text,
  flutterwave_transaction_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_payment_status_idx on public.orders (payment_status);

alter table public.orders enable row level security;
revoke all on table public.orders from anon, authenticated;
grant all on table public.orders to service_role;
