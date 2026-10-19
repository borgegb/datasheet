const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument, PDFPage } = require('pdf-lib');
const { load, routeProbe, png, unit, org, blast40, hydroData } = require('./test-eu-doc-signature.cjs');
const { fixtures } = require('./test-product-matrix.cjs');
const { allowsBlankDeclarationCertificate, euDocHoldReason } = load('lib/certifications/release.ts');
const { buildEuDeclarationOfConformityPdf } = load('lib/pdf/certifications/buildEuDeclarationOfConformityPdf.ts');
const { certificateModelName, isAvailableDeclarationProduct } = load('lib/certifications/products.ts');
const released = fixtures.filter(p => ['VM350', 'BP200LX'].includes(p.id))
  .map(p => ({ ...p, certification_issue_enabled: true }));
let count = 0;
async function check(name, run) { await run(); count++; console.log(`PASS ${name}`); }

async function main() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
  const output = process.env.PTO_TEST_OUTPUT;
  if (output) fs.mkdirSync(output, { recursive: true });

  for (const product of released) {
    const manual = product.id === 'VM350' ? 'eu-doc-owner-manual-pto-compressors' : 'eu-doc-owner-manual-blasting';
    for (const type of ['eu-doc-serialised', manual]) {
      for (const documentMode of ['test', 'issued']) await check(`${product.id} ${type} ${documentMode}`, async () => {
        const { response, body, calls } = await routeProbe({ type, product, productId: product.id, documentMode });
        assert.equal(response.status, 200, JSON.stringify(body));
        assert.equal(calls.records[0].data.productCertification.certificateNo, '');
        assert.equal(calls.records[0].data.productCertification.issueEnabled, true);
        assert.equal(calls.records[0].data.documentMode, documentMode);
        assert.equal(calls.downloads.length, documentMode === 'issued' ? 1 : 0);
        assert.equal(Boolean(calls.records[0].data.signature), documentMode === 'issued');
        if (documentMode === 'issued') {
          assert.equal(calls.records[0].data.signature.renderedInk, 'original');
          assert.deepEqual(Buffer.from(calls.builder[4]), png);
        }
      });
      await check(`${product.id} ${type} two-page signed PDF, blank reference, no pending label`, async () => {
        const texts = [], images = [];
        const originalText = PDFPage.prototype.drawText, originalImage = PDFPage.prototype.drawImage;
        PDFPage.prototype.drawText = function(value, opts) { texts.push({ value, ...opts }); return originalText.call(this, value, opts); };
        PDFPage.prototype.drawImage = function(value, opts) { images.push(value); return originalImage.call(this, value, opts); };
        let bytes;
        try {
          bytes = await buildEuDeclarationOfConformityPdf(type, { ...unit, declarationNumber: 'ACL-DoC-26_161',
            commercialName: product.product_title, modelType: certificateModelName(product), issueDate: '2026-10-19', revision: '01' },
          { templateRevision: '01' }, {
            productTitle: product.product_title, productCode: product.product_code, productType: product.eu_doc_product_type,
            pedCategory: product.eu_doc_ped_category, certificateNo: '', modelType: certificateModelName(product),
            equipmentProfile: product.hydrostatic_profile, issueEnabled: true,
          }, png);
        } finally { PDFPage.prototype.drawText = originalText; PDFPage.prototype.drawImage = originalImage; }
        const content = texts.map(t => t.value).join(' ');
        assert.equal((await PDFDocument.load(bytes)).getPageCount(), 2);
        assert.ok(content.includes(product.product_code));
        assert.ok(content.includes('Certificate No(s).:'));
        assert.equal(/Pending certification|NOT FOR ISSUE|HPiVS-/.test(content), false);
        assert.equal(content.includes('EN 1012-1'), product.id === 'VM350');
        assert.ok(content.includes(product.id === 'VM350' ? 'Module A2' : 'Module B + C2'));
        assert.equal(content.includes('AP-26-00161'), type === 'eu-doc-serialised');
        assert.equal(images.filter(image => image.width === 330 && image.height === 54).length, 1);
        for (const t of texts) assert.ok(t.x + t.font.widthOfTextAtSize(t.value, t.size) <= 568, `Overflow: ${t.value}`);
        if (output) fs.writeFileSync(path.join(output, `${product.id}-${type}-synthetic.pdf`), bytes);
      });
    }
    for (const issueEnabled of [false, null, undefined]) await check(`${product.id} still needs explicit signed enablement (${issueEnabled})`, async () => {
      const result = await routeProbe({ product: { ...product, certification_issue_enabled: issueEnabled }, productId: product.id,
        data: { certification_issue_enabled: true, productCertification: { issueEnabled: true, certificateNo: 'FORGED' } } });
      assert.equal(result.response.status, 400);
      assert.equal(result.calls.downloads.length, 0);
      assert.equal(result.calls.uploads.length, 0);
    });
    await check(`${product.id} still requires the private organization signature`, async () => {
      const result = await routeProbe({ product, productId: product.id, signaturePath: null });
      assert.equal(result.response.status, 409); assert.equal(result.calls.uploads.length, 0);
    });
    await check(`${product.id} does not unlock Hydrostatic issuance`, async () => {
      const result = await routeProbe({ type: 'hydrostatic-test', product, productId: product.id, data: hydroData });
      assert.equal(result.response.status, 409); assert.equal(result.calls.uploads.length, 0);
    });
  }

  await check('blank reference exception is limited to the exact released product mapping', () => {
    for (const product of released) {
      const config = { productCode: product.product_code, productType: product.eu_doc_product_type,
        pedCategory: product.eu_doc_ped_category, issueEnabled: true };
      assert.equal(allowsBlankDeclarationCertificate(config), true);
      for (const patch of [{ productCode: 'OTHER' }, { productType: 'air-receiver' }, { pedCategory: 'cat-i' }, { issueEnabled: false }]) {
        assert.equal(allowsBlankDeclarationCertificate({ ...config, ...patch }), false);
      }
      const otherManual = product.id === 'VM350' ? 'eu-doc-owner-manual-blasting' : 'eu-doc-owner-manual-pto-compressors';
      assert.equal(isAvailableDeclarationProduct(otherManual, product), false);
    }
    assert.ok(euDocHoldReason('ec-vm-350-declaration'));
    assert.equal(euDocHoldReason('eu-doc-owner-manual-pto-compressors'), null);
  });
  for (const product of [blast40, fixtures.find(p => p.id === 'AR32L')]) await check(`${product.product_code} missing certificate not bypassed`, async () => {
    const result = await routeProbe({ product: { ...product, eu_doc_certificate_no: null, certification_issue_enabled: true }, productId: product.id });
    assert.equal(result.response.status, 400); assert.equal(result.calls.uploads.length, 0);
  });

  for (const [type, family, expected] of [
    ['eu-doc-serialised', undefined, 'BP200LX'], ['eu-doc-serialised', 'pto-compressor', 'VM350'],
    ['eu-doc-owner-manual-pto-compressors', undefined, 'VM350'],
    ['eu-doc-owner-manual-blasting', 'pto-compressor', 'BP200LX'],
  ]) await check(`${type} ${family || 'default'} dropdown uses the right family and organization`, async () => {
    const filters = {};
    const client = { auth: { getUser: async () => ({ data: { user: { id: 'user-a' } } }) }, from(table) {
      return { select() { return this; }, eq(key, value) { filters[key] = value; return this; },
        single: async () => ({ data: { organization_id: org } }), order: async () => ({ data: released }) };
    } };
    const actions = load('app/dashboard/certifications/actions.ts', {
      '@/lib/supabase/server': { createClient: async () => client }, 'next/cache': { revalidatePath() {} },
    });
    const result = await actions.fetchEuDocProducts(type, family);
    assert.equal(result.error, null); assert.deepEqual(result.data.map(p => p.id), [expected]);
    assert.equal(filters.organization_id, org);
    assert.equal(filters.eu_doc_product_type, expected === 'VM350' ? 'pto-compressor' : 'blast-machine');
  });
  console.log(`\n${count} PTO release checks passed. No live writes or real signatures.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
