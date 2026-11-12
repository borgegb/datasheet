const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument, PDFPage } = require('pdf-lib');
const { load, routeProbe, blast40, unit } = require('./test-eu-doc-signature.cjs');
const { fixtures } = require('./test-product-matrix.cjs');
const { serialisedDeclarationNumber, DECLARATION_MODEL_CODE_MESSAGE } = load('lib/certifications/release.ts');
const { certificateModelCode } = load('lib/certifications/products.ts');
const { certificateDownloadName } = load('lib/certifications/download.ts');
const { hydrostaticProductCertificateNumber } = load('lib/certifications/hydrostatic.ts');
const { CAT_III_CERTIFICATE, RECEIVER_CERTIFICATE } = load('lib/certifications/reference.ts');
const { buildEuDeclarationOfConformityPdf } = load('lib/pdf/certifications/buildEuDeclarationOfConformityPdf.ts');
let passed = 0;
async function check(name, run) { await run(); passed++; console.log(`PASS ${name}`); }

async function capturePdf(args) {
  const texts = [], drawText = PDFPage.prototype.drawText;
  PDFPage.prototype.drawText = function(value, options) {
    texts.push({ value, page: this, ...options });
    return drawText.call(this, value, options);
  };
  try { return { bytes: await buildEuDeclarationOfConformityPdf(...args), texts }; }
  finally { PDFPage.prototype.drawText = drawText; }
}

async function main() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
  const output = process.env.DOC_NAMING_OUTPUT;
  if (output) fs.mkdirSync(output, { recursive: true });
  for (const fixture of fixtures.filter(p => ['blast-machine', 'air-receiver'].includes(p.eu_doc_product_type))) {
    const product = { ...fixture, certification_issue_enabled: true,
      eu_doc_certificate_no: fixture.eu_doc_product_type === 'air-receiver' ? RECEIVER_CERTIFICATE
        : fixture.eu_doc_ped_category === 'cat-iii' ? CAT_III_CERTIFICATE : fixture.eu_doc_certificate_no };
    const type = product.eu_doc_ped_category === 'cat-i' ? 'eu-doc-20l-serialised' : 'eu-doc-serialised';
    const model = product.hydrostatic_profile.modelCode;
    for (const documentMode of ['test', 'issued']) await check(`${model} ${documentMode}: form, PDF, stored number and filename agree`, async () => {
      const serial = 'AP-26-00375';
      const number = `ACL-DoC-${model}-${serial}`;
      const expected = `${documentMode === 'test' ? 'TEST-' : ''}${number}`;
      assert.equal(serialisedDeclarationNumber(serial, type, certificateModelCode(product)), number);
      assert.equal(number.replace('ACL-DoC-', 'ACL-HT-'), hydrostaticProductCertificateNumber(product, serial));
      const r = await routeProbe({ type, product, productId: product.id, documentMode,
        data: { serialNumber: serial, issueDate: '2026-11-12', declarationNumber: 'FORGED', modelCode: 'FORGED',
          modelType: 'FORGED', productCertification: { equipmentProfile: { modelCode: 'FORGED' } },
          compressorSerialNumber: 'AP-26-99999', revision: '02' } });
      assert.equal(r.response.status, 200, JSON.stringify(r.body));
      const saved = r.calls.records[0].data;
      assert.equal(saved.declarationNumber, expected);
      assert.equal(saved.serialNumber, serial);
      assert.equal(saved.signature?.renderedInk, documentMode === 'test' ? undefined : 'original');
      const filename = `${expected}_Rev02.pdf`;
      assert.equal(certificateDownloadName(type, saved), filename);
      assert.ok(r.calls.uploads[0].filePath.endsWith(`/${filename}`));
      assert.equal(r.calls.uploads[0].uploadOptions.upsert, false);
      assert.equal(r.calls.signedUrls[0].options.download, filename);
      assert.equal(r.calls.removals.length, 0);
      const { bytes, texts } = await capturePdf(r.calls.builder);
      assert.equal((await PDFDocument.load(bytes)).getPageCount(), 2);
      const numberIndex = texts.findIndex(t => t.value === 'Declaration No.');
      const numberValue = texts[numberIndex + 1];
      assert.equal(numberValue.value, expected);
      const revisionLabel = texts.find(t => t.value === 'Revision');
      assert.ok(numberValue.x + numberValue.font.widthOfTextAtSize(numberValue.value, numberValue.size) < revisionLabel.x - 5,
        'Declaration number overlaps the revision column');
      for (const t of texts) {
        assert.ok(t.x >= 50 && t.x + t.font.widthOfTextAtSize(t.value, t.size) <= 568, `Horizontal overflow: ${t.value}`);
        if (!t.value.startsWith('www.') && !t.value.startsWith('Page ')) assert.ok(t.y > 55, `Footer collision: ${t.value}`);
      }
      if (output && documentMode === 'test' && ['BP100LA', 'BP200LX', 'BP20L', 'AR32L'].includes(model)) {
        fs.writeFileSync(path.join(output, filename), bytes);
      }
    });
  }
  await check('year and product changes preserve the complete serial, including all zeros', () => {
    for (const year of ['26', '27', '28']) for (const digits of ['00000', '00001', '00375', '12345', '99999']) {
      for (const model of ['BP40L', 'BP100LA', 'AR32L']) {
        const serial = `AP-${year}-${digits}`;
        assert.equal(serialisedDeclarationNumber(serial, 'eu-doc-serialised', model), `ACL-DoC-${model}-${serial}`);
      }
    }
    assert.equal(serialisedDeclarationNumber('AP-26-00375'), null);
    assert.equal(serialisedDeclarationNumber('AP-26-00375', 'eu-doc-serialised', '   '), null);
  });
  for (const profile of [null, {}, { ...blast40.hydrostatic_profile, modelCode: '', issueEnabled: false }]) {
    await check(`missing certificate model rejects before storage writes: ${JSON.stringify(profile)}`, async () => {
      const product = { ...blast40, hydrostatic_profile: profile };
      assert.equal(certificateModelCode(product), '');
      for (const documentMode of ['test', 'issued']) {
        const r = await routeProbe({ product, documentMode });
        assert.equal(r.response.status, 400);
        assert.equal(r.body.error, DECLARATION_MODEL_CODE_MESSAGE);
        assert.equal(r.calls.records.length, 0);
        assert.equal(r.calls.uploads.length, 0);
        assert.equal(r.calls.downloads.length, 0);
      }
    });
  }
  await check('manufacture year mismatch still rejects generation', async () => {
    const r = await routeProbe({ data: { serialNumber: 'AP-27-00375', yearOfConstruction: '2026' } });
    assert.equal(r.response.status, 400);
    assert.equal(r.calls.uploads.length, 0);
  });
  await check('SEP naming and its leading-zero rule are unchanged', async () => {
    const product = { ...fixtures.find(p => p.id === 'AF5L'), hydrostatic_profile: null };
    const r = await routeProbe({ type: 'sep-air-filter-serialised', product, productId: product.id,
      data: { serialNumber: 'AP-26-00375' } });
    assert.equal(r.response.status, 200, JSON.stringify(r.body));
    assert.equal(r.calls.records[0].data.declarationNumber, 'ACL-SEP-RAF-26_375');
  });
  await check('existing issued documents retain their old download names', () => {
    const old = { ...unit, declarationNumber: 'ACL-DoC-26_375', revision: '01',
      productCertification: { equipmentProfile: { modelCode: 'BP100LA' } } };
    assert.equal(certificateDownloadName('eu-doc-serialised', old), 'ACL-DoC-26_375_Rev01.pdf');
    assert.equal(old.declarationNumber, 'ACL-DoC-26_375');
    assert.equal(certificateDownloadName('eu-doc-owner-manual-blasting', { declarationNumber: 'ACL-DoC-OM02', revision: '01' }), 'ACL-DoC-OM02_Rev01.pdf');
  });
  console.log(`\n${passed} DoC naming checks passed. No live writes or real signatures.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
