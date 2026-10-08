import {
  KanbanRouteError,
  fetchKanbanCardsByIds,
  getAuthenticatedKanbanRouteContext,
} from "@/lib/kanban/pdf-server";
import { buildKanbanBatchPdf } from "@/lib/pdf/kanban/buildKanbanBatchPdf";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  kanbanCardIds: z.array(z.string().uuid()).min(1).max(100),
});

export async function POST(req: Request) {
  try {
    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new KanbanRouteError("Select between 1 and 100 valid kanban cards.");
    }

    const { organizationId, supabaseAdmin } =
      await getAuthenticatedKanbanRouteContext();
    // This lookup checks every card belongs to the authenticated organization
    // and restores the requested order, regardless of database result order.
    const cards = await fetchKanbanCardsByIds(
      supabaseAdmin,
      organizationId,
      parsed.data.kanbanCardIds
    );
    const bytes = await buildKanbanBatchPdf(cards);
    const fileName = `kanban-cards-${new Date().toISOString().slice(0, 10)}.pdf`;

    // A print batch is transient; it must not overwrite individual saved PDFs.
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof KanbanRouteError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("Error in POST /api/print-kanban-pdfs:", error);
    return Response.json(
      {
        error: "Failed to prepare the selected kanban cards for printing. Please try again.",
      },
      { status: 500 }
    );
  }
}
