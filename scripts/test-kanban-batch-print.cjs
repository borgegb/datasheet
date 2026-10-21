const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');
const { PDFDocument, decodePDFRawStream } = require('pdf-lib');

const root = path.resolve(__dirname, '..');
function load(file, stubs = {}, cache = new Map()) {
  const filename = path.resolve(root, file);
  if (cache.has(filename)) return cache.get(filename);
  const nativeRequire = createRequire(filename);
  const mod = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  function localRequire(name) {
    if (name in stubs) return stubs[name];
    if (name.startsWith('@/') || name.startsWith('.')) {
      const resolved = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(filename), name);
      if (resolved.endsWith('.json')) return nativeRequire(resolved);
      if (fs.existsSync(`${resolved}.ts`)) return load(`${resolved}.ts`, stubs, cache);
    }
    return nativeRequire(name);
  }
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename })(localRequire, mod, mod.exports);
  cache.set(filename, mod.exports);
  return mod.exports;
}

const id = (n) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const cards = ['red', 'blue', 'purple'].map((header_color, i) => ({
  id: id(i + 1), organization_id: 'org-a', part_no: `TEST-${header_color.toUpperCase()}`,
  description: `Batch print sample ${i + 1}`, location: `A-${i + 1}`, order_quantity: i + 1,
  preferred_supplier: 'Test Supplier', lead_time: '2 days', header_color,
}));
const layoutModule = load('lib/pdf/kanban/fitKanbanTemplate.ts');

async function probe(payload, options = {}) {
  const calls = { filters: [], rendered: [], writes: 0 };
  const client = {
    auth: { getUser: async () => ({ data: { user: options.anonymous ? null : { id: 'user' } } }) },
    from(table) {
      const query = {
        select() { return this; },
        eq(field, value) { calls.filters.push([table, field, value]); return this; },
        single: async () => ({ data: options.noOrg ? null : { organization_id: 'org-a' } }),
        in: async () => ({ data: options.missing ? cards.slice(0, 1) : [...(options.cards ?? cards)].reverse(), error: null }),
      };
      return query;
    },
    storage: { from() { calls.writes++; throw new Error('Batch printing must not write PDFs'); } },
  };
  const stubs = {
    '@/lib/pdf/kanban/fitKanbanTemplate': layoutModule,
    '@/lib/supabase/server': { createClient: async () => client },
    '@supabase/supabase-js': { createClient: () => client },
    '@/lib/pdf/kanban/buildKanbanBatchPdf': { buildKanbanBatchPdf: async (selected) => {
      calls.rendered.push(...selected.map(c => c.id));
      if (options.layoutError) throw new layoutModule.KanbanPdfLayoutError(selected[0].part_no);
      if (options.renderError) throw new Error('render failed');
      return new TextEncoder().encode('%PDF-test');
    } },
  };
  const { POST } = load('app/api/print-kanban-pdfs/route.ts', stubs);
  const response = await POST(new Request('http://localhost/api/print-kanban-pdfs', {
    method: 'POST', body: options.raw ?? JSON.stringify(payload),
  }));
  return { response, calls };
}

let passed = 0;
async function check(name, run) { await run(); passed++; console.log(`PASS ${name}`); }

async function main() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
  for (const payload of [null, {}, { kanbanCardIds: [] }, { kanbanCardIds: [42] },
    { kanbanCardIds: ['not-a-uuid'] }, { kanbanCardIds: [id(1), null] },
    { kanbanCardIds: Array.from({ length: 101 }, (_, n) => id(n)) }]) {
    await check(`rejects invalid selection ${JSON.stringify(payload).slice(0, 65)}`, async () => {
      const { response, calls } = await probe(payload);
      assert.equal(response.status, 400);
      assert.equal(calls.rendered.length, 0);
    });
  }
  await check('malformed JSON returns 400', async () => assert.equal((await probe(null, { raw: '{' })).response.status, 400));
  for (const [options, status] of [[{ anonymous: true }, 401], [{ noOrg: true }, 403], [{ missing: true }, 404]]) {
    await check(`access failure returns ${status} without rendering`, async () => {
      const { response, calls } = await probe({ kanbanCardIds: [id(1), id(2)] }, options);
      assert.equal(response.status, status);
      assert.equal(calls.rendered.length, 0);
    });
  }
  await check('scopes query to organization, deduplicates and restores selection order', async () => {
    const { response, calls } = await probe({ kanbanCardIds: [id(2), id(1), id(2), id(3)] });
    assert.equal(response.status, 200);
    assert.deepEqual(calls.rendered, [id(2), id(1), id(3)]);
    assert.ok(calls.filters.some(f => f.join(':') === 'kanban_cards:organization_id:org-a'));
    assert.equal(calls.writes, 0);
    assert.equal(response.headers.get('Content-Type'), 'application/pdf');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.match(response.headers.get('Content-Disposition'), /^inline;.*\.pdf"$/);
  });
  await check('generation failure returns an error, not a partial PDF', async () => {
    const original = console.error;
    console.error = () => {};
    try { assert.equal((await probe({ kanbanCardIds: [id(1)] }, { renderError: true })).response.status, 500); }
    finally { console.error = original; }
  });
  await check('oversized card returns an actionable 422, not a partial print batch', async () => {
    const { response, calls } = await probe({ kanbanCardIds: [id(1)] }, { layoutError: true });
    assert.equal(response.status, 422);
    assert.match((await response.json()).error, /Shorten.*description/);
    assert.equal(calls.writes, 0);
  });
  await check('accepts the maximum 100-card selection in order', async () => {
    const batch = Array.from({ length: 100 }, (_, n) => ({ ...cards[n % 3], id: id(n + 1) }));
    const ids = batch.map(card => card.id);
    const { response, calls } = await probe({ kanbanCardIds: ids }, { cards: batch });
    assert.equal(response.status, 200);
    assert.deepEqual(calls.rendered, ids);
  });

  const { buildKanbanBatchPdf } = load('lib/pdf/kanban/buildKanbanBatchPdf.ts');
  const { buildKanbanPdf } = load('lib/pdf/kanban/buildKanbanPdf.ts');
  let bytes;
  await check('real mixed-colour PDFs preserve every page, size and drawing stream in order', async () => {
    const original = console.log;
    console.log = () => {};
    try {
      bytes = await buildKanbanBatchPdf(cards);
      const combined = await PDFDocument.load(bytes);
      const streams = (page) => page.node.Contents().asArray().map(ref =>
        Buffer.from(decodePDFRawStream(page.doc.context.lookup(ref)).decode()).toString('base64'));
      assert.equal(combined.getPageCount(), cards.length);
      for (let i = 0; i < cards.length; i++) {
        const single = await PDFDocument.load(await buildKanbanPdf([cards[i]]));
        assert.deepEqual(combined.getPage(i).getSize(), single.getPage(0).getSize());
        assert.deepEqual(streams(combined.getPage(i)), streams(single.getPage(0)));
      }
    } finally { console.log = original; }
  });
  await check('single-card batches produce one page', async () => {
    const original = console.log;
    console.log = () => {};
    try { assert.equal((await PDFDocument.load(await buildKanbanBatchPdf([cards[0]]))).getPageCount(), 1); }
    finally { console.log = original; }
  });
  const samples = [
    ['SP000329', '1" BSP Combined Moisture Separator/Pressure Regulator', 'UA02/R01-C01', 'Ningbo Xinchao Automatization Component Co Ltd'],
    ['SP000330', '1/2" BSP Combined Moisture Separator/Pressure Regulator', 'UA02/R01-C02', 'Ningbo Xinchao Automatization Component Co Ltd'],
    ['BP-A-0003', 'Applied Wheel Assist Kit', 'UA02/R01-C03', ''],
  ];
  const renderSamples = [];
  for (const labelled of [false, true]) {
    await check(`three imported cards each fit A6 with complete fields (${labelled ? 'test labels' : 'original values'})`, async () => {
      const original = console.log;
      console.log = () => {};
      try {
        for (const [i, [part, description, location, supplier]] of samples.entries()) {
          const card = { ...cards[0], id: id(i + 10), header_color: 'orange', order_quantity: null, lead_time: '',
            part_no: labelled ? `TEST-IMPORT-96D92942-${i + 1}` : part,
            description: labelled ? `[TEST COPY of ${part}] ${description}` : description,
            location: labelled ? `TEST / ${location}` : location, preferred_supplier: supplier };
          const rendered = await buildKanbanPdf([card]);
          const doc = await PDFDocument.load(rendered);
          assert.equal(doc.getPageCount(), 1);
          const {width, height} = doc.getPage(0).getSize();
          assert.ok(Math.abs(width - 105 * 72 / 25.4) < 0.1);
          assert.ok(Math.abs(height - 148 * 72 / 25.4) < 0.1);
          renderSamples.push({ name: `${labelled ? 'labelled' : 'original'}-${i + 1}.pdf`, bytes: rendered });
        }
      } finally { console.log = original; }
    });
  }
  await check('long descriptions, supplier names and unbroken references fit without altering text', async () => {
    const { getDefaultFont } = require('@pdfme/common');
    const source = require('../pdf/template/kanban/template-orange.json');
    const before = JSON.stringify(source);
    const font = getDefaultFont(); font.Roboto.fallback = false;
    font['Inter-Regular'] = { data: fs.readFileSync(path.join(root, 'pdf/fonts/Inter-Regular.ttf')), subset: true, fallback: true };
    const rows = [['Part No:', 'SP-' + '1234567890'.repeat(6)],
      ['Description:', 'Stainless steel pressure regulator with adjustable mounting bracket, moisture separator and replaceable filter. '.repeat(3)],
      ['Location:', 'UA02/R01-C01'], ['Order Qty:', '250'],
      ['Preferred Supplier:', 'International Pneumatic and Hydraulic Components Manufacturing and Distribution Company Limited'],
      ['Lead Time:', '10–15 working days'], ['Signature:', '']];
    const beforeRows = JSON.stringify(rows);
    const fitted = await layoutModule.fitKanbanTemplate(source, rows, font, 'long-sample');
    const textCells = fitted.schemas[0].filter(s => s.name.startsWith('cell-text-'));
    assert.deepEqual(textCells.map(s => s.content), rows.flat());
    for (const schema of fitted.schemas[0]) assert.ok(schema.position.y + schema.height <= 146);
    for (const cell of textCells) assert.ok(cell.fontSize >= 9);
    assert.equal(JSON.stringify(rows), beforeRows);
    assert.equal(JSON.stringify(source), before);
    await assert.rejects(() => layoutModule.fitKanbanTemplate(source, [['Description:', 'Very long text '.repeat(1000)]], font, 'TOO-LONG'),
      error => error instanceof layoutModule.KanbanPdfLayoutError && error.message.includes('TOO-LONG'));
    const original = console.log; console.log = () => {};
    try {
      const longCard = {...cards[0], part_no: rows[0][1], description: rows[1][1], preferred_supplier: rows[4][1], lead_time: rows[5][1]};
      const rendered = await buildKanbanPdf([longCard, cards[1]]);
      assert.equal((await PDFDocument.load(rendered)).getPageCount(), 2);
      renderSamples.push({name: 'long-and-short.pdf', bytes: rendered});
    } finally { console.log = original; }
  });
  if (process.env.KANBAN_PRINT_TEST_OUTPUT) {
    fs.mkdirSync(process.env.KANBAN_PRINT_TEST_OUTPUT, { recursive: true });
    fs.writeFileSync(path.join(process.env.KANBAN_PRINT_TEST_OUTPUT, 'mixed-colours.pdf'), bytes);
    for (const sample of renderSamples) fs.writeFileSync(path.join(process.env.KANBAN_PRINT_TEST_OUTPUT, sample.name), sample.bytes);
  }
  console.log(`\n${passed} batch print checks passed. No live database or storage writes.`);
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { load, cards };
