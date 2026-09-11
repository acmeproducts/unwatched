-- What people built. Positions and roads live in code; the record keeps names, owners, sites, beds and shops.
alter table towns add column if not exists places jsonb not null default '[]'::jsonb;
alter table towns add column if not exists jobs jsonb not null default '[]'::jsonb;
