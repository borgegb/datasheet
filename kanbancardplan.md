# PRD – **Kanban Card Generator**  
_version 1.1 · 2025-07-08_

Generates **A6 Kanban inventory cards** (not a task board).  
Supports: single-card create / edit / delete, batch generation from CSV/XLSX, PDF storage, and image handling.

---

## ☑️ Objectives
- [ ] Provide a dedicated Kanban-card workflow under `/dashboard/kanban`.
- [ ] Persist each card in its own table so a single product can own many cards (different locations, colours, suppliers, etc.).
- [ ] Allow batch creation from spreadsheet + image filenames.
- [ ] Let users view, edit, regenerate PDF, or delete any stored card.

---

## ☑️ Database

### Table `kanban_cards`
- `id uuid primary key default gen_random_uuid()`
- `organization_id uuid not null references public.organizations(id)`
- `product_id uuid references public.products(id)`  // nullable
- `part_no text not null`
- `description text`
- `location text not null`
- `order_quantity integer`
- `preferred_supplier text`
- `lead_time text`
- `header_color text check (header_color in ('red','orange','green'))`
- `image_path text`          // Supabase storage
- `signature_path text`      // optional
- `pdf_storage_path text`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

**Indexes**
- `organization_id`
- `product_id`
- optional unique `(product_id, location, header_color)`

**RLS**
- Copy “same-org” rule from `products` table.

---

## ☑️ Supabase Storage
- **Bucket** `datasheet-assets`
- Images  `orgId/kanban/images/{kanbanCardId}.{ext}`
- PDFs    `orgId/kanban/pdfs/{kanbanCardId}.pdf`
- Signed URLs valid 5 min (`createSignedUrl`).

---

## ☑️ Next.js File / Folder Structure

app
└─ dashboard
└─ kanban
├─ page.tsx // list + “New Card” CTA
├─ new
│ └─ page.tsx // single-card create form
├─ [id]
│ ├─ page.tsx // read-only view / PDF download
│ └─ edit
│ └─ page.tsx // edit existing card
├─ batch
│ └─ page.tsx // batch wizard
├─ actions.ts // Kanban-specific server actions
└─ components
├─ KanbanCardForm.tsx // used by new & edit pages
├─ KanbanBatchWizard.tsx // CSV/XLSX + image match flow
├─ ColorSelector.tsx
└─ CardPreview.tsx // optional thumbnail viewer

markdown
Kopier
Rediger

---

## ☑️ Server Actions `dashboard/kanban/actions.ts`
- `createKanbanCard(input)`      // insert → generate PDF → update `pdf_storage_path`
- `updateKanbanCard(id, input)`  // update → regenerate PDF if img/data changed
- `deleteKanbanCard(id)`
- `fetchKanbanById(id)`
- `listKanbanCards(orgId)`
- `batchGenerateKanban(rows[])`  // insert many → multi-page PDF

Follow patterns from existing `dashboard/actions.ts` (Supabase client, `revalidatePath`).

---

## ☑️ CSV/XLSX Batch Contract
Required columns: `part_no`, `location`, `image_name`  
Optional columns: `description`, `order_qty`, `preferred_supplier`, `lead_time`, `header_color`, `product_id`

Batch wizard flow:
1. Upload sheet (SheetJS parse).
2. Drop image files; match by filename (case-insensitive).
3. Preview table → highlight missing images.
4. Generate → POST rows array to `batchGenerateKanban`.

---

## ☑️ PDF Generation (pdfme v2)

### Templates
- `lib/pdf/kanban/template-red.json`
- `lib/pdf/kanban/template-orange.json`
- `lib/pdf/kanban/template-green.json`

### Helper Modules
- `lib/pdf/kanban/buildKanbanPdf.ts`      // one page
- `lib/pdf/kanban/buildKanbanPdfBatch.ts` // loop + merge (`pdf-lib`)

### Template Specs
- Page 148 mm × 105 mm (A6).
- Top rectangle 25 mm tall; colour per variant.
- “KANBAN” text centred, bold 36 pt.
- Image frame 90 mm × 50 mm (`fit: 'contain'`).
- Text fields grid (label bold 9 pt, value regular 9 pt).
- Signature plugin bottom-right 40 mm × 20 mm.
- Embed **Aptos New** font (`aptos-new.ttf`); fallback **Inter**.

---

## ☑️ Re-used Components / Patterns
- **Dropzone** uploader from Datasheet generator – import and reuse.
- **Form & Validation** with React-Hook-Form + Zod as in `DatasheetGeneratorForm.tsx`.
- **Toast feedback** via Sonner (`toast.success` / `toast.error`).
- **RSC + useActionState** pattern for optimistic UI and error surfacing.

---

## ☑️ UI Behaviour
- List page shows table/grid of stored cards with:
  - Part No, Location, Header Colour, Created At
  - Actions: **View PDF**, **Edit**, **Delete** (with confirm dialog).
- New/Edit form identical, toggled by presence of initial data.
- After save, redirect to `[id]` view page and toast “Card saved”.
- Delete triggers `deleteKanbanCard` then `revalidatePath('/dashboard/kanban')`.

---

## ☑️ Validation Rules
- Image ≤ 2 MB, PNG/JPEG.
- `header_color` defaults to `red`.
- Sheet rows capped at 200 (ask user to split).
- Backend fetch timeout 5 s for any external image URL (batch mode).

---

## ☑️ Implementation Checklist
- [ ] SQL migration + RLS for `kanban_cards`.
- [ ] Sidebar nav item “Kanban Cards”.
- [ ] Build KanbanCardForm (reuse inputs, Dropzone, signature pad).
- [ ] Implement single-card create/edit pages.
- [ ] Implement list page with table and actions.
- [ ] Implement batch wizard page.
- [ ] Write PDF templates & helper modules.
- [ ] Write server actions in `kanban/actions.ts`.
- [ ] Hook up endpoints; test single & batch flows.
- [ ] Verify A6 PDF prints edge-to-edge.
- [ ] Update README / internal docs for feature usage.