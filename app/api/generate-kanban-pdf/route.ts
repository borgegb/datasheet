export const runtime = "nodejs";
export const memory = 1024;
export const maxDuration = 60;

import { NextResponse } from "next/server";
import {
  KanbanRouteError,
  createKanbanPdfSignedUrl,
  fetchKanbanCardsByIds,
  generateAndStoreKanbanPdf,
  getAuthenticatedKanbanRouteContext,
} from "@/lib/kanban/pdf-server";

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const kanbanCardIds = Array.isArray(payload?.kanbanCardIds)
      ? payload.kanbanCardIds.filter(
          (cardId: unknown): cardId is string =>
            typeof cardId === "string" && cardId.length > 0
        )
      : [];

    if (kanbanCardIds.length !== 1) {
      throw new KanbanRouteError(
        "Exactly one kanban card ID is required.",
        400
      );
    }

    const { organizationId, supabaseAdmin } =
      await getAuthenticatedKanbanRouteContext();
    const [card] = await fetchKanbanCardsByIds(
      supabaseAdmin,
      organizationId,
      kanbanCardIds
    );
    const { storagePath } = await generateAndStoreKanbanPdf(
      supabaseAdmin,
      card
    );
    const url = await createKanbanPdfSignedUrl(supabaseAdmin, storagePath);

    return NextResponse.json({ url });
  } catch (error) {
    console.error("Error in POST /api/generate-kanban-pdf:", error);

    if (error instanceof KanbanRouteError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    return NextResponse.json(
      { error: "An unknown error occurred during kanban PDF generation." },
      { status: 500 }
    );
  }
}
