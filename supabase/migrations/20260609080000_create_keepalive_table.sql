create table if not exists public.keepalive (
  id smallint primary key default 1,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint keepalive_single_row check (id = 1)
);

insert into public.keepalive (id)
values (1)
on conflict (id) do nothing;

alter table public.keepalive enable row level security;

drop policy if exists "Keepalive is anonymously readable"
  on public.keepalive;

create policy "Keepalive is anonymously readable"
  on public.keepalive
  for select
  to anon
  using (true);
