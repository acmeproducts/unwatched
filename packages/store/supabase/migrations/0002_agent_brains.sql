-- Per-agent minds. Keys live here and nowhere else; only the service role can read this table.
create table if not exists agent_brains (
  agent_id text primary key references agents(id) on delete cascade,
  kind text not null default 'hosted' check (kind in ('hosted','own_key','own_brain')),
  provider text,
  api_key text,
  models jsonb,
  think_every integer,
  daily_cap_usd real,
  token text unique,
  memory text not null default 'lease' check (memory in ('lease','own')),
  updated_at timestamptz not null default now()
);
alter table agent_brains enable row level security;
-- no policies on purpose: nobody but the service role reads keys
