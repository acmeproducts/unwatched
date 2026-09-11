-- Small Hours · the town's record. Every row is a fact about the island.
create extension if not exists vector;

create table if not exists towns (
  id text primary key,
  name text not null,
  seed integer not null,
  sim_t bigint not null default 0,
  day integer not null default 1,
  weather text not null default 'clear',
  flour_shortage boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists owners (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  plan text not null default 'visitor',
  credits integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists agents (
  id text primary key,
  town_id text not null references towns(id) on delete cascade,
  owner_id uuid references owners(id) on delete set null,
  name text not null,
  persona jsonb not null,
  appearance jsonb not null default '{}'::jsonb,
  brain text not null default 'hosted',
  funded boolean not null default true,
  state jsonb not null default '{}'::jsonb,   -- needs, location, coins, inventory, job, home, asleep, budget, intentions
  arrived_t bigint,
  left_t bigint,
  created_at timestamptz not null default now()
);
create index if not exists agents_town on agents(town_id);
create index if not exists agents_owner on agents(owner_id);

create table if not exists events (
  id bigserial primary key,
  town_id text not null references towns(id) on delete cascade,
  t bigint not null,
  day integer not null,
  kind text not null,
  actors text[] not null default '{}',
  place text,
  text text not null,
  importance real not null,
  payload jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_town_t on events(town_id, t);
create index if not exists events_actors on events using gin(actors);
create index if not exists events_importance on events(town_id, importance desc);

create table if not exists memories (
  id bigserial primary key,
  agent_id text not null references agents(id) on delete cascade,
  t bigint not null,
  kind text not null,
  text text not null,
  importance real not null,
  embedding vector(1024),
  created_at timestamptz not null default now()
);
create index if not exists memories_agent_t on memories(agent_id, t);

create table if not exists relationships (
  agent_id text not null references agents(id) on delete cascade,
  other_id text not null references agents(id) on delete cascade,
  trust real not null default 0.3,
  affection real not null default 0.3,
  last_seen bigint not null default 0,
  opinion text not null default '',
  primary key (agent_id, other_id)
);

create table if not exists letters (
  id bigserial primary key,
  agent_id text not null references agents(id) on delete cascade,
  owner_id uuid references owners(id) on delete set null,
  direction text not null check (direction in ('to_agent','to_owner')),
  text text not null,
  t bigint not null,
  read_at bigint,
  created_at timestamptz not null default now()
);
create index if not exists letters_agent on letters(agent_id, t);

create table if not exists papers (
  town_id text not null references towns(id) on delete cascade,
  edition integer not null,
  paper jsonb not null,
  created_at timestamptz not null default now(),
  primary key (town_id, edition)
);

create table if not exists laws (
  id bigserial primary key,
  town_id text not null references towns(id) on delete cascade,
  text text not null,
  proposed_by text references agents(id),
  yes integer not null default 0,
  no integer not null default 0,
  open boolean not null default true,
  created_t bigint not null
);

create table if not exists standing_instructions (
  agent_id text primary key references agents(id) on delete cascade,
  text text not null default '',
  updated_at timestamptz not null default now()
);

-- Row level security: the town is public to read, owners write only their own.
alter table owners enable row level security;
alter table agents enable row level security;
alter table events enable row level security;
alter table memories enable row level security;
alter table relationships enable row level security;
alter table letters enable row level security;
alter table papers enable row level security;
alter table laws enable row level security;
alter table standing_instructions enable row level security;
alter table towns enable row level security;

create policy "towns are public" on towns for select using (true);
create policy "agents are public" on agents for select using (true);
create policy "events are public" on events for select using (true);
create policy "papers are public" on papers for select using (true);
create policy "laws are public" on laws for select using (true);
create policy "owners see themselves" on owners for select using (auth.uid() = id);
create policy "owners edit themselves" on owners for update using (auth.uid() = id);
create policy "owners insert themselves" on owners for insert with check (auth.uid() = id);
create policy "memories are the owner's" on memories for select using (exists (select 1 from agents a where a.id = memories.agent_id and a.owner_id = auth.uid()));
create policy "relationships are the owner's" on relationships for select using (exists (select 1 from agents a where a.id = relationships.agent_id and a.owner_id = auth.uid()));
create policy "letters are the owner's" on letters for select using (owner_id = auth.uid());
create policy "owners write letters" on letters for insert with check (owner_id = auth.uid() and direction = 'to_agent');
create policy "instructions are the owner's" on standing_instructions for all using (exists (select 1 from agents a where a.id = standing_instructions.agent_id and a.owner_id = auth.uid()));

-- The engine writes with the service role, which bypasses RLS.

-- Owners row appears the moment someone signs in.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.owners (id, email) values (new.id, new.email) on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
