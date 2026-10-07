const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument, PDFPage } = require('pdf-lib');
const { load, routeProbe, unit, blast40 } = require('./test-eu-doc-signature.cjs');

const { CERT_TYPES } = load('app/dashboard/certifications/registry.ts');
const { DECLARATION_TYPES, supplementalDeclarationProfile } = load('lib/certifications/declarations.ts');
const { DOCUMENT_REVISIONS } = load('lib/certifications/revision.ts');
const { buildEuDeclarationOfConformityPdf } = load('lib/pdf/certifications/buildEuDeclarationOfConformityPdf.ts');
let passed = 0;
async function check(name, run) { await run(); passed++; console.log(`PASS ${name}`); }

async function main() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
  const output = process.env.REVISION_TEST_OUTPUT;
  if (output) fs.mkdirSync(output, { recursive: true });

  for (const type of DECLARATION_TYPES) {
    const definition = CERT_TYPES[type];
    await check(`${type}: dropdown and default`, () => {
      assert.equal(definition.defaults.revision, '01');
      const field = definition.fieldLayout.find(f => f.name === 'revision');
      assert.equal(field.type, 'select');
      assert.deepEqual(field.options.map(o => o.value), DOCUMENT_REVISIONS);
      assert.equal(definition.schema.parse(unit).revision, '01');
    });
    // The selector must not release the existing PTO hold.
    if (type === 'eu-doc-owner-manual-pto-compressors') {
      const result = await routeProbe({ type, data: { revision: '02' } });
      assert.equal(result.response.status, 409);
      assert.equal(result.calls.uploads.length, 0);
      continue;
    }
    const profile = supplementalDeclarationProfile(type);
    const product = profile ? { ...blast40, product_code: profile.productCode,
      product_title: profile.commercialName, eu_doc_product_type: profile.productType,
      eu_doc_ped_category: profile.pedCategory, eu_doc_certificate_no: null,
      hydrostatic_profile: null } : blast40;

    for (const revision of DOCUMENT_REVISIONS) for (const documentMode of ['test', 'issued']) {
      await check(`${type}: ${documentMode} revision ${revision} stored and passed to PDF`, async () => {
        const { response, body, calls } = await routeProbe({ type, product, documentMode,
          data: { revision, issueDate: '2026-10-07' } });
        assert.equal(response.status, 200, JSON.stringify(body));
        assert.equal(calls.builder[1].revision, revision);
        assert.equal(calls.records[0].data.revision, revision);
        assert.equal(calls.records[0].data.issueDate, '2026-10-07');
        assert.equal(calls.uploads[0].uploadOptions.upsert, false);
        assert.equal(calls.removals.length, 0);
      });
    }
    for (const revision of ['00', '06', '99', '1', '', ' 02 ', 'Rev 02', 2, null]) {
      await check(`${type}: rejects revision ${JSON.stringify(revision)}`, async () => {
        const { response, body, calls } = await routeProbe({ type, product, data: { revision } });
        assert.equal(response.status, 400);
        assert.match(JSON.stringify(body), /Revision must be between 01 and 05/);
        assert.equal(calls.uploads.length, 0);
        assert.equal(calls.records.length, 0);
        assert.equal(calls.downloads.length, 0);
      });
    }
    await check(`${type}: older client without revision receives 01`, async () => {
      const { response, calls } = await routeProbe({ type, product });
      assert.equal(response.status, 200);
      assert.equal(calls.records[0].data.revision, '01');
    });
    await check(`${type}: PDF prints selected revision in existing header`, async () => {
      const data = definition.schema.parse({ ...unit, revision: '05', issueDate: '2026-10-07',
        commercialName: product.product_title, modelType: product.product_code });
      const texts = [];
      const drawText = PDFPage.prototype.drawText;
      PDFPage.prototype.drawText = function(value, options) {
        texts.push({ value, ...options });
        return drawText.call(this, value, options);
      };
      let bytes;
      try {
        bytes = await buildEuDeclarationOfConformityPdf(type, data, { templateRevision: '99' }, {
          productTitle: product.product_title, productCode: product.product_code,
          productType: product.eu_doc_product_type, pedCategory: product.eu_doc_ped_category,
          certificateNo: product.eu_doc_certificate_no || '',
        }, undefined, { isTest: true });
      } finally { PDFPage.prototype.drawText = drawText; }
      const revisionIndex = texts.findIndex(t => t.value === 'Revision');
      assert.ok(revisionIndex >= 0);
      assert.equal(texts[revisionIndex + 1].value, '05');
      assert.equal(texts[revisionIndex].x, texts[revisionIndex + 1].x);
      assert.ok(texts.some(t => t.value === '07/October/2026'));
      assert.equal((await PDFDocument.load(bytes)).getPageCount(), 2);
      assert.equal(texts.filter(t => t.value === 'TEST / NOT FOR ISSUE - UNSIGNED').length, 2);
      if (output) fs.writeFileSync(path.join(output, `${type}-rev05.pdf`), bytes);
    });
  }
  await check('reissuing with corrected date stores a separate PDF with the same declaration number', async () => {
    const first = await routeProbe({ data: { revision: '01', issueDate: '2026-10-06' } });
    const second = await routeProbe({ data: { revision: '02', issueDate: '2026-10-07' } });
    assert.equal(first.calls.records[0].data.declarationNumber, second.calls.records[0].data.declarationNumber);
    assert.notEqual(first.calls.records[0].pdf_storage_path, second.calls.records[0].pdf_storage_path);
    assert.equal(first.calls.records[0].data.revision, '01');
    assert.equal(first.calls.records[0].data.issueDate, '2026-10-06');
  });
  await check('Hydrostatic and legacy VM350 have no new revision field', () => {
    for (const type of ['hydrostatic-test', 'ec-vm-350-declaration']) {
      assert.equal(CERT_TYPES[type].fieldLayout.some(f => f.name === 'revision'), false);
    }
  });
  console.log(`\n${passed} document revision checks passed. No live writes or real signatures.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
