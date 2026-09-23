-- Live policy regression checks. All fixture/role/product changes are rolled
-- back. Run as the SQL editor administrator after the release migration.
begin;
select set_config('request.jwt.claim.sub', p.id::text, true),
       set_config('test.organization', p.organization_id::text, true)
from public.profiles p join auth.users u on u.id = p.id
where u.email = 'borge.blikeng@gmail.com' and p.role = 'owner';
select set_config('test.product', id::text, true) from public.products
where organization_id = current_setting('test.organization')::uuid and product_code = 'BP-A-2000';
select set_config('test.certificate', gen_random_uuid()::text, true);
select set_config('test.object', current_setting('test.organization') || '/certifications/permission-test/fixture.pdf', true);
insert into public.certifications (id, organization_id, type, data, title)
values (current_setting('test.certificate')::uuid, current_setting('test.organization')::uuid,
  'eu-doc-serialised', '{"documentMode":"test"}', 'ROLLBACK-ONLY PERMISSION TEST');
insert into storage.objects (bucket_id, name)
values ('datasheet-assets', current_setting('test.object'));

set local role authenticated;
do $$ begin
  update public.products set eu_doc_product_type = 'blast-machine', eu_doc_ped_category = 'cat-ii',
    eu_doc_certificate_no = 'ROLLBACK-ONLY'
  where id = current_setting('test.product')::uuid;
  if not found then raise exception 'Owner mapping update was blocked'; end if;
end $$;
reset role;
update public.profiles set role = 'member' where id = auth.uid();
set local role authenticated;
do $$ begin
  update public.products set product_title = product_title where id = current_setting('test.product')::uuid;
  if not found then raise exception 'Member ordinary edit was blocked'; end if;
  begin
    update public.products set eu_doc_certificate_no = 'UNAUTHORIZED' where id = current_setting('test.product')::uuid;
    raise exception 'Member changed mapping';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set role = 'owner' where id = auth.uid();
    raise exception 'Member elevated own role';
  exception when insufficient_privilege then null;
  end;
  update public.certifications set title = 'MEMBER ROLLBACK TEST' where id = current_setting('test.certificate')::uuid;
  if not found then raise exception 'Member certificate edit was blocked'; end if;
  update storage.objects set metadata = '{"test":true}' where bucket_id = 'datasheet-assets' and name = current_setting('test.object');
  if not found then raise exception 'Member certificate storage update was blocked'; end if;
end $$;
reset role;
update public.profiles set role = 'viewer' where id = auth.uid();
set local role authenticated;
do $$ begin
  begin
    insert into public.certifications (organization_id, type, data)
    values (current_setting('test.organization')::uuid, 'eu-doc-serialised', '{}');
    raise exception 'Viewer inserted certificate';
  exception when insufficient_privilege then null;
  end;
  update public.certifications set title = 'UNAUTHORIZED' where id = current_setting('test.certificate')::uuid;
  if found then raise exception 'Viewer updated certificate'; end if;
  delete from public.certifications where id = current_setting('test.certificate')::uuid;
  if found then raise exception 'Viewer deleted certificate'; end if;
  update storage.objects set metadata = '{"forged":true}' where bucket_id = 'datasheet-assets' and name = current_setting('test.object');
  if found then raise exception 'Viewer updated certificate PDF'; end if;
  begin
    insert into storage.objects (bucket_id, name)
    values ('datasheet-assets', current_setting('test.organization') || '/certifications/permission-test/viewer.pdf');
    raise exception 'Viewer inserted certificate PDF';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set role = 'owner' where id = auth.uid();
    raise exception 'Viewer elevated own role';
  exception when insufficient_privilege then null;
  end;
  update public.profiles set full_name = full_name where id = auth.uid();
  if not found then raise exception 'Ordinary profile update was blocked'; end if;
end $$;
reset role;
rollback;
select 'PASS: owner mapping, member ordinary edits, role escalation, viewer certificate/storage restrictions; all changes rolled back' as result;
