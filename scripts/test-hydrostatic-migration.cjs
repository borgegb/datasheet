// Run against a disposable in-memory PostgreSQL instance, never a live database.
// PGLITE_TEST_MODULE may point to a temporary installation of @electric-sql/pglite.
const { PGlite } = require(process.env.PGLITE_TEST_MODULE || '@electric-sql/pglite');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const db = await PGlite.create();
  const org = '3fd02660-43a7-4d7a-aa78-ae7168e86a75';
  const foreign = '11111111-1111-4111-8111-111111111111';
  const owner = '22222222-2222-4222-8222-222222222222';
  const member = '33333333-3333-4333-8333-333333333333';
  try {
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
      create table public.products (id int primary key, organization_id uuid, product_code text, product_title text,
        eu_doc_product_type text, eu_doc_ped_category text, eu_doc_certificate_no text,
        constraint products_eu_doc_product_type_check check (eu_doc_product_type in ('blast-machine', 'pto-compressor', 'air-filter')));
      insert into public.profiles values ('${owner}', '${org}', 'owner'), ('${member}', '${org}', 'member');
      insert into public.organizations values ('${org}', 'Applied Concepts'), ('${foreign}', 'Other organization');
      insert into public.products values
        (1, '${org}', 'BP-A-2000', '40L', 'blast-machine', 'cat-ii', 'approved-cert'),
        (2, '${foreign}', 'BP-A-2000', 'Other org 40L', 'blast-machine', 'cat-ii', 'approved-cert'),
        (3, '${org}', 'BP-A-4000', '140L', 'blast-machine', 'cat-iii', 'approved-cert');
      grant usage on schema public, auth to authenticated;
      grant select on public.profiles to authenticated;
      grant select, insert, update on public.products to authenticated;
    `);
    const root = resolve(__dirname, '..');
    await db.exec(readFileSync(resolve(root, 'supabase/migrations/20260923075720_protect_certification_release.sql'), 'utf8'));
    await db.exec(readFileSync(resolve(root, 'supabase/migrations/20261001133913_product_hydrostatic_profiles.sql'), 'utf8'));
    const rows = (await db.query('select id, hydrostatic_profile from public.products order by id')).rows;
    assert.equal(rows[0].hydrostatic_profile.modelCode, 'BP40L');
    assert.equal(rows[0].hydrostatic_profile.maxPressureBar, '8.6');
    assert.equal(rows[1].hydrostatic_profile, null);
    assert.equal(rows[2].hydrostatic_profile, null);
    console.log('PASS migration seeds only the confirmed Applied BP40L');

    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${member}', false);`);
    for (const sql of [
      `update public.products set hydrostatic_profile = '{}' where id = 1`,
      `update public.products set hydrostatic_profile = null where id = 1`,
      `insert into public.products (id, organization_id, hydrostatic_profile) values (4, '${org}', '{}')`,
      `update public.products set eu_doc_ped_category = 'cat-i' where id = 1`,
      `update public.products set organization_id = '${foreign}' where id = 1`,
    ]) await assert.rejects(db.exec(sql), error => error.code === '42501');
    await db.exec(`update public.products set product_title = 'Member ordinary edit' where id = 1`);
    console.log('PASS member cannot change profiles, classification or organization; ordinary editing still works');

    await db.exec(`select set_config('request.jwt.claim.sub', '${owner}', false);`);
    await db.exec(`update public.products set hydrostatic_profile = hydrostatic_profile || '{"issueEnabled":false}' where id = 1`);
    await db.exec(`update public.products set hydrostatic_profile = '{}' where id = 3`);
    await db.exec(`insert into public.products (id, organization_id, eu_doc_product_type, hydrostatic_profile) values (5, '${org}', 'air-receiver', '{}')`);
    await assert.rejects(db.exec(`update public.products set hydrostatic_profile = '{}' where id = 2`), error => error.code === '42501');
    await assert.rejects(db.exec(`update public.products set hydrostatic_profile = '[]' where id = 3`), error => error.code === '23514');
    await db.exec(`update public.products set hydrostatic_profile = null where id = 3`);
    console.log('PASS owner can configure and clear local profiles, not another organization; JSON constraint enforced');
  } finally {
    await db.close();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
