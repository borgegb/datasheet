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
const model = load("lib/kanban/import-test.ts");
const payload = { batchId: "d3d28304-38c1-4b7d-93e1-b89bfbaf453d", rows: [{
  part_no: "SP100131", description: "Fitting", location: "UA01/R05-C06",
  preferred_supplier: "Supplier", order_quantity: "", lead_time: "", header_color: "orange",
}] };
const saved = [];
const uploaded = [];
let writes = 0, uploads = 0, authenticated = true, organization = "org1", role = "owner", readFailure = false;
const client = {
  auth: { getUser: async () => ({ data: { user: authenticated ? { id: "user1" } : null } }) },
  storage: { from: () => ({ upload: async (path, bytes, options) => { uploads++; uploaded.push({ path, bytes, options }); return {}; } }) },
  from(table) {
    if (table === "profiles") return { select() { return this; }, eq() { return this; }, single: async () => ({ data: { organization_id: organization, role } }) };
    assert.equal(table, "kanban_cards");
    return {
      select() { return this; },
      eq(key, value) { assert.equal(key, "organization_id"); assert.equal(value, organization); return this; },
      in: async (key, ids) => ({ data: saved.filter(row => ids.includes(row.id) && row.organization_id === organization), error: readFailure ? { message: "offline" } : null }),
      insert: async rows => { writes++; saved.push(...rows); return {}; },
    };
  },
};
const api = load("app/api/kanban-import-test/route.ts", {
  "@/lib/supabase/server": { createClient: async () => client },
  "next/cache": { revalidatePath() {} },
});
function request(data = payload, origin = "https://preview.example") {
  const form = new FormData();
  form.set("payload", JSON.stringify(data));
  return new Request("https://preview.example/api/kanban-import-test", { method: "POST", headers: { origin }, body: form });
}
async function main() {
  process.env.NODE_ENV = "production";
  process.env.VERCEL_ENV = "production";
  assert.equal((await api.POST(request())).status, 403);
  process.env.VERCEL_ENV = "preview";
  assert.equal((await api.POST(request(payload, "https://other.example"))).status, 403);
  authenticated = false;
  assert.equal((await api.POST(request())).status, 401);
  authenticated = true;
  organization = null;
  assert.equal((await api.POST(request())).status, 403);
  organization = "org1";
  role = "viewer";
  assert.equal((await api.POST(request())).status, 403);
  role = "owner";
  assert.equal((await api.POST(request({ ...payload, rows: [] }))).status, 400);
  assert.equal((await api.POST(request({ ...payload, rows: Array(4).fill(payload.rows[0]) }))).status, 400);
  assert.equal((await api.POST(request({ ...payload, rows: [{ ...payload.rows[0], targetId: "existing" }] }))).status, 400);
  for (const quantity of ["-1", "2.5", "2147483648", "1e2"]) {
    assert.equal((await api.POST(request({ ...payload, rows: [{ ...payload.rows[0], order_quantity: quantity }] }))).status, 400);
  }
  assert.equal(writes, 0);
  readFailure = true;
  assert.equal((await api.POST(request())).status, 500);
  assert.equal(writes, 0);
  readFailure = false;
  assert.equal((await api.POST(request())).status, 200);
  assert.equal(writes, 1);
  assert.equal(saved[0].order_quantity, null);
  assert.equal(saved[0].product_id, null);
  assert.match(saved[0].part_no, /^TEST-IMPORT-/);
  assert.match(saved[0].description, /^\[TEST COPY of SP100131\]/);
  assert.match(saved[0].location, /^TEST \/ /);
  const retry = await api.POST(request());
  assert.equal((await retry.json()).reused, true);
  assert.equal(writes, 1);
  assert.equal(uploads, 0);
  assert.equal((await api.POST(request({ ...payload, rows: [{ ...payload.rows[0], description: "Changed" }] }))).status, 409);
  assert.equal(writes, 1);
  organization = "org2";
  assert.equal((await api.POST(request())).status, 200);
  assert.notEqual(saved[0].id, saved[1].id);
  assert.notEqual(model.testCardId("org1", "user1", payload.batchId, 0), model.testCardId("org1", "user2", payload.batchId, 0));
  const sharp = require("sharp");
  const webp = await sharp({ create: { width: 2, height: 2, channels: 3, background: "orange" } }).webp().toBuffer();
  const imagePayload = { ...payload, batchId: "d3d28304-38c1-4b7d-93e1-b89bfbaf453e" };
  const imageRequest = () => {
    const form = new FormData();
    form.set("payload", JSON.stringify(imagePayload));
    form.set("image0", new Blob([webp], { type: "image/webp" }), "part.webp");
    return new Request("https://preview.example/api/kanban-import-test", { method: "POST", headers: { origin: "https://preview.example" }, body: form });
  };
  assert.equal((await api.POST(imageRequest())).status, 200);
  assert.equal(uploads, 1);
  assert.equal(uploaded[0].options.contentType, "image/png");
  assert.equal(uploaded[0].options.upsert, false);
  assert.equal((await sharp(uploaded[0].bytes).metadata()).format, "png");
  assert.ok(uploaded[0].path.startsWith("org2/kanban/test-imports/user1/"));
  assert.equal(saved[2].image_path, uploaded[0].path);
  assert.equal((await api.POST(imageRequest())).status, 200);
  assert.equal(uploads, 1);
  assert.equal(saved.length, 3);
  console.log("PASS WebP images are stored as PDF-compatible PNGs; retries do not re-upload or duplicate cards.");
  console.log("PASS test imports enforce preview, origin, auth, org, limits, quantities, labels, isolation and retry idempotency; no updates or product writes.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
