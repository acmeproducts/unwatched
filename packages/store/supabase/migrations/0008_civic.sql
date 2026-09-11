-- The institutions: who is mayor, since when, and what the council has built.
alter table towns add column if not exists civic jsonb not null default '{"mayor":null,"elected":0,"works":[]}'::jsonb;
