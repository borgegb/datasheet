// Isolated PostgreSQL regression test. Never connects to a production database.
const { PGlite } = require(process.env.PGLITE_TEST_MODULE || '@electric-sql/pglite');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const { fixtures } = require('./test-product-matrix.cjs');
const org = '3fd02660-43a7-4d7a-aa78-ae7168e86a75';
const foreign = '11111111-1111-4111-8111-111111111111';
const owner = '22222222-2222-4222-8222-222222222222';
const member = '33333333-3333-4333-8333-333333333333';
const sql = file => readFileSync(resolve(__dirname, '../supabase/migrations', file), 'utf8');
async function setup() {
  const db = await PGlite.create();
  await db.exec(`
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create schema storage;
    create table storage.objects (bucket_id text, name text);
    create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1, '/') $$;
    create table public.profiles (id uuid primary key, organization_id uuid, role text);
    create table public.organizations (id uuid primary key, name text);
    create table public.certifications (organization_id uuid);
    create table public.products (id uuid primary key default gen_random_uuid(), user_id uuid not null,
      organization_id uuid, product_code text not null, product_title text not null, updated_at timestamptz default now(),
      eu_doc_product_type text, eu_doc_ped_category text, eu_doc_certificate_no text,
      constraint products_eu_doc_product_type_check check (eu_doc_product_type in ('blast-machine', 'pto-compressor', 'air-filter')));
    insert into public.profiles values ('${owner}', '${org}', 'owner'), ('${member}', '${org}', 'member');
    insert into public.organizations values ('${org}', 'Applied Concepts'), ('${foreign}', 'Other org');
    grant usage on schema public, auth to authenticated;
    grant select on public.profiles to authenticated;
    grant select, insert, update on public.products to authenticated;
    insert into public.products (user_id, organization_id, product_code, product_title) values
      ('${owner}', '${foreign}', 'BP-A-2000', 'Foreign row');
  `);
  for (const p of fixtures.slice(0, 6)) await db.query(`insert into public.products
    (user_id, organization_id, product_code, product_title, eu_doc_product_type, eu_doc_ped_category, eu_doc_certificate_no)
    values ($1,$2,$3,$4,$5,$6,$7)`, [owner, org, p.product_code, `Existing ${p.id}`, p.eu_doc_product_type, p.eu_doc_ped_category, p.eu_doc_certificate_no]);
  await db.exec(sql('20260923075720_protect_certification_release.sql'));
  await db.exec(sql('20261001133913_product_hydrostatic_profiles.sql'));
  return db;
}
async function main() {
  const migration = sql('20261002104708_applied_product_matrix.sql');
  const db = await setup();
  try {
    await db.exec(migration);
    const rows = (await db.query('select * from public.products where organization_id=$1', [org])).rows;
    assert.equal(rows.length, 10);
    for (const p of fixtures) {
      const row = rows.find(r => r.product_code === p.product_code);
      assert.deepEqual(row.hydrostatic_profile, p.hydrostatic_profile);
      assert.equal(row.eu_doc_ped_category, p.eu_doc_ped_category);
      assert.equal(row.eu_doc_product_type, p.eu_doc_product_type);
      assert.equal(row.eu_doc_certificate_no, p.eu_doc_certificate_no);
      assert.equal(row.certification_issue_enabled, p.certification_issue_enabled);
      if (fixtures.indexOf(p) < 6) assert.equal(row.product_title, `Existing ${p.id}`);
    }
    const foreignRow = (await db.query('select * from public.products where organization_id=$1', [foreign])).rows[0];
    assert.equal(foreignRow.hydrostatic_profile, null); assert.equal(foreignRow.certification_issue_enabled, null);
    console.log('PASS all 10 matrix rows match; existing titles/certificates and foreign organization are preserved');
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${member}', false);`);
    for (const change of ["certification_issue_enabled=true", "certification_issue_enabled=null", "hydrostatic_profile=null", "eu_doc_certificate_no='FORGED'"]) {
      await assert.rejects(db.exec(`update public.products set ${change} where product_code='BP-A-5200' and organization_id='${org}'`), e => e.code === '42501');
    }
    await assert.rejects(db.exec(`insert into public.products (user_id, organization_id, product_title, product_code, certification_issue_enabled)
      values ('${member}','${org}','Forged','FORGED',true)`), e => e.code === '42501');
    await db.exec(`update public.products set product_title='Routine member edit' where product_code='BP-A-5200' and organization_id='${org}'`);
    await db.exec(`select set_config('request.jwt.claim.sub', '${owner}', false);`);
    await db.exec(`update public.products set certification_issue_enabled=false where product_code='BP-A-1000' and organization_id='${org}'`);
    await assert.rejects(db.exec(`update public.products set certification_issue_enabled=true where organization_id='${foreign}'`), e => e.code === '42501');
    console.log('PASS approval/profile access controls, cross-organization protection and ordinary product edits');
  } finally { await db.close(); }
  for (const scenario of ['duplicate', 'missing-certificate']) {
    const failing = await setup();
    try {
      if (scenario === 'duplicate') await failing.exec(`insert into public.products (user_id,organization_id,product_title,product_code)
        values ('${owner}','${org}','Duplicate','BP-A-2000')`);
      else await failing.exec(`update public.products set eu_doc_certificate_no=null where organization_id='${org}' and product_code='BP-A-2000'`);
      await assert.rejects(failing.exec(migration), new RegExp(scenario === 'duplicate' ? 'Duplicate' : 'certificate references'));
      await failing.exec('rollback');
      assert.equal((await failing.query("select count(*)::int as n from public.products where product_code='AF-A-0001'")).rows[0].n, 0);
      assert.equal((await failing.query("select count(*)::int as n from information_schema.columns where table_name='products' and column_name='certification_issue_enabled'")).rows[0].n, 0);
      console.log(`PASS ${scenario} aborts the complete migration without partial data`);
    } finally { await failing.close(); }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
