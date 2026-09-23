create table if not exists public.certification_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  template_revision text not null default '01',
  cat_ii_certificate_no text not null default 'HPiVS-iP1283-001-1',
  cat_iii_certificate_no text not null default 'HPiVS-iP1283-001-I-03-00',
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint certification_settings_template_revision_not_blank
    check (btrim(template_revision) <> ''),
  constraint certification_settings_cat_ii_certificate_not_blank
    check (btrim(cat_ii_certificate_no) <> ''),
  constraint certification_settings_cat_iii_certificate_not_blank
    check (btrim(cat_iii_certificate_no) <> '')
);

insert into public.certification_settings (
  organization_id,
  template_revision,
  cat_ii_certificate_no,
  cat_iii_certificate_no
)
select
  organizations.id,
  '01',
  'HPiVS-iP1283-001-1',
  'HPiVS-iP1283-001-I-03-00'
from public.organizations
on conflict (organization_id) do nothing;

alter table public.certification_settings enable row level security;

create policy "Certification settings are viewable by org members"
  on public.certification_settings
  for select
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.organization_id = certification_settings.organization_id
    )
  );

create policy "Certification settings are insertable by org owners"
  on public.certification_settings
  for insert
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.organization_id = certification_settings.organization_id
        and profiles.role = 'owner'
    )
  );

create policy "Certification settings are updatable by org owners"
  on public.certification_settings
  for update
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.organization_id = certification_settings.organization_id
        and profiles.role = 'owner'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.organization_id = certification_settings.organization_id
        and profiles.role = 'owner'
    )
  );

create or replace function public.seed_default_certification_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.certification_settings (
    organization_id,
    template_revision,
    cat_ii_certificate_no,
    cat_iii_certificate_no
  )
  values (
    new.id,
    '01',
    'HPiVS-iP1283-001-1',
    'HPiVS-iP1283-001-I-03-00'
  )
  on conflict (organization_id) do nothing;

  return new;
end;
$$;

drop trigger if exists seed_default_certification_settings_on_org_insert
  on public.organizations;

create trigger seed_default_certification_settings_on_org_insert
  after insert on public.organizations
  for each row
  execute function public.seed_default_certification_settings();
