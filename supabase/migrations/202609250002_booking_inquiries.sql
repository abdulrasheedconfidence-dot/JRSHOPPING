create table if not exists public.booking_inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  inquiry_type text not null check (inquiry_type in ('meet_greet', 'zoom_course')),
  message text,
  status text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  email_notification_sent boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists booking_inquiries_created_at_idx on public.booking_inquiries (created_at desc);
create index if not exists booking_inquiries_status_idx on public.booking_inquiries (status);

alter table public.booking_inquiries enable row level security;
revoke all on table public.booking_inquiries from anon, authenticated;
grant all on table public.booking_inquiries to service_role;
