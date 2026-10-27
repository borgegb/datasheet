// An isolated PostgreSQL instance: no Supabase connection or production writes.
const { PGlite } = require(process.env.PGLITE_TEST_MODULE || '@electric-sql/pglite');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const org = '3fd02660-43a7-4d7a-aa78-ae7168e86a75';
const foreign = '11111111-1111-4111-8111-111111111111';
const migration = readFileSync(resolve(__dirname, '../supabase/migrations/20261027193149_approved_october_declarations.sql'), 'utf8');

async function main() {
  const db = await PGlite.create();
  try {
    await db.exec(`create table public.products (
      id text primary key, organization_id uuid, product_code text, product_title text,
      eu_doc_product_type text, eu_doc_ped_category text, eu_doc_certificate_no text,
      certification_issue_enabled boolean, hydrostatic_profile jsonb);
      create table public.certifications (id text primary key, data jsonb, pdf_storage_path text);
      insert into public.certifications values ('existing', '{"certificateNo":"OLD"}', 'existing/file.pdf');`);
    const specs = [
      ['140', org, 'BP-A-4000', 'blast-machine', 'cat-iii'],
      ['200', org, 'BP-A-5000', 'blast-machine', 'cat-iii'],
      ['200lx', org, 'BP-A-5200', 'blast-machine', 'cat-iii'],
      ['receiver', org, 'VM-A-0003', 'air-receiver', 'cat-ii'],
      ['40', org, 'BP-A-2000', 'blast-machine', 'cat-ii'],
      ['20', org, 'BP-A-1000', 'blast-machine', 'cat-i'],
      ['sep', org, 'AF-A-0001', 'air-filter', 'sep'],
      ['pto', org, 'VM-A-0001', 'pto-compressor', 'cat-ii'],
      ['foreign', foreign, 'VM-A-0003', 'air-receiver', 'cat-ii'],
      ['foreign-blast', foreign, 'BP-A-5200', 'blast-machine', 'cat-iii'],
      ['wrong-category', org, 'BP-A-5000', 'blast-machine', 'cat-ii'],
      ['wrong-type', org, 'VM-A-0003', 'pto-compressor', 'cat-ii'],
    ];
    for (const [id, organization, code, type, category] of specs) {
      await db.query('insert into public.products values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [id, organization, code, `Existing ${id}`, type, category, 'OLD', false,
          { modelCode: 'KEEP', testPressureBar: '21', issueEnabled: false, customMetadata: 'preserve' }]);
    }
    const read = async () => (await db.query('select * from public.products order by id')).rows;
    const before = await read();
    await db.exec(migration);
    const after = await read();
    const changed = after.filter((row, i) => JSON.stringify(row) !== JSON.stringify(before[i]));
    assert.deepEqual(changed.map(r => r.id).sort(), ['140', '200', '200lx', 'receiver']);
    for (const row of changed) {
      assert.equal(row.product_title, `Existing ${row.id}`);
      assert.equal(row.certification_issue_enabled, true);
      assert.equal(row.eu_doc_certificate_no, row.id === 'receiver' ? 'HPiVS-iP1283-003-01-00' : 'HPiVS-iP1283-001-I-02-01');
      if (row.id === 'receiver') {
        assert.deepEqual(row.hydrostatic_profile, { modelCode: 'AR32L', equipmentDescription: 'Air Receiver',
          volumeLitres: '32', maxPressureBar: '12', minTemperatureC: '-10', maxTemperatureC: '80',
          testPressureBar: '20', requirement: 'mandatory', issueEnabled: true, customMetadata: 'preserve' });
      } else assert.deepEqual(row.hydrostatic_profile, before.find(r => r.id === row.id).hydrostatic_profile);
    }
    console.log('PASS only the four approved mappings change; other organizations, products and metadata stay intact');
    assert.deepEqual((await db.query('select * from public.certifications')).rows,
      [{ id: 'existing', data: { certificateNo: 'OLD' }, pdf_storage_path: 'existing/file.pdf' }]);
    console.log('PASS previously issued certificate snapshots and storage paths are unchanged');
    await db.exec(migration);
    assert.deepEqual(await read(), after);
    console.log('PASS reapplying the migration is idempotent');
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
