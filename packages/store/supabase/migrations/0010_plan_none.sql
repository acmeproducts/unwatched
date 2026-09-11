-- No plan is the state of an account that has not paid: the citizen lives on habit. The Visitor is a paid plan now.
alter table owner_wallets drop constraint if exists owner_wallets_plan_check;
alter table owner_wallets add constraint owner_wallets_plan_check check (plan in ('none','visitor','resident','patron'));
alter table owner_wallets alter column plan set default 'none';
update owner_wallets set plan = 'none' where plan = 'visitor';
