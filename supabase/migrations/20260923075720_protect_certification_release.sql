-- Owner-only controls depend on roles not being self-assignable. Existing
-- profile policies permit self-edits, so guard the privileged columns too.
create or replace function public.guard_profile_authorization()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;
  if new.id is distinct from old.id or new.organization_id is distinct from old.organization_id then
    raise exception 'Profile identity and organization are managed by administrators' using errcode = '42501';
  end if;
  if new.role is distinct from old.role and not exists (
    select 1 from public.profiles p where p.id = (select auth.uid())
      and p.organization_id = old.organization_id and p.role = 'owner'
  ) then
    raise exception 'Only organization owners can change roles' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_profile_authorization() from public;
create trigger guard_profile_authorization
before update on public.profiles
for each row execute function public.guard_profile_authorization();

-- Ordinary datasheet editing remains available to members. Only owners may
-- change the certification columns, including through direct Data API writes.
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
      or new.eu_doc_ped_category is not null or new.eu_doc_certificate_no is not null;
  else
    mapping_changed := row(new.eu_doc_product_type, new.eu_doc_ped_category, new.eu_doc_certificate_no)
      is distinct from row(old.eu_doc_product_type, old.eu_doc_ped_category, old.eu_doc_certificate_no);
    if new.organization_id is distinct from old.organization_id then
      raise exception 'Products cannot be transferred between organizations' using errcode = '42501';
    end if;
  end if;
  if mapping_changed and not exists (
    select 1 from public.profiles p where p.id = (select auth.uid())
      and p.organization_id = new.organization_id and p.role = 'owner'
  ) then
    raise exception 'Only organization owners can change EU DoC mappings' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_product_certification_mapping() from public;
create trigger guard_product_certification_mapping
before insert or update on public.products
for each row execute function public.guard_product_certification_mapping();

-- Restrictive policies also protect against broader permissive policies.
create policy "Certificate inserts require an organization editor"
on public.certifications as restrictive for insert to authenticated
with check (exists (select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.organization_id = certifications.organization_id
    and p.role in ('owner', 'member')));

create policy "Certificate updates require an organization editor"
on public.certifications as restrictive for update to authenticated
using (exists (select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.organization_id = certifications.organization_id
    and p.role in ('owner', 'member')))
with check (exists (select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.organization_id = certifications.organization_id
    and p.role in ('owner', 'member')));

create policy "Certificate deletes require an organization editor"
on public.certifications as restrictive for delete to authenticated
using (exists (select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.organization_id = certifications.organization_id
    and p.role in ('owner', 'member')));

-- Scope storage restrictions to certificate PDFs, not unrelated app assets.
create policy "Certificate PDF inserts require an organization editor"
on storage.objects as restrictive for insert to authenticated
with check (not (bucket_id = 'datasheet-assets' and coalesce((storage.foldername(name))[2], '') = 'certifications')
  or exists (select 1 from public.profiles p where p.id = (select auth.uid())
    and p.organization_id::text = (storage.foldername(name))[1] and p.role in ('owner', 'member')));

create policy "Certificate PDF updates require an organization editor"
on storage.objects as restrictive for update to authenticated
using (not (bucket_id = 'datasheet-assets' and coalesce((storage.foldername(name))[2], '') = 'certifications')
  or exists (select 1 from public.profiles p where p.id = (select auth.uid())
    and p.organization_id::text = (storage.foldername(name))[1] and p.role in ('owner', 'member')))
with check (not (bucket_id = 'datasheet-assets' and coalesce((storage.foldername(name))[2], '') = 'certifications')
  or exists (select 1 from public.profiles p where p.id = (select auth.uid())
    and p.organization_id::text = (storage.foldername(name))[1] and p.role in ('owner', 'member')));

create policy "Certificate PDF deletes require an organization editor"
on storage.objects as restrictive for delete to authenticated
using (not (bucket_id = 'datasheet-assets' and coalesce((storage.foldername(name))[2], '') = 'certifications')
  or exists (select 1 from public.profiles p where p.id = (select auth.uid())
    and p.organization_id::text = (storage.foldername(name))[1] and p.role in ('owner', 'member')));
