const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
function load(file, stubs = {}) {
  const filename = path.resolve(root, file);
  const req = createRequire(filename);
  const mod = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const local = (name) => {
    if (name in stubs) return stubs[name];
    if (name.startsWith(".") || name.startsWith("@/"))
      return load(
        (name.startsWith("@/")
          ? path.join(root, name.slice(2))
          : path.resolve(path.dirname(filename), name)) + ".ts",
        stubs,
      );
    return req(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, {
    filename,
  })(local, mod, mod.exports);
  return mod.exports;
}
const model = load("lib/kanban/import-model.ts");
const row = (overrides = {}) => ({
  id: "r1",
  sourceRow: 2,
  part_no: "SP100131",
  description: "Fitting",
  location: "UA01/R05-C06",
  preferred_supplier: "",
  order_quantity: "",
  lead_time: "",
  header_color: "orange",
  decision: "create",
  ...overrides,
});
const card = {
  id: "card1",
  part_no: "SP100131",
  location: "UA01-05-06",
  header_color: "orange",
  description: "Fitting",
  preferred_supplier: null,
  order_quantity: 20,
  lead_time: "2 weeks",
};
const index = model.buildMatchIndex({
  cards: [card],
  products: [{ id: "p1", product_code: "SP100149", product_title: "Valve" }],
});
let count = 0;
async function check(name, fn) {
  await fn();
  count++;
  console.log("PASS", name);
}
async function main() {
  await check(
    "matches normalised part codes and the known UA location formats",
    () => {
      const matches = model.getMatches(
        row({
          part_no: " sp100131 ",
          location: "Main/Stock/BRStock/UA01/R05-C06",
        }),
        index,
      );
      assert.equal(matches.cards.length, 1);
      assert.equal(matches.sameLocation.length, 1);
      assert.notEqual(
        model.normalizeLocation("FR01/FR02"),
        model.normalizeLocation("FR01-FR02"),
      );
    },
  );
  await check(
    "existing cards skip by default; catalogue-only matches create cards",
    () => {
      const result = model.applyDefaultDecisions(
        [row(), row({ part_no: "SP100149" }), row({ part_no: "NEW" })],
        index,
      );
      assert.deepEqual(
        result.map((r) => r.decision),
        ["skip", "create", "create"],
      );
    },
  );
  await check(
    "duplicates within a batch block only included identical card identities",
    () => {
      const result = model.assessBatch(
        [row(), row({ id: "r2", location: "Main/Stock/BRStock/UA01/R05-C06" })],
        index,
      );
      assert.ok(
        result.every((r) => r.errors.some((e) => e.includes("Repeated"))),
      );
      assert.ok(
        model
          .assessBatch([row(), row({ id: "r2", decision: "skip" })], index)
          .every((r) => !r.errors.some((e) => e.includes("Repeated"))),
      );
      assert.ok(
        model
          .assessBatch([row(), row({ id: "r2", header_color: "green" })], index)
          .every((r) => !r.errors.some((e) => e.includes("Repeated"))),
      );
    },
  );
  await check(
    "update requires a matching target and rejects multiple updates to one card",
    () => {
      assert.ok(
        model.assessBatch(
          [row({ decision: "update", targetId: "other" })],
          index,
        )[0].errors.length,
      );
      assert.equal(
        model.assessBatch(
          [row({ decision: "update", targetId: "card1" })],
          index,
        )[0].errors.length,
        0,
      );
      const result = model.assessBatch(
        [
          row({ decision: "update", targetId: "card1" }),
          row({
            id: "r2",
            location: "UA02/R01-C01",
            decision: "update",
            targetId: "card1",
          }),
        ],
        index,
      );
      assert.ok(
        result.every((r) => r.errors.some((e) => e.includes("More than one"))),
      );
    },
  );
  await check(
    "blank quantities stay blank, invalid quantities and colours block review",
    () => {
      assert.equal(model.rowIssues(row()).errors.length, 0);
      for (const value of ["-1", "1.5", "foo", "2147483648"])
        assert.ok(
          model.rowIssues(row({ order_quantity: value })).errors.length,
        );
      assert.equal(
        model.rowIssues(row({ order_quantity: "0" })).errors.length,
        0,
      );
      assert.ok(model.rowIssues(row({ header_color: "pink" })).errors.length);
    },
  );
  await check(
    "CSV preserves quoted descriptions, commas, newlines and escaped quotes",
    () => {
      const result = model.parseDelimited(
        '\uFEFFProduct,Location,Description\r\n0012,UA02,"A, B\nC ""quoted"""\r\n',
      );
      assert.deepEqual(result, [
        ["Product", "Location", "Description"],
        ["0012", "UA02", 'A, B\nC "quoted"'],
      ]);
      assert.throws(() => model.parseDelimited('a,"unterminated'));
      assert.deepEqual(model.parseDelimited("a\tb\r\nc\td", "\t"), [
        ["a", "b"],
        ["c", "d"],
      ]);
    },
  );
  await check(
    "spreadsheet mapping preserves source rows and rejects ambiguous headers",
    () => {
      const result = model.rowsFromCells([
        { sourceRow: 1, values: ["Product", "Location", "Description"] },
        {
          sourceRow: 5,
          values: ["0012", "Main/Stock/BRStock/UA02/R01-C01", "Test"],
        },
      ]);
      assert.equal(result[0].part_no, "0012");
      assert.equal(result[0].sourceRow, 5);
      assert.equal(result[0].location, "UA02/R01-C01");
      assert.equal(result[0].order_quantity, "");
      assert.throws(
        () =>
          model.rowsFromCells([
            { sourceRow: 1, values: ["Product", "SKU", "Location"] },
          ]),
        /same field/,
      );
      assert.throws(
        () => model.rowsFromCells([{ sourceRow: 1, values: ["Description"] }]),
        /first row/,
      );
    },
  );
  await check(
    "large batches fail explicitly instead of silently truncating",
    () => {
      assert.throws(
        () =>
          model.rowsFromCells([
            { sourceRow: 1, values: ["Product", "Location"] },
            ...Array.from({ length: 2001 }, (_, i) => ({
              sourceRow: i + 2,
              values: ["P" + i, "UA01"],
            })),
          ]),
        /2,000/,
      );
    },
  );
  const file = load("lib/kanban/import-file.ts");
  await check(
    "CSV export escapes formulas, quotes and embedded delimiters",
    () => {
      assert.equal(file.csvCell("=1+1"), '"\'=1+1"');
      assert.equal(file.csvCell('a,"b"'), '"a,""b"""');
    },
  );
  await check(
    "reference lookup is authenticated, organisation-scoped and paginated",
    async () => {
      const filters = [];
      let calls = 0;
      const client = {
        auth: { getUser: async () => ({ data: { user: { id: "user-a" } } }) },
        from(table) {
          return {
            select() {
              return this;
            },
            eq(key, value) {
              filters.push([table, key, value]);
              return this;
            },
            single: async () => ({ data: { organization_id: "org-a" } }),
            order() {
              return this;
            },
            range: async (start) => {
              calls++;
              return {
                data:
                  table === "kanban_cards" && start === 0
                    ? Array.from({ length: 1000 }, (_, i) => ({
                        ...card,
                        id: "c" + i,
                      }))
                    : table === "kanban_cards"
                      ? [card]
                      : [],
              };
            },
          };
        },
      };
      const api = load("app/dashboard/kanban/batch/reference.ts", {
        "@/lib/supabase/server": { createClient: async () => client },
      });
      const result = await api.getImportReference();
      assert.equal(result.data.cards.length, 1001);
      assert.equal(calls, 3);
      assert.ok(
        filters
          .filter((f) => f[0] !== "profiles")
          .every((f) => f[1] === "organization_id" && f[2] === "org-a"),
      );
      client.auth.getUser = async () => ({ data: { user: null } });
      assert.ok((await api.getImportReference()).error);
    },
  );
  await check(
    "reference query failure blocks the review rather than reporting no matches",
    async () => {
      const client = {
        auth: { getUser: async () => ({ data: { user: { id: "u" } } }) },
        from() {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            single: async () => ({ data: { organization_id: "org" } }),
            order() {
              return this;
            },
            range: async () => ({ data: null, error: { message: "offline" } }),
          };
        },
      };
      const api = load("app/dashboard/kanban/batch/reference.ts", {
        "@/lib/supabase/server": { createClient: async () => client },
      });
      assert.ok((await api.getImportReference()).error);
    },
  );
  console.log(`${count} import checks passed.`);
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
