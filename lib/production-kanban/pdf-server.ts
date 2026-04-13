import { buildProductionKanbanPdf } from "@/lib/pdf/production-kanban/buildProductionKanbanPdf";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import {
  normalizeProductionKanbanBackRows,
  type ProductionKanbanBackRow,
} from "@/lib/production-kanban/back-rows";
import {
  DEFAULT_PRODUCTION_KANBAN_PDF_FORMAT,
  getProductionKanbanPdfFormatToken,
  type ProductionKanbanPdfFormat,
} from "@/lib/production-kanban/pdf-format";

export interface ProductionKanbanPdfCard {
  id: string;
  organization_id: string;
  part_no: string;
  description: string;
  location: string;
  order_quantity: number;
  preferred_supplier: string;
  lead_time: string;
  image_path?: string | null;
  pdf_storage_path?: string | null;
  footer_code: string;
  back_rows: ProductionKanbanBackRow[];
}

interface ProductionKanbanRouteContext {
  organizationId: string;
  supabaseAdmin: SupabaseClient;
}

export class ProductionKanbanRouteError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ProductionKanbanRouteError";
    this.status = status;
  }
}

function createSupabaseAdminClient() {
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new ProductionKanbanRouteError(
      "Missing Supabase configuration for Production Kanban PDF generation.",
      500
    );
  }

  return createSupabaseClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function getAuthenticatedProductionKanbanRouteContext(): Promise<ProductionKanbanRouteContext> {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new ProductionKanbanRouteError("Unauthorized", 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    throw new ProductionKanbanRouteError("User organization not found.", 403);
  }

  return {
    organizationId: profile.organization_id,
    supabaseAdmin: createSupabaseAdminClient(),
  };
}

function normalizeProductionKanbanPdfCard(record: any): ProductionKanbanPdfCard {
  return {
    ...record,
    footer_code:
      typeof record?.footer_code === "string" ? record.footer_code : "",
    back_rows: normalizeProductionKanbanBackRows(record?.back_rows),
  };
}

export async function fetchProductionKanbanCardsByIds(
  supabaseAdmin: SupabaseClient,
  organizationId: string,
  cardIds: string[]
) {
  const uniqueCardIds = [...new Set(cardIds)];

  const { data, error } = await supabaseAdmin
    .from("production_kanban_cards")
    .select(
      "id, organization_id, part_no, description, location, order_quantity, preferred_supplier, lead_time, image_path, pdf_storage_path, footer_code, back_rows"
    )
    .eq("organization_id", organizationId)
    .in("id", uniqueCardIds);

  if (error) {
    throw new ProductionKanbanRouteError(`DB Error: ${error.message}`, 500);
  }

  const cardsById = new Map(
    (data ?? []).map((card) => [
      card.id,
      normalizeProductionKanbanPdfCard(card),
    ])
  );
  const orderedCards = uniqueCardIds
    .map((cardId) => cardsById.get(cardId))
    .filter((card): card is ProductionKanbanPdfCard => Boolean(card));

  if (orderedCards.length !== uniqueCardIds.length) {
    throw new ProductionKanbanRouteError(
      "One or more Production Kanban cards were not found.",
      404
    );
  }

  return orderedCards;
}

export function getProductionKanbanPdfStoragePath(
  card: Pick<ProductionKanbanPdfCard, "id" | "organization_id">,
  format: ProductionKanbanPdfFormat = DEFAULT_PRODUCTION_KANBAN_PDF_FORMAT
) {
  if (format === DEFAULT_PRODUCTION_KANBAN_PDF_FORMAT) {
    return `${card.organization_id}/production-kanban/pdfs/${card.id}.pdf`;
  }

  return `${card.organization_id}/production-kanban/pdfs/${card.id}-${getProductionKanbanPdfFormatToken(
    format
  )}.pdf`;
}

export async function generateAndStoreProductionKanbanPdf(
  supabaseAdmin: SupabaseClient,
  card: ProductionKanbanPdfCard,
  format: ProductionKanbanPdfFormat = DEFAULT_PRODUCTION_KANBAN_PDF_FORMAT
) {
  const pdfBytes = await buildProductionKanbanPdf(card, format);
  const storagePath = getProductionKanbanPdfStoragePath(card, format);

  const { error: uploadError } = await supabaseAdmin.storage
    .from("datasheet-assets")
    .upload(storagePath, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    throw new ProductionKanbanRouteError(
      `Storage upload failed: ${uploadError.message}`,
      500
    );
  }

  if (format === DEFAULT_PRODUCTION_KANBAN_PDF_FORMAT) {
    const { error: updateError } = await supabaseAdmin
      .from("production_kanban_cards")
      .update({
        pdf_storage_path: storagePath,
        updated_at: new Date().toISOString(),
      })
      .eq("id", card.id)
      .eq("organization_id", card.organization_id);

    if (updateError) {
      throw new ProductionKanbanRouteError(
        `Failed to update Production Kanban PDF path: ${updateError.message}`,
        500
      );
    }
  }

  return { pdfBytes, storagePath };
}

export async function createProductionKanbanPdfSignedUrl(
  supabaseAdmin: SupabaseClient,
  storagePath: string,
  expiresIn = 900
) {
  const { data, error } = await supabaseAdmin.storage
    .from("datasheet-assets")
    .createSignedUrl(storagePath, expiresIn);

  if (error || !data?.signedUrl) {
    throw new ProductionKanbanRouteError(
      `Failed to create signed URL: ${error?.message ?? "Unknown error"}`,
      500
    );
  }

  return data.signedUrl;
}

export function getSafeProductionKanbanPdfBaseName(
  partNo: string | null | undefined
) {
  const safeBase = (partNo || "production-kanban")
    .trim()
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  return safeBase || "production-kanban";
}
