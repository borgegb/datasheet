"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServerActionClient } from "@/lib/supabase/server";
import {
  createEmptyProductionKanbanBackRows,
  normalizeProductionKanbanBackRows,
  type ProductionKanbanBackRow,
} from "@/lib/production-kanban/back-rows";

async function getUserOrgId(
  supabase: Awaited<ReturnType<typeof createServerActionClient>>
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    console.error(
      "Server Action Error: Couldn't get organization_id for user",
      user.id,
      profileError
    );
    return null;
  }

  return profile.organization_id;
}

function safeParseBackRows(rawValue: FormDataEntryValue | null) {
  if (typeof rawValue !== "string" || !rawValue.trim()) {
    return createEmptyProductionKanbanBackRows();
  }

  try {
    return normalizeProductionKanbanBackRows(JSON.parse(rawValue));
  } catch (error) {
    console.error("Failed to parse Production Kanban back rows:", error);
    return createEmptyProductionKanbanBackRows();
  }
}

function normalizeProductionKanbanCardRecord(
  record: any
): ProductionKanbanCard {
  return {
    ...record,
    footer_code:
      typeof record?.footer_code === "string" ? record.footer_code : "",
    back_rows: normalizeProductionKanbanBackRows(record?.back_rows),
  };
}

export interface ProductionKanbanCard {
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
  signedImageUrl?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface FetchProductionKanbanCardsForOrgOptions {
  page?: number;
  pageSize?: number;
  search?: string;
}

interface FetchProductionKanbanCardsForOrgResult {
  data: ProductionKanbanCard[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  error: { message: string } | null;
}

type SaveProductionKanbanCardState = {
  data: ProductionKanbanCard | null;
  error: { message: string } | null;
};

export async function saveProductionKanbanCard(
  _prevState: SaveProductionKanbanCardState | null,
  formData: FormData
): Promise<SaveProductionKanbanCardState> {
  const supabase = await createServerActionClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user?.id) {
    console.error(
      "User not authenticated for saveProductionKanbanCard:",
      userError
    );
    return { data: null, error: { message: "User not authenticated." } };
  }

  const organizationId = await getUserOrgId(supabase);
  if (!organizationId) {
    return { data: null, error: { message: "User organization not found." } };
  }

  const editingCardId = formData.get("editingCardId") as string | null;
  const backRows = safeParseBackRows(formData.get("backRows"));
  const footerCode =
    typeof formData.get("footerCode") === "string"
      ? (formData.get("footerCode") as string).trim().slice(0, 48)
      : "";

  const productionKanbanCardData = {
    part_no:
      typeof formData.get("partNo") === "string"
        ? (formData.get("partNo") as string).trim()
        : "",
    description:
      typeof formData.get("description") === "string"
        ? (formData.get("description") as string).trim()
        : "",
    location:
      typeof formData.get("location") === "string"
        ? (formData.get("location") as string).trim()
        : "",
    order_quantity: parseInt(formData.get("orderQuantity") as string, 10) || 0,
    preferred_supplier:
      typeof formData.get("preferredSupplier") === "string"
        ? (formData.get("preferredSupplier") as string).trim()
        : "",
    lead_time:
      typeof formData.get("leadTime") === "string"
        ? (formData.get("leadTime") as string).trim()
        : "",
    image_path: formData.get("imagePath") as string | null,
    organization_id: organizationId,
    back_rows: backRows,
    footer_code: footerCode,
  };

  if (!productionKanbanCardData.part_no || !productionKanbanCardData.location) {
    return {
      data: null,
      error: { message: "Part Number and Location are required." },
    };
  }

  let error: any = null;
  let data: any = null;

  try {
    if (editingCardId) {
      const { data: updateData, error: updateError } = await supabase
        .from("production_kanban_cards")
        .update({
          ...productionKanbanCardData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingCardId)
        .eq("organization_id", organizationId)
        .select("*")
        .single();

      data = updateData;
      error = updateError;
    } else {
      const { data: insertData, error: insertError } = await supabase
        .from("production_kanban_cards")
        .insert(productionKanbanCardData)
        .select("*")
        .single();

      data = insertData;
      error = insertError;
    }

    if (error) {
      console.error("Error saving production kanban card:", error);
      return {
        data: null,
        error: { message: `Database error: ${error.message}` },
      };
    }

    revalidatePath("/dashboard/production-kanban");
    return {
      data: normalizeProductionKanbanCardRecord(data),
      error: null,
    };
  } catch (unexpectedError: any) {
    console.error(
      "Unexpected error saving production kanban card:",
      unexpectedError
    );
    return {
      data: null,
      error: {
        message: `Unexpected error: ${unexpectedError.message || unexpectedError}`,
      },
    };
  }
}

export async function fetchProductionKanbanCardsForOrg(
  options: FetchProductionKanbanCardsForOrgOptions = {}
): Promise<FetchProductionKanbanCardsForOrgResult> {
  const supabase = await createServerActionClient();
  const organizationId = await getUserOrgId(supabase);
  const rawPage = options.page ?? 1;
  const rawPageSize = options.pageSize ?? 25;
  const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1;
  const pageSize = Number.isFinite(rawPageSize)
    ? Math.min(Math.max(1, rawPageSize), 100)
    : 25;
  const search = options.search?.trim() ?? "";

  if (!organizationId) {
    return {
      data: [],
      totalCount: 0,
      page,
      pageSize,
      totalPages: 1,
      error: { message: "User organization not found." },
    };
  }

  let query = supabase
    .from("production_kanban_cards")
    .select(
      "id, organization_id, part_no, description, location, order_quantity, preferred_supplier, lead_time, footer_code, pdf_storage_path, created_at, updated_at",
      { count: "exact" }
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (search) {
    const escapedSearch = search
      .replace(/\\/g, "\\\\")
      .replace(/,/g, "\\,")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");

    query = query.or(
      `part_no.ilike.%${escapedSearch}%,description.ilike.%${escapedSearch}%,location.ilike.%${escapedSearch}%,preferred_supplier.ilike.%${escapedSearch}%,footer_code.ilike.%${escapedSearch}%`
    );
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await query.range(from, to);

  if (error) {
    console.error(
      "Server Action Error (fetchProductionKanbanCardsForOrg):",
      error
    );
    return {
      data: [],
      totalCount: 0,
      page,
      pageSize,
      totalPages: 1,
      error: { message: error.message },
    };
  }

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    data: (data ?? []).map(normalizeProductionKanbanCardRecord),
    totalCount,
    page,
    pageSize,
    totalPages,
    error: null,
  };
}

export async function deleteProductionKanbanCards(cardIds: string[]) {
  if (!cardIds || cardIds.length === 0) {
    return { error: { message: "No card IDs provided for deletion." } };
  }

  const supabase = await createServerActionClient();
  const organizationId = await getUserOrgId(supabase);

  if (!organizationId) {
    return { error: { message: "User organization not found." } };
  }

  const { error } = await supabase
    .from("production_kanban_cards")
    .delete()
    .in("id", cardIds)
    .eq("organization_id", organizationId);

  if (error) {
    console.error(
      "Server Action Error (deleteProductionKanbanCards):",
      error
    );
    return { error };
  }

  revalidatePath("/dashboard/production-kanban");
  return { error: null };
}

export async function fetchProductionKanbanCardById(cardId: string) {
  if (!cardId) {
    return { data: null, error: { message: "Card ID is required." } };
  }

  const supabase = await createServerActionClient();

  try {
    const organizationId = await getUserOrgId(supabase);
    if (!organizationId) {
      return { data: null, error: { message: "User organization not found." } };
    }

    const { data: cardData, error } = await supabase
      .from("production_kanban_cards")
      .select("*")
      .eq("id", cardId)
      .eq("organization_id", organizationId)
      .single();

    if (error) {
      console.error(`Error fetching production kanban card ${cardId}:`, error);
      if (error.code === "PGRST116") {
        return {
          data: null,
          error: { message: "Production Kanban card not found." },
        };
      }

      return {
        data: null,
        error: { message: `Database error: ${error.message}` },
      };
    }

    let signedUrl = null;
    if (cardData?.image_path) {
      const { data: urlData, error: urlError } = await supabase.storage
        .from("datasheet-assets")
        .createSignedUrl(cardData.image_path, 60 * 5);

      if (urlError) {
        console.error(
          `Error generating signed URL for ${cardData.image_path}:`,
          urlError
        );
      } else {
        signedUrl = urlData.signedUrl;
      }
    }

    return {
      data: {
        ...normalizeProductionKanbanCardRecord(cardData),
        signedImageUrl: signedUrl,
      } as ProductionKanbanCard,
      error: null,
    };
  } catch (unexpectedError: any) {
    console.error(
      "Unexpected error fetching production kanban card:",
      unexpectedError
    );
    return {
      data: null,
      error: {
        message: `Unexpected error: ${unexpectedError.message || unexpectedError}`,
      },
    };
  }
}
