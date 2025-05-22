# Supabase ➜ Vercel PDF Generation – **Step‑by‑Step Guide**

> **Date:** 22 May 2025  ・  **Author:** (your name)

---

## 🧐  Why are we doing this?

1. **Symptom** – When users request print‑quality PDFs (> 4 MB) the Supabase Edge Function sometimes crashes or silently drops the connection; no file is delivered.
2. **Root causes**

   * 256 MB memory cap and ≈ 2 CPU‑seconds quota per Edge Function invocation.
   * Cloudflare‑style limits: max 4 MB inbound body, ≈ 32 MB outbound body.
   * User JWT can already be expired when the function call starts (secondary issue, to be fixed later).
3. **Solution in one sentence** – Render the PDF inside a **Vercel Serverless Function** (Node runtime, up to 3 GB RAM / 5 min) and immediately upload the finished file back into the existing **`documents`** bucket in Supabase Storage; return a signed URL to the client so the file is served via Supabase’s CDN, not through Vercel.

---

## 📋  Prerequisites

* A **Vercel Pro** project (needed to set `memory=3009` MB and `maxDuration=300` s).
* Your existing **Supabase project** with the `documents` Storage bucket.
* **Node 18+** and npm/pnpm for local dev.
* The Supabase **service‑role key** available as an env var.

Add these environment variables in Vercel → *Project → Settings → Environment Variables*:

```bash
SUPABASE_URL=https://<project-id>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role>
```

---

## 🛠️  Step 1 – Scaffold the API route on Vercel

```bash
mkdir -p app/api/generate-pdf
code       app/api/generate-pdf/route.ts
```

Paste the boiler‑plate below (adjust bucket/region as needed):

```ts
// /api/generate-pdf   (Next.js 14 route)
export const runtime     = 'nodejs';  // full Node env
export const memory      = 3009;      // MB – Pro max
export const maxDuration = 300;       // seconds

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  /* 1️⃣  Parse payload; fetch DB rows & images here */

  // 2️⃣  Generate the PDF (Buffer or stream)
  const pdf = await buildPdf(/* data, images */);

  /* 3️⃣  Upload to Supabase Storage */
  const path = `pdfs/${crypto.randomUUID()}.pdf`;
  const { error } = await supabase
    .storage.from('documents')
    .upload(path, pdf, {
      contentType: 'application/pdf',
      upsert: false,
    });
  if (error) return new Response(JSON.stringify({ error }), { status: 500 });

  /* 4️⃣  Return a 15‑min signed URL */
  const { data } = await supabase
    .storage.from('documents')
    .createSignedUrl(path, 900);

  return Response.json({ url: data?.signedUrl });
}
```

> **Tip •** Libraries like `pdfkit`, `pdf-lib`, or `@react-pdf/renderer` can stream output so you never hold the whole PDF in RAM.

---

## 📦  Step 2 – Implement `buildPdf()` with **pdfme**

The existing Edge Function already uses **pdfme** (`@pdfme/generator`) plus custom plugins. We’ll keep that exact stack—just move it to Node land.

### 2‑A  Add the dependency (npm)

```bash
npm install @pdfme/generator @pdfme/common @pdfme/schemas pdf-lib
```

*(If you use pnpm or Yarn, swap in `pnpm add …` or `yarn add …` respectively.)*

### 2‑B  Port your helper code  Port your helper code

Create `lib/pdf/buildPdf.ts` with:

```ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { generate } from '@pdfme/generator';
import { text, image, line, table, rectangle } from '@pdfme/schemas';
import type { Template, Font } from '@pdfme/common';

// 🖼️  bring over your hex→rgb, mm→pt, iconTextList plugin exactly as in the Deno file
import { hexToRgb, mm2pt, iconTextList } from './helpers';

export async function buildPdf(input: {
  productId: string;
  /* any other fields you pass from the route */
}) {
  // 1. Load template JSON and fonts from the filesystem (relative to project root)
  const templatePath = path.resolve(process.cwd(), 'pdf/template/datasheet-template.json');
  const fontDir      = path.resolve(process.cwd(), 'pdf/fonts');

  const template: Template = JSON.parse(await fs.readFile(templatePath, 'utf8'));
  const fonts: Font = {
    'Poppins-Bold':   { data: await fs.readFile(path.join(fontDir, 'Poppins-Bold.ttf')),   subset: true },
    'Inter-Regular':  { data: await fs.readFile(path.join(fontDir, 'Inter-Regular.ttf')),  subset: true, fallback: true },
    'Inter-Bold':     { data: await fs.readFile(path.join(fontDir, 'Inter-Bold.ttf')),     subset: true },
  };

  // 2. Fetch DB row + images exactly like the old admin client did (inside the route)
  //    → pass them in via the function args so buildPdf stays pure

  const inputs = [/* build the same pdfInputs array as before */];

  // 3. Generate the PDF – identical call signature
  const pdfBytes = await generate({
    template,
    inputs,
    options: { font: fonts },
    plugins: { text, image, line, Table: table, rectangle, iconTextList },
  });

  return Buffer.from(pdfBytes); // Vercel upload expects Buffer | Uint8Array
}
```

*Everything inside the plugin remains untouched—pdfme works the same under Node.*

### 2‑C  Keep memory usage low

* Stream any **5 MB** product image through `sharp` or `@pdfme/image-utils` to down‑scale if necessary.
* Do **not** keep multiple PDFs in memory; generate, upload, discard.

Now `buildPdf()` returns a Node `Buffer`, which the route uploads to Supabase Storage.

---

## 🔑  Step 3 – Swap the client call

Below is the **one‑liner** you already use inside `DatasheetGeneratorForm.tsx` (Edge Function version) and the **new** call you’ll use after the migration.

```ts
// OLD — calls Supabase Edge Function (Deno runtime)
const { data: generateData, error: generateError } =
  await supabase.functions.invoke("generate-datasheet", {
    body: { productId: savedProductId, userId: user.id },
  });
```

```ts
// NEW — calls the Vercel route you just created
const res = await fetch("/api/generate-pdf", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ productId: savedProductId }),
});
const { url, error } = await res.json();
if (error) throw new Error(error);
window.open(url, "_blank");
```

**Key points**

1. **Same payload** – the Vercel route accepts the same `{ productId }` (and whatever else you need).
2. **No `supabase.functions.invoke`** – the PDF job now lives in your Next.js API layer, so a regular `fetch` (or `axios`) call is enough.
3. **Signed URL returned** – the handler already returns `{ url }`; you no longer need to call `storage.createSignedUrl()` on the client.

Replace the old block in `generateAndOpenPdf()` with the new one, delete the extra signed‑URL step, and the rest of the toast logic can stay the same.

---

## 🧪  Step 4 – Test locally

1. `vercel dev`
2. POST sample payload to [http://localhost:3000/api/generate-pdf](http://localhost:3000/api/generate-pdf)
3. Verify:

   * HTTP 200 with `{ url }` JSON.
   * PDF appears in **documents** bucket.
   * Download succeeds and file size is > 4.5 MB (proves we bypass Vercel limit).

---

## ☁️  Step 5 – Deploy to Vercel Pro

```bash
vercel --prod
```

Ensure the project is on **Pro** before relying on > 1024 MB memory.

---

## 📈  Step 6 – Monitor and optimise

* Check *Vercel → Functions → Logs* for memory/duration graphs.
* Wrap `buildPdf()` with `console.time()` to spot regressions.
* Alert when ≥ 5 % of `/api/generate-pdf` requests return 5XX.

---

## 🏷️  Step 7 – Decommission the old Edge Function

1. Remove any client code calling the Supabase Edge Function.
2. Delete the function from Supabase Dashboard.
3. Reclaim duplicate Storage assets created during migration tests.

---

## 💰  Cost & Quotas Cheat‑Sheet (summary)

* **Vercel Pro** – 1 M invocations & 1 000 GB‑hours compute per month included.
* **Supabase Storage egress** – first 250 GB/month free; at 20 MB per PDF that’s \~12 000 downloads.
* **Supabase object size** – 5 GB per simple upload, 50 GB via resumable endpoint.

---

## 🧰  Troubleshooting Quick‑Hits

* **Out‑of‑memory crash in Vercel** → raise `export const memory` or stream images/PDF data.
* **413 “Entity Too Large”** → you accidentally returned the PDF in the HTTP response; make sure you upload to Storage instead.
* **400 `invalid_jwt` before PDF starts** → the client sent an expired token; refresh session *before* calling the endpoint.

---

🏁 **Done!** Your PDF generation now enjoys GB‑level RAM, 5‑minute ceilings, and the same Storage bucket—without ever hitting Vercel’s 4.5 MB response limit.
