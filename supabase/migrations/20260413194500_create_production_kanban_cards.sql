create table if not exists public.production_kanban_cards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  part_no text not null,
  description text not null default '',
  location text not null,
  order_quantity integer not null default 0 check (order_quantity >= 0),
  preferred_supplier text not null default '',
  lead_time text not null default '',
  image_path text,
  pdf_storage_path text,
  footer_code text not null default '',
  back_rows jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint production_kanban_cards_back_rows_is_array
    check (jsonb_typeof(back_rows) = 'array')
);

create index if not exists production_kanban_cards_organization_id_idx
  on public.production_kanban_cards (organization_id);

create index if not exists production_kanban_cards_created_at_idx
  on public.production_kanban_cards (created_at desc);

alter table public.production_kanban_cards enable row level security;

create policy "Production Kanban cards are viewable by org members"
  on public.production_kanban_cards
  for select
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.organization_id = production_kanban_cards.organization_id
    )
  );

create policy "Production Kanban cards are insertable by org members"
  on public.production_kanban_cards
  for insert
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.organization_id = production_kanban_cards.organization_id
    )
  );

create policy "Production Kanban cards are updatable by org members"
  on public.production_kanban_cards
  for update
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.organization_id = production_kanban_cards.organization_id
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.organization_id = production_kanban_cards.organization_id
    )
  );

create policy "Production Kanban cards are deletable by org members"
  on public.production_kanban_cards
  for delete
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.organization_id = production_kanban_cards.organization_id
    )
  );
