begin;

alter table public.products add column hydrostatic_profile jsonb;
alter table public.products add constraint products_hydrostatic_profile_object
  check (hydrostatic_profile is null or jsonb_typeof(hydrostatic_profile) = 'object');

alter table public.products drop constraint products_eu_doc_product_type_check;
alter table public.products add constraint products_eu_doc_product_type_check
  check (eu_doc_product_type is null or eu_doc_product_type in ('blast-machine', 'pto-compressor', 'air-filter', 'air-receiver'));

comment on column public.products.hydrostatic_profile is
  'Owner-managed Hydrostatic specifications and signed-issuance approval. PED category and modules use the existing declaration mapping.';

create or replace function public.guard_product_certification_mapping()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  mapping_changed boolean;
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    mapping_changed := new.eu_doc_product_type is not null
      or new.eu_doc_ped_category is not null or new.eu_doc_certificate_no is not null
      or new.hydrostatic_profile is not null;
  else
    mapping_changed := row(new.eu_doc_product_type, new.eu_doc_ped_category, new.eu_doc_certificate_no, new.hydrostatic_profile)
      is distinct from row(old.eu_doc_product_type, old.eu_doc_ped_category, old.eu_doc_certificate_no, old.hydrostatic_profile);
    if new.organization_id is distinct from old.organization_id then
      raise exception 'Products cannot be transferred between organizations' using errcode = '42501';
    end if;
  end if;
  if mapping_changed and not exists (
    select 1 from public.profiles p where p.id = (select auth.uid())
      and p.organization_id = new.organization_id and p.role = 'owner'
  ) then
    raise exception 'Only organization owners can change certification settings' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_product_certification_mapping() from public;

-- These values are confirmed by Rafael's BP40L reference of 30 September 2026.
-- Other models remain unconfigured until Applied supplies their approved values.
update public.products set hydrostatic_profile = jsonb_build_object(
  'modelCode', 'BP40L', 'equipmentDescription', 'Blast Vessel',
  'maxPressureBar', '8.6', 'minTemperatureC', '-10', 'maxTemperatureC', '80',
  'issueEnabled', true
)
where organization_id = (select id from public.organizations where name = 'Applied Concepts')
  and product_code = 'BP-A-2000' and eu_doc_product_type = 'blast-machine'
  and eu_doc_ped_category = 'cat-ii' and nullif(trim(eu_doc_certificate_no), '') is not null
  and hydrostatic_profile is null;

commit;
