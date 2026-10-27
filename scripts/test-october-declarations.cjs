const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument, PDFPage } = require('pdf-lib');
const { load, routeProbe, png, org, unit, blast40, hydroData } = require('./test-eu-doc-signature.cjs');
const { CAT_III_CERTIFICATE, RECEIVER_CERTIFICATE, fixedManualMetadata, declarationReference, referenceIdentity } = load('lib/certifications/reference.ts');
const { certificateDownloadName } = load('lib/certifications/download.ts');
const { isAvailableDeclarationProduct } = load('lib/certifications/products.ts');
const { buildEuDeclarationOfConformityPdf } = load('lib/pdf/certifications/buildEuDeclarationOfConformityPdf.ts');
const receiver = { ...blast40, product_code: 'VM-A-0003', product_title: 'Air Receiver AR32L', eu_doc_product_type: 'air-receiver',
  eu_doc_ped_category: 'cat-ii', eu_doc_certificate_no: RECEIVER_CERTIFICATE, certification_issue_enabled: true,
  hydrostatic_profile: { modelCode: 'AR32L', equipmentDescription: 'Air Receiver', volumeLitres: '32', maxPressureBar: '12',
    minTemperatureC: '-10', maxTemperatureC: '80', testPressureBar: '20', requirement: 'mandatory', issueEnabled: true } };
const catIII = { ...blast40, product_code: 'BP-A-5200', product_title: 'Blast Machine BP200LX',
  eu_doc_ped_category: 'cat-iii', eu_doc_certificate_no: CAT_III_CERTIFICATE, certification_issue_enabled: true };
const catII = { ...blast40, product_code: 'BP-A-3000', product_title: 'Blast Machine BP100L' };
const cases = [
  ['receiver-manual', 'eu-doc-owner-manual-pto-compressors', receiver],
  ['cat-ii-manual', 'eu-doc-owner-manual-blasting', catII],
  ['cat-iii-manual', 'eu-doc-owner-manual-blasting', catIII],
  ['receiver-serialised', 'eu-doc-serialised', receiver],
  ['cat-ii-serialised', 'eu-doc-serialised', catII],
  ['cat-iii-serialised', 'eu-doc-serialised', catIII],
];
function config(p) { return { productCode: p.product_code, productTitle: p.product_title, productType: p.eu_doc_product_type,
  pedCategory: p.eu_doc_ped_category, certificateNo: p.eu_doc_certificate_no, issueEnabled: p.certification_issue_enabled }; }
let passed = 0;
async function check(name, run) { await run(); passed++; console.log(`PASS ${name}`); }
async function main() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
  const output = process.env.OCTOBER_PDF_OUTPUT;
  if (output) fs.mkdirSync(output, { recursive: true });
  for (const [name, type, product] of cases) {
    const pc = config(product), manual = fixedManualMetadata(type, pc);
    const data = { ...unit, declarationNumber: 'ACL-DoC-26_999', serialNumber: 'AP-26-00999',
      ...referenceIdentity(pc), revision: declarationReference(pc).revision, issueDate: '2026-10-21',
      compressorSerialNumber: 'VM350-2026-12345', ...(manual || {}) };
    for (const documentMode of ['test', 'issued']) await check(`${name}: ${documentMode} server snapshot and signature`, async () => {
      const r = await routeProbe({ type, product, data, documentMode });
      assert.equal(r.response.status, 200, JSON.stringify(r.body));
      const saved = r.calls.records[0].data;
      assert.equal(saved.signature?.renderedInk, documentMode === 'issued' ? 'original' : undefined);
      assert.equal(r.calls.downloads.length, documentMode === 'issued' ? 1 : 0);
      assert.equal(saved.compressorSerialNumber, name === 'receiver-serialised' ? data.compressorSerialNumber : undefined);
      if (manual) for (const key of ['revision', 'issueDate']) assert.equal(saved[key], manual[key]);
      assert.ok(r.calls.uploads[0].filePath.endsWith(certificateDownloadName(type, saved)));
      assert.equal(r.calls.signedUrls[0].options.download, certificateDownloadName(type, saved));
    });
    await check(`${name}: reference content, pagination, signatures and margins`, async () => {
      const texts = [], images = [];
      const drawText = PDFPage.prototype.drawText, drawImage = PDFPage.prototype.drawImage;
      PDFPage.prototype.drawText = function(value, opts) { texts.push({ page: this, value, ...opts }); return drawText.call(this, value, opts); };
      PDFPage.prototype.drawImage = function(value, opts) { images.push({ page: this, value, ...opts }); return drawImage.call(this, value, opts); };
      let bytes;
      try { bytes = await buildEuDeclarationOfConformityPdf(type, data, { templateRevision: '01' }, pc, png); }
      finally { PDFPage.prototype.drawText = drawText; PDFPage.prototype.drawImage = drawImage; }
      assert.equal((await PDFDocument.load(bytes)).getPageCount(), 2);
      const text = texts.map(t => t.value).join(' ');
      assert.ok(text.includes('HPi Verification Services (Ireland) Ltd'));
      assert.equal(text.includes('HPiVS-iP1283-001-I-02-00'), false);
      assert.equal(text.includes('HPiVS-iP1283-001-I-03-00'), false);
      assert.ok(text.includes('Signature'));
      assert.equal(images.filter(i => i.value.width === 330 && i.value.height === 54).length, 1);
      assert.equal(text.includes('AP-26-00999'), !manual);
      const cePage = texts.find(t => t.value === 'CE Marking').page;
      const firstPage = texts[0].page;
      assert.equal(cePage === firstPage, name !== 'cat-iii-manual');
      if (product === receiver) {
        assert.equal(text.includes('2006/42/EC'), false);
        assert.equal(text.includes('EN 1012-1'), false);
        assert.equal(text.includes('Person Authorised'), false);
        assert.ok(text.includes('20 bar') && text.includes(RECEIVER_CERTIFICATE));
        assert.ok(text.includes('PTO Compressor VM350'));
      } else {
        assert.ok(text.includes('Constituent Pressure Equipment'));
        assert.ok(text.includes('2006/42/EC'));
        assert.equal(text.includes(CAT_III_CERTIFICATE), product === catIII);
        assert.equal(text.includes('HPiVS-'), product === catIII);
        assert.ok(text.includes(product === catIII ? 'GOE 812' : 'GOE 810'));
        if (manual) assert.ok(text.includes(product === catIII ? 'BP-A-4000' : 'BP-A-6000'));
        assert.equal(texts.find(t => t.value === 'Applicable Standards').page === firstPage, !manual);
      }
      for (const t of texts) {
        assert.ok(t.x >= 50 && t.x + t.font.widthOfTextAtSize(t.value, t.size) <= 545, `Horizontal overflow: ${t.value}`);
        assert.ok(t.y >= 55 || t.y === 17, `Footer collision: ${t.value} at ${t.y}`);
      }
      if (output) fs.writeFileSync(path.join(output, `${name}-mock.pdf`), bytes);
    });
    await check(`${name}: unsigned output never embeds the supplied signature`, async () => {
      const texts = [], images = [];
      const drawText = PDFPage.prototype.drawText, drawImage = PDFPage.prototype.drawImage;
      PDFPage.prototype.drawText = function(value, opts) { texts.push(value); return drawText.call(this, value, opts); };
      PDFPage.prototype.drawImage = function(value, opts) { images.push(value); return drawImage.call(this, value, opts); };
      try { await buildEuDeclarationOfConformityPdf(type, data, { templateRevision: '01' }, pc, png, { isTest: true }); }
      finally { PDFPage.prototype.drawText = drawText; PDFPage.prototype.drawImage = drawImage; }
      assert.equal(texts.filter(t => t === 'TEST / NOT FOR ISSUE - UNSIGNED').length, 2);
      assert.equal(images.filter(i => i.width === 330 && i.height === 54).length, 0);
      assert.equal(images.length, 2, 'Applied and CE logos only');
      await assert.rejects(buildEuDeclarationOfConformityPdf(type, data, { templateRevision: '01' }, pc), /signature is required/);
    });
  }
  for (const [code, model, category, valve] of [
    ['BP-A-2000', 'BP40L', 'cat-ii', '810'], ['BP-A-3000', 'BP100L', 'cat-ii', '810'],
    ['BP-A-6000', 'BP100LA', 'cat-ii', '810'], ['BP-A-4000', 'BP140L', 'cat-iii', '810'],
    ['BP-A-5000', 'BP200L', 'cat-iii', '810'], ['BP-A-5200', 'BP200LX', 'cat-iii', '812'],
  ]) await check(`${model}: serialised identity and valve mapping`, async () => {
    const product = { ...blast40, product_code: code, eu_doc_ped_category: category,
      eu_doc_certificate_no: category === 'cat-iii' ? CAT_III_CERTIFICATE : blast40.eu_doc_certificate_no };
    const r = await routeProbe({ product, data: { commercialName: 'FORGED', modelType: 'WRONG' } });
    assert.equal(r.response.status, 200, JSON.stringify(r.body));
    assert.equal(r.calls.records[0].data.modelType, `${model} / ${code}`);
    const texts = [], original = PDFPage.prototype.drawText;
    PDFPage.prototype.drawText = function(value, opts) { texts.push(value); return original.call(this, value, opts); };
    try { await buildEuDeclarationOfConformityPdf('eu-doc-serialised', unit, { templateRevision: '01' }, config(product), png); }
    finally { PDFPage.prototype.drawText = original; }
    const content = texts.join(' ');
    assert.ok(content.includes(`GOE ${valve}`));
    assert.equal(content.includes(`GOE ${valve === '810' ? '812' : '810'}`), false);
  });
  for (const serial of [undefined, '', '   ', 'A'.repeat(81), '<script>']) await check(`receiver rejects invalid compressor serial ${JSON.stringify(serial)}`, async () => {
    const r = await routeProbe({ product: receiver, data: { compressorSerialNumber: serial } });
    assert.equal(r.response.status, 400); assert.equal(r.calls.uploads.length, 0);
  });
  for (const product of [receiver, catIII]) {
    for (const patch of [{ eu_doc_certificate_no: 'OLD' }, { eu_doc_certificate_no: null }, { certification_issue_enabled: false }]) {
      await check(`${product.product_code}: signed guard ${JSON.stringify(patch)}`, async () => {
        const r = await routeProbe({ product: { ...product, ...patch }, data: { compressorSerialNumber: 'VM-12345' } });
        assert.equal(r.response.status, 400); assert.equal(r.calls.uploads.length, 0);
      });
    }
  }
  await check('fixed manual values cannot be overridden by client', async () => {
    const r = await routeProbe({ type: 'eu-doc-owner-manual-blasting', product: catIII,
      data: { declarationNumber: 'FORGED', issueDate: 'BAD', revision: '99' } });
    assert.equal(r.response.status, 200);
    assert.equal(r.calls.records[0].data.declarationNumber, 'ACL-DoC-OM03');
    assert.equal(r.calls.records[0].data.issueDate, '2026-10-20');
    assert.equal(r.calls.records[0].data.revision, '01');
  });
  await check('wrong family and whole compressor are unavailable', () => {
    assert.equal(isAvailableDeclarationProduct('eu-doc-owner-manual-blasting', receiver), false);
    assert.equal(isAvailableDeclarationProduct('eu-doc-owner-manual-pto-compressors', catIII), false);
    assert.equal(isAvailableDeclarationProduct('eu-doc-serialised', { ...receiver, product_code: 'VM-A-0001', eu_doc_product_type: 'pto-compressor' }), false);
  });
  await check('receiver Hydrostatic reuses approved 20 bar specifications', async () => {
    const r = await routeProbe({ type: 'hydrostatic-test', product: receiver, data: { ...hydroData, testPressureBar: '21' } });
    assert.equal(r.response.status, 200); assert.equal(r.calls.records[0].data.testPressureBar, '20');
  });
  await check('downloads keep revisions, test labels and safe Windows filenames', () => {
    assert.equal(certificateDownloadName('eu-doc-serialised', { declarationNumber: 'ACL-DoC-26_999', revision: '02' }), 'ACL-DoC-26_999_Rev02.pdf');
    assert.equal(certificateDownloadName('eu-doc-serialised', { declarationNumber: 'TEST-ACL-DoC-26_999', revision: '02', documentMode: 'test' }), 'TEST-ACL-DoC-26_999_Rev02.pdf');
    assert.equal(certificateDownloadName('hydrostatic-test', hydroData), 'ACL-HT-BP40L-AP-26-00115.pdf');
    assert.ok(!/[\\/:*?"<>|]/.test(certificateDownloadName('eu-doc-serialised', { declarationNumber: '../../weird:/name', revision: '01' })));
  });
  console.log(`\n${passed} October reference checks passed. No live writes or real signatures.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
