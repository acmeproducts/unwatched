-- Children of the island, growing up in their parents' houses until they come of age.
alter table towns add column if not exists children jsonb not null default '[]'::jsonb;
