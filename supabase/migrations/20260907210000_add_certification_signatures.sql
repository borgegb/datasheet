begin;

alter table public.certification_settings
  add column signature_storage_path text;

alter table public.certification_settings
  add constraint certification_signature_belongs_to_organization
  check (
    signature_storage_path is null
    or signature_storage_path ~ (
      '^' || organization_id::text || '/[0-9a-f-]{36}\.png$'
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'certification-signatures',
  'certification-signatures',
  false,
  524288,
  array['image/png']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Owners can manage their organization signatures"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'certification-signatures'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'owner'
        and profiles.organization_id::text = (storage.foldername(name))[1]
    )
  )
  with check (
    bucket_id = 'certification-signatures'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'owner'
        and profiles.organization_id::text = (storage.foldername(name))[1]
    )
  );

-- Existing permissive storage policies must not expose this private bucket.
create policy "Signature bucket requires organization owner access"
  on storage.objects as restrictive for all to public
  using (
    bucket_id <> 'certification-signatures'
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'owner'
        and profiles.organization_id::text = (storage.foldername(name))[1]
    )
  )
  with check (
    bucket_id <> 'certification-signatures'
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'owner'
        and profiles.organization_id::text = (storage.foldername(name))[1]
    )
  );

commit;
