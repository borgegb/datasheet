alter table public.products
  add column if not exists eu_doc_product_type text,
  add column if not exists eu_doc_ped_category text,
  add column if not exists eu_doc_certificate_no text;

do $$
begin
  alter table public.products
    add constraint products_eu_doc_product_type_check
    check (
      eu_doc_product_type is null
      or eu_doc_product_type in ('blast-machine', 'pto-compressor')
    );
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.products
    add constraint products_eu_doc_ped_category_check
    check (
      eu_doc_ped_category is null
      or eu_doc_ped_category in ('cat-ii', 'cat-iii')
    );
exception
  when duplicate_object then null;
end;
$$;

create index if not exists products_eu_doc_product_type_idx
  on public.products (organization_id, eu_doc_product_type);
