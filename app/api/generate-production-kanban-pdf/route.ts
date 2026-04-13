export const runtime = "nodejs";
export const memory = 1024;
export const maxDuration = 60;

import { NextResponse } from "next/server";
import {
  ProductionKanbanRouteError,
  createProductionKanbanPdfSignedUrl,
  fetchProductionKanbanCardsByIds,
  generateAndStoreProductionKanbanPdf,
  getAuthenticatedProductionKanbanRouteContext,
} from "@/lib/production-kanban/pdf-server";
import { normalizeProductionKanbanPdfFormat } from "@/lib/production-kanban/pdf-format";

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

    if (productionKanbanCardIds.length !== 1) {
      throw new ProductionKanbanRouteError(
        "Exactly one Production Kanban card ID is required.",
        400
      );
    }

    const { organizationId, supabaseAdmin } =
      await getAuthenticatedProductionKanbanRouteContext();
    const [card] = await fetchProductionKanbanCardsByIds(
      supabaseAdmin,
      organizationId,
      productionKanbanCardIds
    );
    const { storagePath } = await generateAndStoreProductionKanbanPdf(
      supabaseAdmin,
      card,
      format
    );
    const url = await createProductionKanbanPdfSignedUrl(
      supabaseAdmin,
      storagePath
    );

    return NextResponse.json({ url });
  } catch (error) {
    console.error("Error in POST /api/generate-production-kanban-pdf:", error);

    if (error instanceof ProductionKanbanRouteError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    return NextResponse.json(
      {
        error:
          "An unknown error occurred during Production Kanban PDF generation.",
      },
      { status: 500 }
    );
  }
}
