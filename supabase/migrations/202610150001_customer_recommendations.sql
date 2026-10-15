create table if not exists public.customer_recommendations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  message text not null check (char_length(message) between 5 and 1200),
  created_at timestamptz not null default now()
);

create index if not exists customer_recommendations_created_at_idx
  on public.customer_recommendations (created_at desc);

alter table public.customer_recommendations enable row level security;
revoke all on table public.customer_recommendations from anon, authenticated;
grant all on table public.customer_recommendations to service_role;
