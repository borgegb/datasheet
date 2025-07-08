"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServerActionClient } from "@/lib/supabase/server";

// --- Interface for Kanban Card ---
export interface KanbanCard {
  id: string;
  organization_id: string;
  product_id: string | null;
  part_no: string;
  description: string | null;
  location: string;
  order_quantity: number | null;
  preferred_supplier: string | null;
  lead_time: string | null;
  header_color: "red" | "orange" | "green";
  image_path: string | null;
  signature_path: string | null;
  pdf_storage_path: string | null;
  created_at: string;
  updated_at: string;
}

// --- Helper function to get user's organization ID ---
async function getUserOrgId(
  supabase: Awaited<ReturnType<typeof createServerActionClient>>
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

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

// --- Create Kanban Card ---
export async function createKanbanCard(formData: FormData) {
  const supabase = await createServerActionClient();
  const organizationId = await getUserOrgId(supabase);

  if (!organizationId) {
    return { data: null, error: { message: "User organization not found." } };
  }

  // Extract form data
  const cardData = {
    organization_id: organizationId,
    product_id: (formData.get("productId") as string) || null,
    part_no: formData.get("partNo") as string,
    description: (formData.get("description") as string) || null,
    location: formData.get("location") as string,
    order_quantity: formData.get("orderQuantity")
      ? parseInt(formData.get("orderQuantity") as string)
      : null,
    preferred_supplier: (formData.get("preferredSupplier") as string) || null,
    lead_time: (formData.get("leadTime") as string) || null,
    header_color:
      (formData.get("headerColor") as "red" | "orange" | "green") || "red",
    image_path: (formData.get("imagePath") as string) || null,
    signature_path: (formData.get("signaturePath") as string) || null,
  };

  // Validate required fields
  if (!cardData.part_no || !cardData.location) {
    return {
      data: null,
      error: { message: "Part Number and Location are required." },
    };
  }

  try {
    const { data, error } = await supabase
      .from("kanban_cards")
      .insert(cardData)
      .select()
      .single();

    if (error) {
      console.error("Error creating kanban card:", error);
      return {
        data: null,
        error: { message: `Database error: ${error.message}` },
      };
    }

    revalidatePath("/dashboard/kanban");
    return { data, error: null };
  } catch (e: any) {
    console.error("Unexpected error creating kanban card:", e);
    return {
      data: null,
      error: { message: `Unexpected error: ${e.message || e}` },
    };
  }
}

// --- Update Kanban Card ---
export async function updateKanbanCard(cardId: string, formData: FormData) {
  const supabase = await createServerActionClient();
  const organizationId = await getUserOrgId(supabase);

  if (!organizationId) {
    return { data: null, error: { message: "User organization not found." } };
  }

  // Extract form data
  const cardData = {
    product_id: (formData.get("productId") as string) || null,
    part_no: formData.get("partNo") as string,
    description: (formData.get("description") as string) || null,
    location: formData.get("location") as string,
    order_quantity: formData.get("orderQuantity")
      ? parseInt(formData.get("orderQuantity") as string)
      : null,
    preferred_supplier: (formData.get("preferredSupplier") as string) || null,
    lead_time: (formData.get("leadTime") as string) || null,
    header_color:
      (formData.get("headerColor") as "red" | "orange" | "green") || "red",
    image_path: (formData.get("imagePath") as string) || null,
    signature_path: (formData.get("signaturePath") as string) || null,
    updated_at: new Date().toISOString(),
  };

  // Validate required fields
  if (!cardData.part_no || !cardData.location) {
    return {
      data: null,
      error: { message: "Part Number and Location are required." },
    };
  }

  try {
    const { data, error } = await supabase
      .from("kanban_cards")
      .update(cardData)
      .eq("id", cardId)
      .eq("organization_id", organizationId)
      .select()
      .single();

    if (error) {
      console.error("Error updating kanban card:", error);
      return {
        data: null,
        error: { message: `Database error: ${error.message}` },
      };
    }

    revalidatePath("/dashboard/kanban");
    revalidatePath(`/dashboard/kanban/${cardId}`);
    return { data, error: null };
  } catch (e: any) {
    console.error("Unexpected error updating kanban card:", e);
    return {
      data: null,
      error: { message: `Unexpected error: ${e.message || e}` },
    };
  }
}

// --- Delete Kanban Card ---
export async function deleteKanbanCard(cardId: string) {
  const supabase = await createServerActionClient();
  const organizationId = await getUserOrgId(supabase);

  if (!organizationId) {
    return { error: { message: "User organization not found." } };
  }

  try {
    // First get the card to check for associated files
    const { data: card, error: fetchError } = await supabase
      .from("kanban_cards")
      .select("image_path, signature_path, pdf_storage_path")
      .eq("id", cardId)
      .eq("organization_id", organizationId)
      .single();

    if (fetchError) {
      console.error("Error fetching kanban card for deletion:", fetchError);
      return { error: { message: "Card not found or access denied." } };
    }

    // Delete the card
    const { error: deleteError } = await supabase
      .from("kanban_cards")
      .delete()
      .eq("id", cardId)
      .eq("organization_id", organizationId);

    if (deleteError) {
      console.error("Error deleting kanban card:", deleteError);
      return { error: { message: `Database error: ${deleteError.message}` } };
    }

    // Delete associated files from storage
    const filesToDelete: string[] = [];
    if (card.image_path) filesToDelete.push(card.image_path);
    if (card.signature_path) filesToDelete.push(card.signature_path);
    if (card.pdf_storage_path) filesToDelete.push(card.pdf_storage_path);

    if (filesToDelete.length > 0) {
      const { error: storageError } = await supabase.storage
        .from("datasheet-assets")
        .remove(filesToDelete);

      if (storageError) {
        console.error("Error deleting associated files:", storageError);
        // Non-fatal, continue as card is already deleted
      }
    }

    revalidatePath("/dashboard/kanban");
    return { error: null };
  } catch (e: any) {
    console.error("Unexpected error deleting kanban card:", e);
    return {
      error: { message: `Unexpected error: ${e.message || e}` },
    };
  }
}

// --- Fetch Kanban Card by ID ---
export async function fetchKanbanCardById(cardId: string) {
  const supabase = await createServerActionClient();
  const organizationId = await getUserOrgId(supabase);

  if (!organizationId) {
    return { data: null, error: { message: "User organization not found." } };
  }

  try {
    const { data, error } = await supabase
      .from("kanban_cards")
      .select("*")
      .eq("id", cardId)
      .eq("organization_id", organizationId)
      .single();

    if (error) {
      console.error(`Error fetching kanban card ${cardId}:`, error);
      if (error.code === "PGRST116") {
        return { data: null, error: { message: "Card not found." } };
      }
      return {
        data: null,
        error: { message: `Database error: ${error.message}` },
      };
    }

    return { data, error: null };
  } catch (e: any) {
    console.error("Unexpected error fetching kanban card:", e);
    return {
      data: null,
      error: { message: `Unexpected error: ${e.message || e}` },
    };
  }
}

// --- List Kanban Cards for Organization ---
export async function fetchKanbanCardsForOrg() {
  const supabase = await createServerActionClient();
  const organizationId = await getUserOrgId(supabase);

  if (!organizationId) {
    return { data: [], error: { message: "User organization not found." } };
  }

  try {
    const { data, error } = await supabase
      .from("kanban_cards")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching kanban cards:", error);
      return {
        data: [],
        error: { message: `Database error: ${error.message}` },
      };
    }

    return { data: data || [], error: null };
  } catch (e: any) {
    console.error("Unexpected error fetching kanban cards:", e);
    return {
      data: [],
      error: { message: `Unexpected error: ${e.message || e}` },
    };
  }
}

// --- Batch Generate Kanban Cards ---
export async function batchGenerateKanban(rows: any[]) {
  const supabase = await createServerActionClient();
  const organizationId = await getUserOrgId(supabase);

  if (!organizationId) {
    return { data: [], error: { message: "User organization not found." } };
  }

  if (!rows || rows.length === 0) {
    return {
      data: [],
      error: { message: "No data provided for batch generation." },
    };
  }

  try {
    // Prepare batch data
    const cardsData = rows.map((row) => ({
      organization_id: organizationId,
      part_no: row.part_no,
      description: row.description || null,
      location: row.location,
      order_quantity: row.order_qty ? parseInt(row.order_qty) : null,
      preferred_supplier: row.preferred_supplier || null,
      lead_time: row.lead_time || null,
      header_color: (row.header_color as "red" | "orange" | "green") || "red",
      image_path: row.image_path || null,
      product_id: row.product_id || null,
    }));

    const { data, error } = await supabase
      .from("kanban_cards")
      .insert(cardsData)
      .select();

    if (error) {
      console.error("Error batch creating kanban cards:", error);
      return {
        data: [],
        error: { message: `Database error: ${error.message}` },
      };
    }

    revalidatePath("/dashboard/kanban");
    return { data: data || [], error: null };
  } catch (e: any) {
    console.error("Unexpected error batch creating kanban cards:", e);
    return {
      data: [],
      error: { message: `Unexpected error: ${e.message || e}` },
    };
  }
}

// --- Generate Kanban Card PDF ---
export async function generateKanbanCardPdf(cardId: string): Promise<{
  data?: { url: string };
  error?: string;
}> {
  try {
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : process.env.NEXT_PUBLIC_VERCEL_URL || 'http://localhost:3000';
      
    const response = await fetch(`${baseUrl}/api/generate-kanban-pdf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ kanbanCardId: cardId }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return { error: errorData.error || "Failed to generate PDF" };
    }

    const result = await response.json();
    revalidatePath("/dashboard/kanban");
    revalidatePath(`/dashboard/kanban/${cardId}`);
    return { data: { url: result.url } };
  } catch (error: any) {
    console.error("Error generating kanban card PDF:", error);
    return { error: error.message || "Failed to generate PDF" };
  }
}
