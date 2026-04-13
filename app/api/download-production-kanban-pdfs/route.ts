export const runtime = "nodejs";
export const memory = 1024;
export const maxDuration = 120;

import JSZip from "jszip";
import {
  DEFAULT_PRODUCTION_KANBAN_PDF_FORMAT,
  getProductionKanbanPdfFormatToken,
  normalizeProductionKanbanPdfFormat,
  type ProductionKanbanPdfFormat,
} from "@/lib/production-kanban/pdf-format";
import {
  downloadProductionKanbanPdfBytes,
  ProductionKanbanRouteError,
  fetchProductionKanbanCardsByIds,
  getOrCreateProductionKanbanPdf,
  getAuthenticatedProductionKanbanRouteContext,
  getSafeProductionKanbanPdfBaseName,
} from "@/lib/production-kanban/pdf-server";

const MAX_BULK_DOWNLOAD_CARDS = 100;

function getZipFileName(
  card: { id: string; part_no: string },
  counts: Map<string, number>,
  format: ProductionKanbanPdfFormat
) {
  const baseName = getSafeProductionKanbanPdfBaseName(card.part_no);
  const duplicateCount = counts.get(baseName) ?? 0;
  const duplicateSuffix = duplicateCount > 1 ? `-${card.id.slice(0, 8)}` : "";
  const formatSuffix =
    format === DEFAULT_PRODUCTION_KANBAN_PDF_FORMAT
      ? ""
      : `-${getProductionKanbanPdfFormatToken(format)}`;

  return `${baseName}${duplicateSuffix}${formatSuffix}.pdf`;
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const format = normalizeProductionKanbanPdfFormat(payload?.format);
    const productionKanbanCardIds = Array.isArray(
      payload?.productionKanbanCardIds
    )
      ? payload.productionKanbanCardIds.filter(
          (cardId: unknown): cardId is string =>
            typeof cardId === "string" && cardId.length > 0
        )
      : [];

    if (productionKanbanCardIds.length === 0) {
      throw new ProductionKanbanRouteError(
        "Select at least one Production Kanban card.",
        400
      );
    }

    if (productionKanbanCardIds.length > MAX_BULK_DOWNLOAD_CARDS) {
      throw new ProductionKanbanRouteError(
        `Bulk download is limited to ${MAX_BULK_DOWNLOAD_CARDS} cards at a time.`,
        400
      );
    }

    const { organizationId, supabaseAdmin } =
      await getAuthenticatedProductionKanbanRouteContext();
    const cards = await fetchProductionKanbanCardsByIds(
      supabaseAdmin,
      organizationId,
      productionKanbanCardIds
    );
    const baseNameCounts = new Map<string, number>();

    for (const card of cards) {
      const baseName = getSafeProductionKanbanPdfBaseName(card.part_no);
      baseNameCounts.set(baseName, (baseNameCounts.get(baseName) ?? 0) + 1);
    }

    const zip = new JSZip();
    for (const card of cards) {
      const { pdfBytes, storagePath } = await getOrCreateProductionKanbanPdf(
        supabaseAdmin,
        card,
        format
      );
      const archiveBytes =
        pdfBytes ??
        (await downloadProductionKanbanPdfBytes(supabaseAdmin, storagePath));
      zip.file(getZipFileName(card, baseNameCounts, format), archiveBytes);
    }

    const zipBytes = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
    const archiveName =
      format === DEFAULT_PRODUCTION_KANBAN_PDF_FORMAT
        ? `production-kanban-${new Date().toISOString().slice(0, 10)}.zip`
        : `production-kanban-${getProductionKanbanPdfFormatToken(
            format
          )}-${new Date().toISOString().slice(0, 10)}.zip`;

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
    console.error("Error in POST /api/download-production-kanban-pdfs:", error);

    if (error instanceof ProductionKanbanRouteError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    return Response.json(
      {
        error:
          "An unknown error occurred during bulk Production Kanban download.",
      },
      { status: 500 }
    );
  }
}
