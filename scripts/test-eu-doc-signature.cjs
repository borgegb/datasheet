const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { deflateSync } = require('node:zlib');
const { createHash } = require('node:crypto');
const ts = require('typescript');
const { PDFDocument, PDFPage } = require('pdf-lib');

const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(relativePath, stubs = {}) {
  const filename = path.resolve(root, relativePath);
  if (!Object.keys(stubs).length && cache.has(filename)) return cache.get(filename);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  const localRequire = (name) => {
    if (name in stubs) return stubs[name];
    if (name.startsWith('@/')) {
      return name.endsWith('.json') ? require(path.join(root, name.slice(2))) : load(name.slice(2) + '.ts');
    }
    return require(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename })(localRequire, mod, mod.exports);
  if (!Object.keys(stubs).length) cache.set(filename, mod.exports);
  return mod.exports;
}

// An obviously artificial "TEST ONLY" raster, never a person's signature.
function testPng() {
  const glyphs = {
    T: ['11111','00100','00100','00100','00100','00100','00100'],
    E: ['11111','10000','10000','11110','10000','10000','11111'],
    S: ['01111','10000','10000','01110','00001','00001','11110'],
    O: ['01110','10001','10001','10001','10001','10001','01110'],
    N: ['10001','11001','10101','10011','10001','10001','10001'],
    L: ['10000','10000','10000','10000','10000','10000','11111'],
    Y: ['10001','10001','01010','00100','00100','00100','00100'],
  };
  const width = 330, height = 54;
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const letter = Math.floor((x - 6) / 36);
    const gx = Math.floor(((x - 6) % 36) / 6), gy = Math.floor((y - 6) / 6);
    const black = x >= 6 && y >= 6 && gx >= 0 && gx < 5 && glyphs['TEST ONLY'[letter]]?.[gy]?.[gx] === '1';
    const offset = y * (width * 4 + 1) + 1 + x * 4;
    raw[offset + 3] = black ? 255 : 0;
  }
  function chunk(type, data) {
    const body = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const byte of body) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    const result = Buffer.alloc(data.length + 12);
    result.writeUInt32BE(data.length); body.copy(result, 4);
    result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
    return result;
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const png = testPng();
const signatures = load('lib/certifications/signature.ts');
const builder = load('lib/pdf/certifications/buildEuDeclarationOfConformityPdf.ts');
const org = '11111111-1111-4111-8111-111111111111';
const signaturePath = `${org}/22222222-2222-4222-8222-222222222222.png`;
const blast = { id: 'product-a', organization_id: org, product_title: 'Blast Machine BP200L', product_code: 'BP-A-5000', eu_doc_product_type: 'blast-machine', eu_doc_ped_category: 'cat-iii', eu_doc_certificate_no: 'HPiVS-iP1283-001-I-03-00' };
const common = { declarationNumber: 'TEST-2026-001', issueDate: '2026-09-07' };
const unit = { ...common, commercialName: blast.product_title, modelType: blast.product_code, serialNumber: '26-00161', yearOfConstruction: '2026' };

function mockClient(options = {}) {
  const calls = { uploads: [], downloads: [], removals: [], records: [], settings: [], signedUrls: [] };
  const client = {
    auth: { getUser: async () => ({ data: { user: options.anonymous ? null : { id: 'user-a' } }, error: null }) },
    from(table) {
      const filters = {};
      const read = () => {
        if (table === 'profiles') return { data: { organization_id: org, role: options.role ?? 'owner' }, error: null };
        if (table === 'certification_settings') return { data: { template_revision: '01', signature_storage_path: options.signaturePath === undefined ? signaturePath : options.signaturePath }, error: options.settingsReadError ? { message: 'settings unavailable' } : null };
        if (table === 'products') {
          const product = { ...blast, ...options.product };
          return { data: product.id === filters.id && product.organization_id === filters.organization_id ? product : null, error: null };
        }
        return { data: null, error: null };
      };
      return {
        select() { return this; }, eq(key, value) { filters[key] = value; return this; },
        maybeSingle: async () => read(), single: async () => read(),
        upsert(data) {
          calls.settings.push(data);
          return { select: () => ({ single: async () => ({ data: { organization_id: org }, error: options.settingsWriteError ? { message: 'settings write failed' } : null }) }) };
        },
        insert: async (data) => { calls.records.push(data); return { error: options.recordError ? { message: 'record failed' } : null }; },
      };
    },
    storage: { from: (bucket) => ({
      upload: async (filePath, bytes, uploadOptions) => { calls.uploads.push({ bucket, filePath, bytes, uploadOptions }); return { error: options.uploadError ? { message: 'upload failed' } : null }; },
      download: async (filePath) => { calls.downloads.push({ bucket, filePath }); return { data: new Blob([options.signatureBytes || png]), error: options.downloadError ? { message: 'download failed' } : null }; },
      remove: async (paths) => { calls.removals.push({ bucket, paths }); return { error: null }; },
      createSignedUrl: async (filePath, seconds) => {
        calls.signedUrls.push({ bucket, filePath, seconds });
        return { data: options.previewError ? null : { signedUrl: 'https://example.invalid/document.pdf' }, error: options.previewError ? { message: 'preview failed' } : null };
      },
    }) },
  };
  return { client, calls };
}

async function routeProbe(options = {}) {
  const { client, calls } = mockClient(options);
  const route = load('app/api/generate-certification-pdf/[type]/route.ts', {
    '@supabase/supabase-js': { createClient: () => client },
    '@/lib/supabase/server': { createClient: async () => client },
    '@/lib/pdf/certifications/buildCertificationPdf': { buildCertificationPdf: async () => new Uint8Array([1]) },
    '@/lib/pdf/certifications/buildVm350DeclarationPdf': { buildVm350DeclarationPdf: async () => new Uint8Array([1]) },
    '@/lib/pdf/certifications/buildEuDeclarationOfConformityPdf': { ...builder, buildEuDeclarationOfConformityPdf: async (...args) => { calls.builder = args; return new Uint8Array([1]); } },
  });
  const payload = { documentMode: options.documentMode ?? 'issued', certification: { ...unit, signature: { generatedBy: 'forged', storagePath: 'wrong.png' }, ...options.data }, productId: options.productId || blast.id, organizationId: 'untrusted-org' };
  const response = await route.POST(new Request('http://localhost/test', { method: 'POST', body: JSON.stringify(payload) }), { params: Promise.resolve({ type: options.type || 'eu-doc-serialised' }) });
  return { response, body: await response.json(), calls };
}

async function actionProbe(options = {}, formOptions = {}) {
  const { client, calls } = mockClient(options);
  const actions = load('app/dashboard/actions.ts', {
    '@/lib/supabase/server': { createClient: async () => client },
    'next/cache': { revalidatePath() {} },
  });
  const form = new FormData();
  form.set('templateRevision', '02');
  if (formOptions.file !== false) form.set('signatureFile', new File([formOptions.bytes || png], 'signature.png', { type: formOptions.mime || 'image/png' }));
  if (formOptions.remove) form.set('removeSignature', 'on');
  const result = await actions.updateCertificationSettings(form);
  return { result, calls };
}

let passed = 0;
async function check(name, run) { await run(); passed++; console.log(`PASS ${name}`); }

async function run() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
  await check('valid PNG accepted', () => signatures.validateSignaturePng(png));
  await check('non-PNG rejected', () => assert.rejects(signatures.validateSignaturePng(Buffer.from('<svg/>')), /valid PNG/));
  await check('oversize file rejected', () => assert.rejects(signatures.validateSignaturePng(Buffer.alloc(524289)), /512 KB/));
  await check('oversize dimensions rejected before decoding', async () => {
    const huge = Buffer.from(png); huge.writeUInt32BE(100000, 16);
    await assert.rejects(signatures.validateSignaturePng(huge), /2048/);
  });
  await check('corrupt PNG rejected', () => assert.rejects(signatures.validateSignaturePng(png.subarray(0, 33)), /valid PNG/));
  await check('signature path is organization-scoped', () => {
    assert.ok(signatures.isSignaturePathForOrganization(signaturePath, org));
    for (const invalid of ['../other.png', `${org}/../other.png`, signaturePath.replace(org, 'other'), `https://example.com/${signaturePath}`]) assert.equal(signatures.isSignaturePathForOrganization(invalid, org), false);
  });
  for (const role of ['owner', 'member']) await check(`${role} issues with server-selected signature and attribution`, async () => {
    const { response, calls } = await routeProbe({ role });
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(calls.builder[4]), png);
    assert.deepEqual(calls.downloads, [{ bucket: signatures.SIGNATURE_BUCKET, filePath: signaturePath }]);
    assert.equal(calls.records[0].data.signature.generatedBy, 'user-a');
    assert.equal(calls.records[0].data.signature.sha256, createHash('sha256').update(png).digest('hex'));
    assert.equal(calls.records[0].data.signature.storagePath, signaturePath);
  });
  const blocked = [
    ['anonymous', { anonymous: true }, 401], ['viewer', { role: 'viewer' }, 403],
    ['unknown role', { role: 'unknown' }, 403], ['missing signature', { signaturePath: null }, 409],
    ['cross-org signature', { signaturePath: signaturePath.replace(org, 'other-org') }, 409],
    ['signature download failure', { downloadError: true }, 409],
    ['corrupt signature', { signatureBytes: Buffer.from('invalid') }, 500],
    ['missing settings schema', { settingsReadError: true }, 500],
    ['missing product certificate', { product: { eu_doc_certificate_no: '' } }, 400],
    ['cross-org product', { product: { organization_id: 'other' } }, 400],
    ['PTO manual on hold', { type: 'eu-doc-owner-manual-pto-compressors' }, 409],
    ['PTO serialised on hold with certificate', { product: { eu_doc_product_type: 'pto-compressor', eu_doc_ped_category: 'cat-ii', eu_doc_certificate_no: 'VALID-COMPRESSOR-CERT' } }, 400],
    ['invalid mode', { documentMode: 'signed-test' }, 400],
    ['viewer test', { role: 'viewer', documentMode: 'test' }, 403],
  ];
  for (const [name, options, status] of blocked) await check(`${name} blocks issuance`, async () => {
    const { response, calls, body } = await routeProbe(options);
    assert.equal(response.status, status); assert.equal(calls.uploads.length, 0); assert.equal(body.url, undefined);
    if (['anonymous', 'viewer', 'unknown role', 'cross-org signature'].includes(name)) assert.equal(calls.downloads.length, 0);
  });
  await check('record failure prevents download and cleans uploaded PDF', async () => {
    const { response, calls, body } = await routeProbe({ recordError: true });
    assert.equal(response.status, 500); assert.equal(body.url, undefined);
    assert.equal(calls.removals[0].bucket, 'datasheet-assets');
    assert.deepEqual(calls.removals[0].paths, [calls.uploads[0].filePath]);
  });
  await check('unsigned test does not load or embed a signature', async () => {
    const { response, calls } = await routeProbe({ documentMode: 'test', signaturePath: null, data: { declarationNumber: 'ACL-DoC-TEST-01', documentMode: 'issued' } });
    assert.equal(response.status, 200);
    assert.equal(calls.builder[4], undefined); assert.equal(calls.builder[5].isTest, true);
    assert.equal(calls.downloads.length, 0); assert.equal(calls.records[0].data.signature, null);
    assert.equal(calls.records[0].data.documentMode, 'test');
    assert.match(calls.records[0].data.declarationNumber, /^TEST-/);
    assert.match(calls.records[0].title, /^TEST \/ NOT FOR ISSUE/);
  });
  await check('test record failure also prevents download and cleans PDF', async () => {
    const { response, calls, body } = await routeProbe({ documentMode: 'test', recordError: true });
    assert.equal(response.status, 500); assert.equal(body.url, undefined);
    assert.equal(calls.signedUrls.length, 0); assert.equal(calls.removals.length, 1);
  });
  await check('product switching resets machine identity and per-unit values', () => {
    const { serialisedProductFields } = load('lib/certifications/release.ts');
    let fields = { ...unit, ...serialisedProductFields(blast) };
    fields = { ...fields, ...serialisedProductFields({ product_title: 'Applied 40L Classic Blast Machine', product_code: 'BP-A-2000' }) };
    assert.equal(fields.commercialName, 'Applied 40L Classic Blast Machine');
    assert.equal(fields.modelType, 'BP-A-2000');
    assert.equal(fields.serialNumber, ''); assert.equal(fields.yearOfConstruction, '');
  });
  for (const [name, options, expectedDeletes] of [
    ['storage failure keeps the record', { storageError: true }, 0],
    ['silent storage denial keeps the record', { fileRemains: true }, 0],
    ['database failure remains retryable', { deleteError: true }, 1],
    ['missing PDF can finish record cleanup', {}, 1],
    ['viewer cannot delete', { role: 'viewer' }, 0],
    ['unknown role cannot delete', { role: 'unknown' }, 0],
    ['foreign path cannot be deleted', { path: 'other-org/certifications/file.pdf' }, 0],
    ['unrelated asset cannot be deleted', { path: `${org}/images/file.png` }, 0],
  ]) await check(name, async () => {
    let deleted = 0, removed = 0;
    const client = {
      auth: { getUser: async () => ({ data: { user: { id: 'user-a' } } }) },
      from(table) {
        let deleting = false;
        const query = {
          select() { return this; }, eq() { return this; },
          single: async () => ({ data: table === 'profiles' ? { organization_id: org, role: options.role || 'owner' } : { id: 'record-a', pdf_storage_path: options.path || `${org}/certifications/test/file.pdf` }, error: null }),
          delete() { deleting = true; return this; },
          then(resolve) { if (deleting) deleted++; resolve({ error: options.deleteError ? { message: 'DB unavailable' } : null }); },
        }; return query;
      },
      storage: { from: () => ({
        remove: async () => { removed++; return { data: [], error: options.storageError ? { message: 'Storage unavailable' } : null }; },
        list: async () => ({ data: options.fileRemains ? [{ name: 'file.pdf' }] : [], error: null }),
      }) },
    };
    const actions = load('app/dashboard/certifications/actions.ts', { '@/lib/supabase/server': { createClient: async () => client }, 'next/cache': { revalidatePath() {} } });
    const result = await actions.deleteCertification('record-a');
    assert.equal(deleted, expectedDeletes);
    assert.equal(Boolean(result.error), name !== 'missing PDF can finish record cleanup');
    if (options.role || options.path) assert.equal(removed, 0);
  });
  for (const type of ['ec-vm-350-declaration', 'hydrostatic-test']) await check(`${type} does not require new signature`, async () => {
    const { response, calls } = await routeProbe({ type, signaturePath: null, data: { serialNumber: 'AP-26-0001', model: 'Test', dateOfTest: common.issueDate } });
    assert.equal(response.status, 200); assert.equal(calls.downloads.length, 0);
  });
  await check('owner uploads immutable organization-scoped signature', async () => {
    const { result, calls } = await actionProbe();
    assert.equal(result.error, null); assert.equal(calls.uploads[0].bucket, signatures.SIGNATURE_BUCKET);
    assert.equal(calls.uploads[0].uploadOptions.upsert, false);
    assert.ok(signatures.isSignaturePathForOrganization(calls.settings[0].signature_storage_path, org));
  });
  for (const role of ['member', 'viewer']) await check(`${role} cannot change signature`, async () => {
    const { result, calls } = await actionProbe({ role });
    assert.ok(result.error); assert.equal(calls.uploads.length, 0); assert.equal(calls.settings.length, 0);
  });
  for (const role of ['owner', 'member', 'viewer']) await check(`${role} signature preview permissions`, async () => {
    const { client, calls } = mockClient({ role });
    const actions = load('app/dashboard/actions.ts', {
      '@/lib/supabase/server': { createClient: async () => client },
      'next/cache': { revalidatePath() {} },
    });
    const result = await actions.fetchCertificationSettingsForOrg();
    assert.equal(result.error, null);
    assert.equal(Boolean(result.data.signaturePreviewUrl), role === 'owner');
    assert.equal(calls.signedUrls.length, role === 'owner' ? 1 : 0);
    if (role === 'owner') assert.deepEqual(calls.signedUrls[0], { bucket: signatures.SIGNATURE_BUCKET, filePath: signaturePath, seconds: 900 });
  });
  await check('cross-organization signature cannot get preview URL', async () => {
    const { client, calls } = mockClient({ signaturePath: signaturePath.replace(org, 'other-org') });
    const actions = load('app/dashboard/actions.ts', {
      '@/lib/supabase/server': { createClient: async () => client },
      'next/cache': { revalidatePath() {} },
    });
    const result = await actions.fetchCertificationSettingsForOrg();
    assert.equal(result.data.signaturePreviewUrl, undefined); assert.equal(calls.signedUrls.length, 0);
  });
  await check('anonymous cannot change signature', async () => {
    const { result, calls } = await actionProbe({ anonymous: true }); assert.ok(result.error); assert.equal(calls.uploads.length, 0);
  });
  await check('invalid upload never reaches storage', async () => {
    const { result, calls } = await actionProbe({}, { bytes: Buffer.from('invalid') }); assert.ok(result.error); assert.equal(calls.uploads.length, 0);
  });
  await check('settings failure cleans new upload without replacing original', async () => {
    const { result, calls } = await actionProbe({ settingsWriteError: true }); assert.ok(result.error);
    assert.deepEqual(calls.removals[0].paths, [calls.uploads[0].filePath]);
    assert.notEqual(calls.uploads[0].filePath, signaturePath);
  });
  await check('revision-only save preserves signature', async () => {
    const { result, calls } = await actionProbe({}, { file: false }); assert.equal(result.error, null);
    assert.equal('signature_storage_path' in calls.settings[0], false);
  });
  await check('owner disables signature', async () => {
    const { result, calls } = await actionProbe({}, { file: false, remove: true }); assert.equal(result.error, null);
    assert.equal(calls.settings[0].signature_storage_path, null); assert.equal(calls.uploads.length, 0);
  });
  await check('conflicting replacement and disable rejected', async () => {
    const { result, calls } = await actionProbe({}, { remove: true }); assert.ok(result.error); assert.equal(calls.uploads.length, 0);
  });
  const variants = [
    ['manual-blast-ii', 'eu-doc-owner-manual-blasting', { productType: 'blast-machine', pedCategory: 'cat-ii', certificateNo: 'HPiVS-iP1283-001-1', productTitle: 'Blast Machine BP100L', productCode: 'TEST-BP100' }],
    ['manual-blast-iii', 'eu-doc-owner-manual-blasting', { productType: 'blast-machine', pedCategory: 'cat-iii', certificateNo: blast.eu_doc_certificate_no, productTitle: blast.product_title, productCode: blast.product_code }],
    ['manual-pto', 'eu-doc-owner-manual-pto-compressors', { productType: 'pto-compressor', pedCategory: 'cat-ii', certificateNo: 'TEST-ONLY-NOT-ISSUED', productTitle: 'VariMount 350', productCode: 'VM-A-0001' }],
  ];
  variants.push(...variants.map(([name, , product]) => [name.replace('manual', 'serial'), 'eu-doc-serialised', product]));
  for (const [name, type, product] of variants) await check(`${name} embeds PNG above signature line on page two`, async () => {
    const images = [], lines = [];
    const drawImage = PDFPage.prototype.drawImage, drawLine = PDFPage.prototype.drawLine;
    PDFPage.prototype.drawImage = function(image, opts) { images.push({ page: this.doc.getPages().indexOf(this) + 1, ...opts }); return drawImage.call(this, image, opts); };
    PDFPage.prototype.drawLine = function(opts) { lines.push({ page: this.doc.getPages().indexOf(this) + 1, ...opts }); return drawLine.call(this, opts); };
    let bytes;
    try {
      bytes = await builder.buildEuDeclarationOfConformityPdf(type, { ...unit, commercialName: product.productTitle, modelType: product.productCode }, { templateRevision: '01' }, product, png);
    } finally { PDFPage.prototype.drawImage = drawImage; PDFPage.prototype.drawLine = drawLine; }
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 2);
    const signature = images.at(-1), line = lines.at(-1);
    assert.equal(signature.page, 2); assert.equal(line.page, 2);
    assert.ok(signature.y > line.start.y && signature.y + signature.height <= line.start.y + 42);
    assert.ok(signature.width <= 140 && signature.height <= 38);
    if (process.env.EU_DOC_TEST_OUTPUT) {
      fs.mkdirSync(process.env.EU_DOC_TEST_OUTPUT, { recursive: true });
      fs.writeFileSync(path.join(process.env.EU_DOC_TEST_OUTPUT, `signature-${name}.pdf`), bytes);
    }
  });
  await check('long identifiers wrap, page-one CE clears footer, tests stay unsigned', async () => {
    const text = [], images = [];
    const drawText = PDFPage.prototype.drawText, drawImage = PDFPage.prototype.drawImage;
    PDFPage.prototype.drawText = function(value, opts) { text.push({ page: this, value, ...opts }); return drawText.call(this, value, opts); };
    PDFPage.prototype.drawImage = function(value, opts) { images.push({ page: this, ...opts }); return drawImage.call(this, value, opts); };
    let bytes;
    try {
      bytes = await builder.buildEuDeclarationOfConformityPdf('eu-doc-serialised', {
        ...unit, declarationNumber: 'TEST-ACL-DoC-2026-BP200L-DECLARATION-00161',
        commercialName: 'Applied Aquablaster Xtreme 100 Blasting Machine',
      }, { templateRevision: '01' }, variants[1][2], png, { isTest: true });
    } finally { PDFPage.prototype.drawText = drawText; PDFPage.prototype.drawImage = drawImage; }
    const finalPages = text.at(-1).page.doc.getPages();
    const onPageOne = text.filter(item => item.page === finalPages[0]);
    const declaration = onPageOne.filter(item => item.font && item.size === 9 && item.y > 600);
    assert.ok(declaration.length >= 4, 'declaration occupies multiple lines');
    for (const item of declaration) {
      if (item.x < 230) assert.ok(item.x + item.font.widthOfTextAtSize(item.value, item.size) < 231, 'inside first cell');
    }
    assert.ok(onPageOne.find(item => item.value === '2810').y > 66, 'CE number above footer clearance');
    assert.equal(text.filter(item => finalPages.includes(item.page) && item.value === 'TEST / NOT FOR ISSUE - UNSIGNED').length, 2);
    assert.equal(images.filter(item => item.page === finalPages[1]).length, 1, 'page two contains company logo only, no signature');
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 2);
    if (process.env.EU_DOC_TEST_OUTPUT) fs.writeFileSync(path.join(process.env.EU_DOC_TEST_OUTPUT, 'unsigned-long-serialised.pdf'), bytes);
  });
  await check('excessive content fails instead of overlapping footer', async () => {
    await assert.rejects(builder.buildEuDeclarationOfConformityPdf('eu-doc-serialised', { ...unit, commercialName: 'very long name '.repeat(100) }, { templateRevision: '01' }, variants[1][2]), /too long to fit/);
  });
  console.log(`\n${passed} checks passed. Database and storage were mocked; no live writes.`);
  if (process.env.EU_DOC_TEST_OUTPUT) fs.writeFileSync(path.join(process.env.EU_DOC_TEST_OUTPUT, 'signature-test-only.png'), png);
}

run().catch(error => { console.error(error); process.exitCode = 1; });
