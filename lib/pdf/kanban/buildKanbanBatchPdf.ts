import { PDFDocument } from "pdf-lib";
import type { KanbanPdfCard } from "@/lib/kanban/pdf-server";
import { buildKanbanPdf } from "./buildKanbanPdf";

export async function buildKanbanBatchPdf(
  cards: KanbanPdfCard[]
): Promise<Uint8Array> {
  const combined = await PDFDocument.create();

  // Each card needs its own template to preserve mixed header colours.
  // Process sequentially to bound image/PDF memory usage for larger batches.
  for (const card of cards) {
    const bytes = await buildKanbanPdf([card]);
    const document = await PDFDocument.load(bytes);
    const pages = await combined.copyPages(document, document.getPageIndices());
    for (const page of pages) combined.addPage(page);
  }

  return combined.save();
}
