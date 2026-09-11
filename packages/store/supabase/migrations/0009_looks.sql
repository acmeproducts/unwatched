-- What the island's buildings look like when a builder described them: one SVG per look, drawn in the island's hand.
create table if not exists looks (
  town_id text not null,
  hash text not null,
  look text not null,
  svg text not null,
  source text not null default 'recraft',
  created_at timestamptz not null default now(),
  primary key (town_id, hash)
);
alter table looks enable row level security;
create policy "looks are public" on looks for select using (true);
