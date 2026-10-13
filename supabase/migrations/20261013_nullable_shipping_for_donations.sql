-- Donation-only checkout does not collect a delivery address.
alter table public.orders
  alter column shipping_address drop not null;
