-- Add the classifications confirmed for BP-A-1000 and AF-A-0001. Existing
-- owner-only mapping triggers, signature storage and RLS remain unchanged.
begin;

alter table public.products drop constraint if exists products_eu_doc_product_type_check;
alter table public.products add constraint products_eu_doc_product_type_check
  check (eu_doc_product_type is null or eu_doc_product_type in ('blast-machine', 'pto-compressor', 'air-filter'));

alter table public.products drop constraint if exists products_eu_doc_ped_category_check;
alter table public.products add constraint products_eu_doc_ped_category_check
  check (eu_doc_ped_category is null or eu_doc_ped_category in ('cat-i', 'cat-ii', 'cat-iii', 'sep'));

-- Do not silently populate or replace live product mappings. Configure the two
-- products as an organization owner after deploying this migration and the UI.
commit;
