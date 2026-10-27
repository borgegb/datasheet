begin;

-- Final references supplied by Applied on 21 October 2026. Existing issued
-- certificates are immutable snapshots and are deliberately not changed.
update public.products
set eu_doc_certificate_no = 'HPiVS-iP1283-001-I-02-01',
    certification_issue_enabled = true
where organization_id = '3fd02660-43a7-4d7a-aa78-ae7168e86a75'
  and product_code in ('BP-A-4000', 'BP-A-5000', 'BP-A-5200')
  and eu_doc_product_type = 'blast-machine' and eu_doc_ped_category = 'cat-iii';

update public.products
set eu_doc_certificate_no = 'HPiVS-iP1283-003-01-00',
    certification_issue_enabled = true,
    hydrostatic_profile = coalesce(hydrostatic_profile, '{}'::jsonb) || jsonb_build_object(
      'modelCode', 'AR32L', 'equipmentDescription', 'Air Receiver',
      'volumeLitres', '32', 'maxPressureBar', '12',
      'minTemperatureC', '-10', 'maxTemperatureC', '80',
      'testPressureBar', '20', 'requirement', 'mandatory', 'issueEnabled', true
    )
where organization_id = '3fd02660-43a7-4d7a-aa78-ae7168e86a75'
  and product_code = 'VM-A-0003'
  and eu_doc_product_type = 'air-receiver' and eu_doc_ped_category = 'cat-ii';

commit;
