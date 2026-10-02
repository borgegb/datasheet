begin;

alter table public.products add column certification_issue_enabled boolean;
comment on column public.products.certification_issue_enabled is
  'Owner-managed approval for signed documents across all certificate types. False permits unsigned previews only; null preserves legacy approval rules.';

create or replace function public.guard_product_certification_mapping()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare mapping_changed boolean;
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then return new; end if;
  if tg_op = 'INSERT' then
    mapping_changed := new.eu_doc_product_type is not null or new.eu_doc_ped_category is not null
      or new.eu_doc_certificate_no is not null or new.hydrostatic_profile is not null
      or new.certification_issue_enabled is not null;
  else
    mapping_changed := row(new.eu_doc_product_type, new.eu_doc_ped_category, new.eu_doc_certificate_no,
      new.hydrostatic_profile, new.certification_issue_enabled)
      is distinct from row(old.eu_doc_product_type, old.eu_doc_ped_category, old.eu_doc_certificate_no,
      old.hydrostatic_profile, old.certification_issue_enabled);
    if new.organization_id is distinct from old.organization_id then
      raise exception 'Products cannot be transferred between organizations' using errcode = '42501';
    end if;
  end if;
  if mapping_changed and not exists (select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.organization_id = new.organization_id and p.role = 'owner') then
    raise exception 'Only organization owners can change certification settings' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_product_certification_mapping() from public;

-- Rafael's 2 October 2026 email and ACL-Applied-Studio-Product-Matrix - Copy.xlsx,
-- Product Matrix + Rules. Existing titles, datasheets and issued PDFs are retained.
-- No Notified Body certificate numbers are invented for the pending products.
create temporary table applied_certificate_matrix (
  model text, code text primary key, description text, volume text, ps text,
  category text, product_type text, pt text, requirement text, approved boolean
) on commit drop;
insert into applied_certificate_matrix values
  ('BP20L', 'BP-A-1000', 'Blast Machine', '20', '8.6', 'cat-i', 'blast-machine', '20', 'mandatory', true),
  ('BP40L', 'BP-A-2000', 'Blast Machine', '40', '8.6', 'cat-ii', 'blast-machine', '20', 'mandatory', true),
  ('BP100L', 'BP-A-3000', 'Blast Machine', '100', '8.6', 'cat-ii', 'blast-machine', '20', 'mandatory', true),
  ('BP100LA', 'BP-A-6000', 'Blast Machine', '100', '8.6', 'cat-ii', 'blast-machine', '20', 'mandatory', true),
  ('BP140L', 'BP-A-4000', 'Blast Machine', '140', '8.6', 'cat-iii', 'blast-machine', '20', 'mandatory', true),
  ('BP200L', 'BP-A-5000', 'Blast Machine', '200', '8.6', 'cat-iii', 'blast-machine', '20', 'mandatory', true),
  ('BP200LX', 'BP-A-5200', 'Blast Machine', '200', '12', 'cat-iii', 'blast-machine', '20', 'mandatory', false),
  ('AR32L', 'VM-A-0003', 'Air Receiver', '32', '12', 'cat-ii', 'air-receiver', '20', 'mandatory', false),
  ('VM350', 'VM-A-0001', 'PTO Compressor', '32', '12', 'cat-ii', 'pto-compressor', null, 'not-applicable', false),
  ('AF5L', 'AF-A-0001', 'Air Filter (Respirator)', '5', '8.6', 'sep', 'air-filter', '15', 'optional', true);

do $$
declare org_id uuid; owner_id uuid;
begin
  select id into strict org_id from public.organizations where name = 'Applied Concepts';
  select id into owner_id from public.profiles where organization_id = org_id and role = 'owner' order by id limit 1;
  if owner_id is null then raise exception 'Applied organization owner is required for product creation'; end if;
  if exists (select p.product_code from public.products p join applied_certificate_matrix m on p.product_code = m.code
    where p.organization_id = org_id group by p.product_code having count(*) > 1) then
    raise exception 'Duplicate Applied product codes must be resolved before importing the matrix';
  end if;

  insert into public.products (user_id, organization_id, product_title, product_code)
    select owner_id, org_id, m.description || ' ' || m.model, m.code from applied_certificate_matrix m
    where not exists (select 1 from public.products p where p.organization_id = org_id and p.product_code = m.code);

  -- Abort rather than clear or reuse a mismatched existing certificate reference.
  if exists (select 1 from public.products p join applied_certificate_matrix m on p.product_code = m.code
    where p.organization_id = org_id and m.approved and m.category in ('cat-ii', 'cat-iii')
      and (p.eu_doc_ped_category is distinct from m.category or nullif(trim(p.eu_doc_certificate_no), '') is null)) then
    raise exception 'Approved Cat. II/III models need their existing matching PED certificate references';
  end if;

  update public.products p set eu_doc_product_type = m.product_type, eu_doc_ped_category = m.category,
    eu_doc_certificate_no = case when m.category in ('cat-i', 'sep') then null else p.eu_doc_certificate_no end,
    certification_issue_enabled = m.approved,
    hydrostatic_profile = jsonb_build_object(
      'modelCode', m.model, 'equipmentDescription', m.description, 'volumeLitres', m.volume,
      'maxPressureBar', m.ps, 'minTemperatureC', '-10', 'maxTemperatureC', '80',
      'testPressureBar', coalesce(m.pt, ''), 'requirement', m.requirement,
      'issueEnabled', m.approved and m.requirement <> 'not-applicable'),
    updated_at = now()
  from applied_certificate_matrix m where p.organization_id = org_id and p.product_code = m.code;
end;
$$;

commit;
