import { buildKanbanPdf } from "@/lib/pdf/kanban/buildKanbanPdf";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

export interface KanbanPdfCard {
  id: string;
  organization_id: string;
  part_no: string;
  description: string;
  location: string;
  order_quantity: number;
  preferred_supplier: string;
  lead_time: string;
  header_color: string;
  image_path?: string | null;
  pdf_storage_path?: string | null;
}

interface KanbanRouteContext {
  organizationId: string;
  supabaseAdmin: SupabaseClient;
}

export class KanbanRouteError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "KanbanRouteError";
    this.status = status;
  }
}

function createSupabaseAdminClient() {
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new KanbanRouteError(
      "Missing Supabase configuration for kanban PDF generation.",
      500
    );
  }

  return createSupabaseClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function getAuthenticatedKanbanRouteContext(): Promise<KanbanRouteContext> {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new KanbanRouteError("Unauthorized", 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    throw new KanbanRouteError("User organization not found.", 403);
  }

  return {
    organizationId: profile.organization_id,
    supabaseAdmin: createSupabaseAdminClient(),
  };
}

export async function fetchKanbanCardsByIds(
  supabaseAdmin: SupabaseClient,
  organizationId: string,
  cardIds: string[]
) {
  const uniqueCardIds = [...new Set(cardIds)];

  const { data, error } = await supabaseAdmin
    .from("kanban_cards")
    .select(
      "id, organization_id, part_no, description, location, order_quantity, preferred_supplier, lead_time, header_color, image_path, pdf_storage_path"
    )
    .eq("organization_id", organizationId)
    .in("id", uniqueCardIds);

  if (error) {
    throw new KanbanRouteError(`DB Error: ${error.message}`, 500);
  }

  const cardsById = new Map(
    (data ?? []).map((card) => [card.id, card as KanbanPdfCard])
  );
  const orderedCards = uniqueCardIds
    .map((cardId) => cardsById.get(cardId))
    .filter((card): card is KanbanPdfCard => Boolean(card));

  if (orderedCards.length !== uniqueCardIds.length) {
    throw new KanbanRouteError(
      "One or more kanban cards were not found.",
      404
    );
  }

  return orderedCards;
}

export function getKanbanPdfStoragePath(
  card: Pick<KanbanPdfCard, "id" | "organization_id">
) {
  return `${card.organization_id}/kanban/pdfs/${card.id}.pdf`;
}

export async function generateAndStoreKanbanPdf(
  supabaseAdmin: SupabaseClient,
  card: KanbanPdfCard
) {
  const pdfBytes = await buildKanbanPdf([card]);
  const storagePath = getKanbanPdfStoragePath(card);

  const { error: uploadError } = await supabaseAdmin.storage
    .from("datasheet-assets")
    .upload(storagePath, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    throw new KanbanRouteError(
      `Storage upload failed: ${uploadError.message}`,
      500
    );
  }

  const { error: updateError } = await supabaseAdmin
    .from("kanban_cards")
    .update({
      pdf_storage_path: storagePath,
      updated_at: new Date().toISOString(),
    })
    .eq("id", card.id)
    .eq("organization_id", card.organization_id);

  if (updateError) {
    throw new KanbanRouteError(
      `Failed to update kanban card PDF path: ${updateError.message}`,
      500
    );
  }

  return { pdfBytes, storagePath };
}

export async function createKanbanPdfSignedUrl(
  supabaseAdmin: SupabaseClient,
  storagePath: string,
  expiresIn = 900
) {
  const { data, error } = await supabaseAdmin.storage
    .from("datasheet-assets")
    .createSignedUrl(storagePath, expiresIn);

  if (error || !data?.signedUrl) {
    throw new KanbanRouteError(
      `Failed to create signed URL: ${error?.message ?? "Unknown error"}`,
      500
    );
  }

  return data.signedUrl;
}

export function getSafeKanbanPdfBaseName(partNo: string | null | undefined) {
  const safeBase = (partNo || "kanban-card")
    .trim()
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  return safeBase || "kanban-card";
}
