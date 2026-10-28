const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PDFPage, PDFDocument } = require('pdf-lib');
const { load, routeProbe, blast40, unit, hydroData } = require('./test-eu-doc-signature.cjs');
const { supplementalDeclarationProfile } = load('lib/certifications/declarations.ts');
const { fixedManualMetadata, compressorSerialNumber, compressorSerialSchema, RECEIVER_CERTIFICATE } = load('lib/certifications/reference.ts');
const { unitSerialNumber } = load('lib/certifications/unit.ts');
const { serialisedDeclarationNumber } = load('lib/certifications/release.ts');
const { buildEuDeclarationOfConformityPdf } = load('lib/pdf/certifications/buildEuDeclarationOfConformityPdf.ts');
const { buildHydrostaticTestPdf } = load('lib/pdf/certifications/buildHydrostaticTestPdf.ts');
let passed = 0;
async function check(name, run) { await run(); passed++; console.log(`PASS ${name}`); }
async function capture(build) {
  const texts = [], drawText = PDFPage.prototype.drawText;
  PDFPage.prototype.drawText = function(value, options) { texts.push({ value, ...options }); return drawText.call(this, value, options); };
  try { return { bytes: await build(), texts }; }
  finally { PDFPage.prototype.drawText = drawText; }
}

async function main() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
  const output = process.env.CERTIFICATE_CORRECTIONS_OUTPUT;
  if (output) fs.mkdirSync(output, { recursive: true });
  const types = ['eu-doc-20l-manual', 'eu-doc-20l-serialised', 'sep-air-filter-manual', 'sep-air-filter-serialised'];
  for (const type of types) {
    const profile = supplementalDeclarationProfile(type), serialised = type.endsWith('serialised');
    const product = { ...blast40, product_code: profile.productCode,
      product_title: profile.kind === '20l' ? 'Applied 20 Litre Classic Blast Machine' : profile.commercialName,
      eu_doc_product_type: profile.productType, eu_doc_ped_category: profile.pedCategory, eu_doc_certificate_no: null,
      hydrostatic_profile: null };
    const config = { productCode: profile.productCode, productType: profile.productType, pedCategory: profile.pedCategory,
      productTitle: product.product_title, certificateNo: '', modelType: profile.modelType };
    const data = { ...unit, issueDate: '2026-10-28', declarationNumber: 'FORGED', revision: '05',
      serialNumber: 'AP-27-00123', yearOfConstruction: '2027', commercialName: 'FORGED' };
    const number = serialised ? `${profile.numberPrefix}-27_123` : `${profile.numberPrefix}-OM01`;
    for (const documentMode of ['test', 'issued']) await check(`${type}: fixed identity, revision and unchanged date (${documentMode})`, async () => {
      const r = await routeProbe({ type, product, documentMode, data });
      assert.equal(r.response.status, 200, JSON.stringify(r.body));
      const saved = r.calls.records[0].data;
      assert.equal(saved.declarationNumber, `${documentMode === 'test' ? 'TEST-' : ''}${number}`);
      assert.equal(saved.revision, serialised ? '05' : profile.revision);
      assert.equal(saved.issueDate, data.issueDate);
      if (serialised && profile.kind === '20l') assert.equal(saved.commercialName, 'Blast Machine BP20L');
      if (!serialised) assert.equal(saved.serialNumber, undefined);
    });
    await check(`${type}: PDF labels, footer, revision and page bounds`, async () => {
      const { bytes, texts } = await capture(() => buildEuDeclarationOfConformityPdf(type,
        { ...data, declarationNumber: number }, { templateRevision: '01' }, config, undefined, { isTest: true }));
      assert.equal((await PDFDocument.load(bytes)).getPageCount(), 2);
      assert.equal(texts.filter(t => t.value === 'www.appliedpi.com').length, 2);
      assert.equal(texts.some(t => t.value.includes('ptocompressors')), false);
      assert.equal(texts.filter(t => t.value === 'As stated on the product data plate').length, serialised ? 0 : 2);
      assert.ok(texts.some(t => t.value === `TEST-${number}`));
      assert.ok(texts.some(t => t.value === '28/October/2026'));
      const revisionIndex = texts.findIndex(t => t.value === 'Revision');
      assert.equal(texts[revisionIndex + 1].value, serialised ? '05' : profile.revision);
      if (profile.kind === '20l') {
        assert.ok(texts.some(t => t.value === 'Blast Machine BP20L'));
        assert.equal(texts.some(t => t.value.includes('Applied 20 Litre Classic')), false);
      }
      for (const t of texts) {
        assert.ok(t.x >= 50 && t.x + t.font.widthOfTextAtSize(t.value, t.size) <= 568, `Overflow: ${t.value}`);
        if (!t.value.startsWith('www.') && !t.value.startsWith('Page ')) assert.ok(t.y > 65, `Footer collision: ${t.value}`);
      }
      if (output) fs.writeFileSync(path.join(output, `${type}.pdf`), bytes);
    });
    if (!serialised) await check(`${type}: metadata applies only to the matching product`, () => {
      assert.equal(fixedManualMetadata(type, null), null);
      assert.equal(fixedManualMetadata(type, { ...config, productCode: 'OTHER' }), null);
      assert.equal(fixedManualMetadata(type, config).issueDate, undefined);
    });
  }
  for (const [year, digits, suffix] of [['2027', '00123', '123'], ['2027', '01234', '1234'], ['2026', '00355', '355'], ['2028', '00000', '0']]) {
    await check(`manufacture year ${year} and leading zeros ${digits}`, async () => {
      const serial = unitSerialNumber(year, digits);
      assert.equal(serial, `AP-${year.slice(-2)}-${digits}`);
      assert.equal(serialisedDeclarationNumber(serial), `ACL-DoC-${year.slice(-2)}_${suffix}`);
      const r = await routeProbe({ data: { serialNumber: serial, yearOfConstruction: year, declarationNumber: 'FORGED' } });
      assert.equal(r.response.status, 200, JSON.stringify(r.body));
      assert.equal(r.calls.records[0].data.declarationNumber, `ACL-DoC-${year.slice(-2)}_${suffix}`);
    });
  }
  await check('receiver compressor prefix follows manufacture year, independently of receiver digits', async () => {
    assert.equal(compressorSerialNumber('2027', '00888'), 'AP-27-00888');
    assert.equal(compressorSerialNumber('2028', '00888'), 'AP-28-00888');
    assert.equal(compressorSerialNumber('20', '00888'), '');
    assert.equal(compressorSerialNumber('2027', ' '), '');
    assert.equal(compressorSerialSchema.safeParse(compressorSerialNumber('2027', 'A'.repeat(75))).success, false);
    assert.equal(compressorSerialSchema.safeParse(compressorSerialNumber('2027', 'A'.repeat(74))).success, true);
    assert.equal(compressorSerialSchema.safeParse('VM350-2026-12345').success, true, 'Legacy serial formats remain readable');
    const r = await routeProbe({ product: { ...blast40, product_code: 'VM-A-0003', eu_doc_product_type: 'air-receiver',
      eu_doc_certificate_no: RECEIVER_CERTIFICATE }, data: { yearOfConstruction: '2027', serialNumber: 'AP-27-00123',
      compressorSerialNumber: compressorSerialNumber('2027', '00888') } });
    assert.equal(r.response.status, 200, JSON.stringify(r.body));
    assert.equal(r.calls.records[0].data.compressorSerialNumber, 'AP-27-00888');
    assert.equal(r.calls.records[0].data.serialNumber, 'AP-27-00123');
  });
  for (const minutes of ['15', '30']) await check(`Hydrostatic minimum holding wording (${minutes} minutes)`, async () => {
    const { bytes, texts } = await capture(() => buildHydrostaticTestPdf({ ...hydroData, holdingMinutes: minutes }, { isTest: true }));
    assert.ok(texts.some(t => t.value.includes(`held for at least ${minutes} minutes`)));
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
    if (output && minutes === '15') fs.writeFileSync(path.join(output, 'hydrostatic-bp40l.pdf'), bytes);
  });
  console.log(`\n${passed} certificate correction checks passed. No live writes or real signatures.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
