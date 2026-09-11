-- One record, many islands. Everything that belongs to a person also names their island.
alter table memories add column if not exists town_id text references towns(id) on delete cascade;
alter table relationships add column if not exists town_id text references towns(id) on delete cascade;
alter table letters add column if not exists town_id text references towns(id) on delete cascade;
alter table agent_brains add column if not exists town_id text references towns(id) on delete cascade;
update memories m set town_id = a.town_id from agents a where m.agent_id = a.id and m.town_id is null;
update relationships r set town_id = a.town_id from agents a where r.agent_id = a.id and r.town_id is null;
update letters l set town_id = a.town_id from agents a where l.agent_id = a.id and l.town_id is null;
update agent_brains b set town_id = a.town_id from agents a where b.agent_id = a.id and b.town_id is null;
create index if not exists memories_town on memories(town_id);
create index if not exists relationships_town on relationships(town_id);
create index if not exists letters_town on letters(town_id);
create index if not exists agent_brains_town on agent_brains(town_id);
