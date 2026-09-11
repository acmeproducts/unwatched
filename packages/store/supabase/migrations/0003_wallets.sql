-- Credits pay for thinking. Coins are earned on the island. There is no exchange between them.
create table if not exists owner_wallets (
  owner_id text primary key,                 -- auth user id, or a dev name locally
  plan text not null default 'visitor' check (plan in ('visitor','resident','patron')),
  credits integer not null default 0,
  stripe_customer text,
  updated_at timestamptz not null default now()
);
create table if not exists credit_ledger (
  id bigserial primary key,
  owner_id text not null,
  delta integer not null,
  reason text not null,                       -- purchase, thought, stakes, reflection, refund, grant
  ref text,                                   -- stripe session or agent id
  created_at timestamptz not null default now()
);
create index if not exists credit_ledger_owner on credit_ledger(owner_id, id desc);
alter table owner_wallets enable row level security;
alter table credit_ledger enable row level security;
create policy "wallet is the owner's" on owner_wallets for select using (owner_id = auth.uid()::text);
create policy "ledger is the owner's" on credit_ledger for select using (owner_id = auth.uid()::text);
