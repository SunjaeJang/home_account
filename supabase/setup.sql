create table if not exists public.household_members (
  household_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  member_name text not null check (member_name in ('선재', '혜빈')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (household_id, member_name)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  date date not null,
  title text not null,
  category text not null default '기타',
  amount numeric(14, 0) not null check (amount >= 0),
  member_name text not null check (member_name in ('선재', '혜빈', '함께')),
  method text not null default '',
  note text not null default '',
  type text not null check (type in ('expense', 'income')),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists transactions_household_date_idx
  on public.transactions (household_id, date desc);

alter table public.household_members enable row level security;
alter table public.transactions enable row level security;

revoke all on table public.household_members from anon, authenticated;
grant select on table public.household_members to authenticated;
revoke all on table public.transactions from anon, authenticated;
grant select, insert, update, delete on table public.transactions to authenticated;

drop policy if exists "members read own membership" on public.household_members;
create policy "members read own membership"
  on public.household_members for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "household members read transactions" on public.transactions;
create policy "household members read transactions"
  on public.transactions for select to authenticated
  using (exists (
    select 1 from public.household_members m
    where m.household_id = transactions.household_id
      and m.user_id = (select auth.uid())
  ));

drop policy if exists "household members add transactions" on public.transactions;
create policy "household members add transactions"
  on public.transactions for insert to authenticated
  with check (exists (
    select 1 from public.household_members m
    where m.household_id = transactions.household_id
      and m.user_id = (select auth.uid())
  ) and created_by = (select auth.uid()));

drop policy if exists "household members edit transactions" on public.transactions;
create policy "household members edit transactions"
  on public.transactions for update to authenticated
  using (exists (
    select 1 from public.household_members m
    where m.household_id = transactions.household_id
      and m.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.household_members m
    where m.household_id = transactions.household_id
      and m.user_id = (select auth.uid())
  ));

drop policy if exists "household members delete transactions" on public.transactions;
create policy "household members delete transactions"
  on public.transactions for delete to authenticated
  using (exists (
    select 1 from public.household_members m
    where m.household_id = transactions.household_id
      and m.user_id = (select auth.uid())
  ));

-- Realtime updates between the two signed-in devices.
do $$
begin
  alter publication supabase_realtime add table public.transactions;
exception when duplicate_object then
  null;
end $$;

-- After creating two Auth users in the Supabase dashboard, copy their UUIDs below
-- and run this once. Use the same household UUID for both accounts.
-- insert into public.household_members (household_id, user_id, member_name) values
-- ('11111111-1111-4111-8111-111111111111', 'REPLACE_WITH_SUNJAE_AUTH_USER_UUID', '선재'),
-- ('11111111-1111-4111-8111-111111111111', 'REPLACE_WITH_HYEBIN_AUTH_USER_UUID', '혜빈');
