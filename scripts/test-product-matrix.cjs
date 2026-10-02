const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { PDFDocument, PDFPage, rgb } = require('pdf-lib');
const { load, routeProbe, mockClient, png, blast40, hydroData, org, unit } = require('./test-eu-doc-signature.cjs');
const matrix = require('./fixtures/applied-product-matrix.json');
const hydro = load('lib/certifications/hydrostatic.ts');
const products = load('lib/certifications/products.ts');
const euBuilder = load('lib/pdf/certifications/buildEuDeclarationOfConformityPdf.ts');
const htBuilder = load('lib/pdf/certifications/buildHydrostaticTestPdf.ts');
const ink = load('lib/pdf/certifications/signatureInk.ts');

const fixtures = matrix.rows.map(([model, code, description, volume, ps, category, type, pt, requirement, approved]) => ({
  ...blast40, id: model, product_title: `${description} ${model}`, product_code: code,
  eu_doc_product_type: type, eu_doc_ped_category: category, certification_issue_enabled: approved,
  eu_doc_certificate_no: approved && ['cat-ii', 'cat-iii'].includes(category)
    ? category === 'cat-ii' ? 'HPiVS-iP1283-001-1' : 'HPiVS-iP1283-001-I-03-00' : null,
  hydrostatic_profile: { modelCode: model, equipmentDescription: description, volumeLitres: volume,
    maxPressureBar: ps, minTemperatureC: '-10', maxTemperatureC: '80', testPressureBar: pt || '',
    requirement, issueEnabled: approved && requirement !== 'not-applicable' },
}));
let count = 0;
async function check(name, fn) { await fn(); count++; console.log(`PASS ${name}`); }

async function main() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
  for (const product of fixtures) {
    const model = product.id;
    for (const mode of ['test', 'issued']) await check(`${model} Hydrostatic ${mode} approval and product values`, async () => {
      const { response, body, calls } = await routeProbe({ type: 'hydrostatic-test', product, productId: model,
        documentMode: mode, data: { ...hydroData, model: 'FORGED', assessmentModules: 'Z', testPressureBar: '999' } });
      const allowed = product.eu_doc_product_type !== 'pto-compressor' && (mode === 'test' || product.certification_issue_enabled);
      assert.equal(response.status, allowed ? 200 : 409, JSON.stringify(body));
      if (!allowed) { assert.equal(calls.uploads.length, 0); assert.equal(calls.downloads.length, 0); return; }
      const saved = calls.records[0].data;
      assert.equal(saved.testPressureBar, product.hydrostatic_profile.testPressureBar);
      assert.equal(saved.model, `${model} / ${product.product_code}`);
      assert.equal(saved.pedCategory, product.eu_doc_ped_category);
      assert.equal(saved.assessmentModules, hydro.hydrostaticAssessmentModules(product.eu_doc_ped_category));
      assert.equal(saved.certificateNumber, `${mode === 'test' ? 'TEST-' : ''}ACL-HT-${model}-AP-26-00115`);
      if (mode === 'issued') assert.equal(saved.signature.renderedInk, '#1746A2');
    });
    if (product.eu_doc_product_type === 'air-receiver') continue;
    const type = product.eu_doc_product_type === 'air-filter' ? 'sep-air-filter-serialised'
      : product.eu_doc_ped_category === 'cat-i' ? 'eu-doc-20l-serialised' : 'eu-doc-serialised';
    for (const mode of ['test', 'issued']) await check(`${model} declaration ${mode} approval and trusted identity`, async () => {
      const { response, calls, body } = await routeProbe({ type, product, productId: model, documentMode: mode,
        data: { commercialName: 'FORGED', modelType: 'WRONG' } });
      const allowed = product.eu_doc_product_type !== 'pto-compressor' && (mode === 'test' || product.certification_issue_enabled);
      assert.equal(response.status, allowed ? 200 : 400, JSON.stringify(body));
      if (!allowed) { assert.equal(calls.uploads.length, 0); assert.equal(calls.downloads.length, 0); return; }
      assert.equal(calls.records[0].data.modelType, `${model} / ${product.product_code}`);
      assert.equal(calls.records[0].data.commercialName, product.product_title);
    });
  }
  const af = fixtures.find(p => p.id === 'AF5L');
  for (const [name, patch] of [
    ['AF5L cannot use 20 bar', { hydrostatic_profile: { ...af.hydrostatic_profile, testPressureBar: '20' } }],
    ['AF5L cannot be mandatory', { hydrostatic_profile: { ...af.hydrostatic_profile, requirement: 'mandatory' } }],
    ['SEP cannot have a NB certificate', { eu_doc_certificate_no: 'FORGED' }],
    ['PS cannot exceed PT', { hydrostatic_profile: { ...af.hydrostatic_profile, maxPressureBar: '16' } }],
  ]) await check(name, async () => {
    const result = await routeProbe({ type: 'hydrostatic-test', product: { ...af, ...patch }, productId: af.id, documentMode: 'test', data: hydroData });
    assert.equal(result.response.status, 409); assert.equal(result.calls.uploads.length, 0);
  });
  await check('global signed hold overrides a locally approved Hydrostatic profile', async () => {
    assert.ok(hydro.hydrostaticSetupError({ ...blast40, certification_issue_enabled: false }, true));
    assert.ok(products.declarationIssueError({ ...blast40, certification_issue_enabled: false }));
    const held = fixtures.find(p => p.id === 'BP200LX');
    assert.equal(products.isAvailableDeclarationProduct('eu-doc-serialised', held), true);
  });
  await check('blue ink retains dimensions and alpha, leaves original untouched', async () => {
    const original = Buffer.from(png);
    const converted = await ink.blueSignaturePng(png);
    const before = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const after = await sharp(converted).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual(png, original); assert.equal(before.info.width, after.info.width); assert.equal(before.info.height, after.info.height);
    for (let i = 0; i < after.data.length; i += 4) {
      assert.deepEqual([...after.data.subarray(i, i + 3)], [23, 70, 162]);
      assert.equal(after.data[i + 3], before.data[i + 3]);
    }
    const white = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#ffffff' } }).png().toBuffer();
    const transparent = await sharp(await ink.blueSignaturePng(white)).raw().toBuffer();
    assert.equal(transparent[3], 0);
  });
  for (const role of ['owner', 'member', 'viewer']) await check(`${role} signed approval settings permissions`, async () => {
    const { client } = mockClient({ role }); let saved;
    const from = client.from;
    client.from = table => table !== 'products' ? from(table) : {
      update(data) { saved = data; return this; }, eq() { return this; }, select() { return this; },
      single: async () => ({ data: { id: blast40.id } }),
    };
    const actions = load('app/dashboard/actions.ts', { '@/lib/supabase/server': { createClient: async () => client }, 'next/cache': { revalidatePath() {} } });
    const form = new FormData();
    Object.entries({ editingProductId: blast40.id, productTitle: 'Test', productCode: 'BP-A-2000',
      description: 'Test', certificationIssueEnabled: 'false' }).forEach(([key, value]) => form.set(key, value));
    const result = await actions.saveDatasheet(null, form);
    assert.equal(Boolean(result.error), role !== 'owner');
    if (role === 'owner') assert.equal(saved.certification_issue_enabled, false); else assert.equal(saved, undefined);
  });
  const output = process.env.MATRIX_TEST_OUTPUT;
  if (output) fs.mkdirSync(output, { recursive: true });
  for (const [name, type, product] of [
    ['hydro-af5l', 'hydrostatic-test', af],
    ['hydro-bp20l', 'hydrostatic-test', fixtures[0]],
    ['hydro-ar32l', 'hydrostatic-test', fixtures.find(p => p.id === 'AR32L')],
    ['sep-af5l', 'sep-air-filter-serialised', af],
    ['doc-bp200lx', 'eu-doc-serialised', fixtures.find(p => p.id === 'BP200LX')],
  ]) await check(`${name} PDF content, page count and layout`, async () => {
    const text = [], images = [];
    const originalText = PDFPage.prototype.drawText, originalImage = PDFPage.prototype.drawImage;
    PDFPage.prototype.drawText = function(value, opts) { text.push({ value, ...opts }); return originalText.call(this, value, opts); };
    PDFPage.prototype.drawImage = function(value, opts) { images.push(value); return originalImage.call(this, value, opts); };
    let bytes;
    try {
      bytes = type === 'hydrostatic-test' ? await htBuilder.buildHydrostaticTestPdf({ ...hydroData,
        ...hydro.hydrostaticProductFields(product), certificateNumber: `TEST-ACL-HT-${product.id}-AP-26-00115` }, { isTest: true })
        : await euBuilder.buildEuDeclarationOfConformityPdf(type, { ...unit, declarationNumber: 'TEST-ACL-26_161',
          commercialName: product.product_title, modelType: products.certificateModelName(product) }, { templateRevision: '01' }, {
          productTitle: product.product_title, productCode: product.product_code, productType: product.eu_doc_product_type,
          pedCategory: product.eu_doc_ped_category, certificateNo: product.eu_doc_certificate_no || '',
          modelType: products.certificateModelName(product), equipmentProfile: product.hydrostatic_profile, issueEnabled: product.certification_issue_enabled,
        }, undefined, { isTest: true });
    } finally { PDFPage.prototype.drawText = originalText; PDFPage.prototype.drawImage = originalImage; }
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), type === 'hydrostatic-test' ? 1 : 2);
    const content = text.map(t => t.value).join(' ');
    assert.ok(content.includes('TEST / NOT FOR ISSUE'));
    assert.ok(content.includes(product.id));
    if (name.includes('af5l')) { assert.equal(content.includes('2810'), false); assert.equal(content.includes('12.3'), false); assert.ok(content.includes('15 bar')); }
    if (name === 'sep-af5l') { assert.ok(content.includes('-10')); assert.ok(content.includes('certificate optional')); assert.equal(images.length, 2); }
    if (name === 'doc-bp200lx') assert.ok(content.includes('Pending certification (test only)'));
    for (const t of text) assert.ok(t.x + t.font.widthOfTextAtSize(t.value, t.size) <= 568, `Right overflow: ${t.value}`);
    if (output) fs.writeFileSync(path.join(output, `${name}.pdf`), bytes);
  });
  console.log(`\n${count} product-matrix checks passed. No live writes or real signatures.`);
  if (output) {
    const pdf = await PDFDocument.load(await htBuilder.buildHydrostaticTestPdf(hydroData, { signaturePng: png }));
    pdf.getPage(0).drawText('SYNTHETIC SIGNATURE TEST - NOT FOR ISSUE', { x: 108, y: 620, size: 10, color: rgb(0.1, 0.1, 0.1) });
    fs.writeFileSync(path.join(output, 'hydro-blue-ink-test.pdf'), await pdf.save());
  }
}
module.exports = { fixtures };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
