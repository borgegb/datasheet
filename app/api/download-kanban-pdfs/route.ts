export const runtime = "nodejs";
export const memory = 1024;
export const maxDuration = 120;

import {
  KanbanRouteError,
  fetchKanbanCardsByIds,
  generateAndStoreKanbanPdf,
  getAuthenticatedKanbanRouteContext,
  getSafeKanbanPdfBaseName,
} from "@/lib/kanban/pdf-server";
import JSZip from "jszip";

const MAX_BULK_DOWNLOAD_CARDS = 100;

function getZipFileName(card: { id: string; part_no: string }, counts: Map<string, number>) {
  const baseName = getSafeKanbanPdfBaseName(card.part_no);
  const duplicateCount = counts.get(baseName) ?? 0;

  if (duplicateCount > 1) {
    return `${baseName}-${card.id.slice(0, 8)}.pdf`;
  }

  return `${baseName}.pdf`;
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const kanbanCardIds = Array.isArray(payload?.kanbanCardIds)
      ? payload.kanbanCardIds.filter(
          (cardId: unknown): cardId is string =>
            typeof cardId === "string" && cardId.length > 0
        )
      : [];

    if (kanbanCardIds.length === 0) {
      throw new KanbanRouteError("Select at least one kanban card.", 400);
    }

    if (kanbanCardIds.length > MAX_BULK_DOWNLOAD_CARDS) {
      throw new KanbanRouteError(
        `Bulk download is limited to ${MAX_BULK_DOWNLOAD_CARDS} cards at a time.`,
        400
      );
    }

    const { organizationId, supabaseAdmin } =
      await getAuthenticatedKanbanRouteContext();
    const cards = await fetchKanbanCardsByIds(
      supabaseAdmin,
      organizationId,
      kanbanCardIds
    );
    const baseNameCounts = new Map<string, number>();

    for (const card of cards) {
      const baseName = getSafeKanbanPdfBaseName(card.part_no);
      baseNameCounts.set(baseName, (baseNameCounts.get(baseName) ?? 0) + 1);
    }

    const zip = new JSZip();
    for (const card of cards) {
      const { pdfBytes } = await generateAndStoreKanbanPdf(supabaseAdmin, card);
      zip.file(getZipFileName(card, baseNameCounts), pdfBytes);
    }

    const zipBytes = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
    const archiveName = `kanban-cards-${new Date()
      .toISOString()
      .slice(0, 10)}.zip`;

    return new Response(zipBytes, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${archiveName}"`,
        "Content-Type": "application/zip",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Error in POST /api/download-kanban-pdfs:", error);

    if (error instanceof KanbanRouteError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    return Response.json(
      { error: "An unknown error occurred during bulk kanban download." },
      { status: 500 }
    );
  }
}
