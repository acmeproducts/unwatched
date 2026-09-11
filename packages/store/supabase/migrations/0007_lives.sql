-- The library: the book of every life that ended on the island, written by the town once someone has gone.
create table if not exists lives (
  town_id text not null,
  agent_id text not null,
  name text not null,
  title text not null,
  text text not null,
  epitaph text not null,
  how text not null,
  arrived_day integer not null,
  left_day integer not null,
  created_at timestamptz not null default now(),
  primary key (town_id, agent_id)
);
alter table lives enable row level security;
create policy "lives are public" on lives for select using (true);
