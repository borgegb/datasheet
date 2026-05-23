create table if not exists public.variant_datasheet_columns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key text not null,
  label text not null,
  placeholder text not null default '',
  weight numeric not null default 14 check (weight > 0),
  display_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint variant_datasheet_columns_key_not_blank
    check (btrim(key) <> ''),
  constraint variant_datasheet_columns_label_not_blank
    check (btrim(label) <> ''),
  constraint variant_datasheet_columns_org_key_unique
    unique (organization_id, key)
);

create index if not exists variant_datasheet_columns_organization_id_idx
  on public.variant_datasheet_columns (organization_id);

create index if not exists variant_datasheet_columns_active_order_idx
  on public.variant_datasheet_columns (organization_id, archived_at, display_order, created_at);

insert into public.variant_datasheet_columns (
  organization_id,
  key,
  label,
  placeholder,
  weight,
  display_order
)
select
  organizations.id,
  defaults.key,
  defaults.label,
  defaults.placeholder,
  defaults.weight,
  defaults.display_order
from public.organizations
cross join (
  values
    ('productCode', 'Product Code', 'AL-A-0001', 14, 10),
    ('description', 'Description', 'Standard lance assembly', 42, 20),
    ('weight', 'Weight', '3.5 kg', 14, 30),
    ('length', 'Length', '1470 mm', 14, 40),
    ('diameter', 'Diameter', '70 mm', 14, 50),
    ('thread', 'Thread', '1/2 in BSP', 14, 60),
    ('connection', 'Connection', 'Claw coupling', 16, 70),
    ('material', 'Material', 'Aluminium', 16, 80),
    ('pressureRating', 'Pressure Rating', '100 psi', 16, 90),
    ('hoseSize', 'Hose Size', '1/2 in', 14, 100),
    ('inlet', 'Inlet', '1/2 in', 12, 110),
    ('outlet', 'Outlet', '70 mm', 12, 120)
) as defaults(key, label, placeholder, weight, display_order)
on conflict (organization_id, key) do nothing;

alter table public.variant_datasheet_columns enable row level security;

create policy "Variant datasheet columns are viewable by org members"
  on public.variant_datasheet_columns
  for select
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.organization_id = variant_datasheet_columns.organization_id
    )
  );

create policy "Variant datasheet columns are insertable by org owners"
  on public.variant_datasheet_columns
  for insert
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.organization_id = variant_datasheet_columns.organization_id
        and profiles.role = 'owner'
    )
  );

create policy "Variant datasheet columns are updatable by org owners"
  on public.variant_datasheet_columns
  for update
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.organization_id = variant_datasheet_columns.organization_id
        and profiles.role = 'owner'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.organization_id = variant_datasheet_columns.organization_id
        and profiles.role = 'owner'
    )
  );

create or replace function public.seed_default_variant_datasheet_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.variant_datasheet_columns (
    organization_id,
    key,
    label,
    placeholder,
    weight,
    display_order
  )
  values
    (new.id, 'productCode', 'Product Code', 'AL-A-0001', 14, 10),
    (new.id, 'description', 'Description', 'Standard lance assembly', 42, 20),
    (new.id, 'weight', 'Weight', '3.5 kg', 14, 30),
    (new.id, 'length', 'Length', '1470 mm', 14, 40),
    (new.id, 'diameter', 'Diameter', '70 mm', 14, 50),
    (new.id, 'thread', 'Thread', '1/2 in BSP', 14, 60),
    (new.id, 'connection', 'Connection', 'Claw coupling', 16, 70),
    (new.id, 'material', 'Material', 'Aluminium', 16, 80),
    (new.id, 'pressureRating', 'Pressure Rating', '100 psi', 16, 90),
    (new.id, 'hoseSize', 'Hose Size', '1/2 in', 14, 100),
    (new.id, 'inlet', 'Inlet', '1/2 in', 12, 110),
    (new.id, 'outlet', 'Outlet', '70 mm', 12, 120)
  on conflict (organization_id, key) do nothing;

  return new;
end;
$$;

drop trigger if exists seed_default_variant_datasheet_columns_on_org_insert
  on public.organizations;

create trigger seed_default_variant_datasheet_columns_on_org_insert
  after insert on public.organizations
  for each row
  execute function public.seed_default_variant_datasheet_columns();

create or replace function public.prevent_archiving_last_variant_datasheet_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.archived_at is null and new.archived_at is not null then
    if not exists (
      select 1
      from public.variant_datasheet_columns
      where organization_id = old.organization_id
        and id <> old.id
        and archived_at is null
    ) then
      raise exception 'At least one active variant column is required.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_archiving_last_variant_datasheet_column_on_update
  on public.variant_datasheet_columns;

create trigger prevent_archiving_last_variant_datasheet_column_on_update
  before update of archived_at on public.variant_datasheet_columns
  for each row
  execute function public.prevent_archiving_last_variant_datasheet_column();
