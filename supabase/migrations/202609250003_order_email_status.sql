alter table public.orders
  add column if not exists customer_receipt_sent boolean not null default false,
  add column if not exists owner_notification_sent boolean not null default false;
