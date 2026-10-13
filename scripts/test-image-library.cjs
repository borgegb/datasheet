const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(file, stubs = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => {
    if (name in stubs) return stubs[name];
    return require(name);
  }, module, module.exports);
  return module.exports;
}
const { scanStorageImages, mergeUnlinkedImages, createLibraryImageLoader } = load('lib/image-library/storage.ts');
const org = 'test-org';
const root = `${org}/kanban/images`;
const file = (name) => ({ name, id: name, metadata: { mimetype: 'image/png', size: 5 }, created_at: '2026-01-01' });
const item = (path, source = 'products') => ({ id: path, path, source, organizationId: org });
let checks = 0;
async function check(name, run) { await run(); console.log(`PASS ${name}`); checks++; }

async function main() {
  await check('page data never waits for Storage, includes every linked source and signatures', async () => {
    const rows = {
      products: [{ id: 'p', image_path: 'product.png', created_at: '2026-01-01' }],
      kanban_cards: [{ id: 'k', image_path: 'kanban.png', signature_path: 'signature.png', created_at: '2026-01-02' }],
      production_kanban_cards: [{ id: 'pk', image_path: 'production.png', created_at: '2026-01-03' }],
      catalogs: [{ id: 'c', image_path: 'catalog.png', created_at: '2026-01-04' }],
    };
    const client = {
      storage: { from() { throw new Error('Page must not query Storage'); } },
      from(table) { return { select() { return this; }, eq(column, value) { assert.equal(column, 'organization_id'); assert.equal(value, org); return this; }, not() { return this; }, then(resolve) { resolve({ data: rows[table], error: null }); } }; },
    };
    const { fetchImageLibraryDataForOrganization } = load('app/dashboard/image-library/library-data.ts', {
      'server-only': {}, '@/lib/supabase/server': { createClient: async () => client },
    });
    const result = await fetchImageLibraryDataForOrganization(org);
    assert.equal(result.error, undefined); assert.equal(result.organizationId, org);
    assert.equal(result.totalCount, 5); assert.equal(result.images[0].path, 'catalog.png');
  });
  await check('Storage pages beyond 1000 entries, traverses folders, skips non-images, bounds concurrency', async () => {
    const entries = Array.from({ length: 1005 }, (_, i) => file(`${String(i).padStart(4, '0')}.png`));
    entries.push({ name: 'folder.png', id: null }, { name: 'notes.txt', id: 'notes', metadata: {} });
    const calls = [], images = []; let active = 0, maximum = 0;
    const client = { storage: { from(bucket) {
      assert.equal(bucket, 'datasheet-assets');
      return { async list(prefix, options) {
        calls.push({ prefix, ...options }); maximum = Math.max(maximum, ++active);
        await new Promise(resolve => setImmediate(resolve)); active--;
        const source = prefix === root ? entries : prefix === `${root}/folder.png` ? [file('nested.png')] : [];
        return { data: source.slice(options.offset, options.offset + options.limit), error: null };
      } };
    } } };
    await scanStorageImages(client, org, batch => images.push(...batch), new AbortController().signal);
    assert.equal(images.length, 1006); assert.equal(new Set(images.map(i => i.path)).size, 1006);
    assert.ok(calls.some(call => call.offset === 1000)); assert.ok(maximum <= 4);
    assert.ok(calls.every(call => call.limit === 100 && call.sortBy.column === 'name'));
    assert.ok(images.some(image => image.path === `${root}/folder.png/nested.png`));
  });
  await check('cancelled scans do not publish stale images or continue traversing', async () => {
    const controller = new AbortController(); let batches = 0;
    const client = { storage: { from: () => ({ list: async () => { controller.abort(); return { data: [file('one.png')], error: null }; } }) } };
    await assert.rejects(scanStorageImages(client, org, () => batches++, controller.signal), { name: 'AbortError' });
    assert.equal(batches, 0);
  });
  await check('Storage errors reach the retry UI instead of reporting an empty library', async () => {
    const client = { storage: { from: () => ({ list: async () => ({ data: null, error: { message: 'offline' } }) }) } };
    await assert.rejects(scanStorageImages(client, org, () => {}, new AbortController().signal), /could not be loaded/);
  });
  await check('linked paths and duplicate storage results are not shown as unlinked', async () => {
    const linked = [item('same.png'), item('signature.png', 'kanban_cards')];
    const stored = [item('same.png', 'storage_unlinked'), item('signature.png', 'storage_unlinked'), item('new.png', 'storage_unlinked'), item('new.png', 'storage_unlinked')];
    const result = mergeUnlinkedImages(linked, stored);
    assert.deepEqual(result.map(i => i.path), ['same.png', 'signature.png', 'new.png']);
    assert.equal(result[0].source, 'products');
  });
  await check('thumbnail requests are deduplicated and full-size preview is cached separately', async () => {
    const calls = [];
    const client = { storage: { from: () => ({ createSignedUrl: async (...args) => { calls.push(args); return { data: { signedUrl: `https://example.test/${calls.length}` }, error: null }; } }) } };
    const loader = createLibraryImageLoader(client), image = item(`${org}/images/one.png`);
    const urls = await Promise.all([loader(image), loader(image), loader(image)]);
    assert.equal(calls.length, 1); assert.equal(new Set(urls).size, 1);
    assert.equal(await loader(image), urls[0]);
    await loader(image, true); assert.equal(calls.length, 2); assert.equal(calls[1][2], undefined);
  });
  await check('large image grids never sign more than four images concurrently', async () => {
    let active = 0, maximum = 0;
    const loader = createLibraryImageLoader({ storage: { from: () => ({ createSignedUrl: async path => {
      maximum = Math.max(maximum, ++active);
      await new Promise(resolve => setImmediate(resolve)); active--;
      return { data: { signedUrl: `https://example.test/${path}` } };
    } }) } });
    const urls = await Promise.all(Array.from({ length: 50 }, (_, i) => loader(item(`${i}.png`))));
    assert.equal(urls.filter(Boolean).length, 50); assert.equal(maximum, 4); assert.equal(active, 0);
  });
  await check('legacy product paths fall back without listing the entire bucket', async () => {
    const calls = [];
    const client = { storage: { from: () => ({ createSignedUrl: async path => { calls.push(path); return path.startsWith(org) ? { data: { signedUrl: 'found' }, error: null } : { data: null, error: { message: 'not found' } }; } }) } };
    const loader = createLibraryImageLoader(client);
    assert.equal(await loader(item('old-user/images/photo.png')), 'found');
    assert.deepEqual(calls, ['old-user/images/photo.png', `${org}/images/photo.png`]);
  });
  await check('failed thumbnail requests release pending entries and can be retried', async () => {
    let fail = true;
    const loader = createLibraryImageLoader({ storage: { from: () => ({ createSignedUrl: async () => { if (fail) throw new Error('offline'); return { data: { signedUrl: 'recovered' } }; } }) } });
    assert.equal(await loader(item('one.png')), null); fail = false;
    assert.equal(await loader(item('one.png')), 'recovered');
  });
  console.log(`\n${checks} image-library checks passed.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
