"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServerActionClient } from "@/lib/supabase/server";

// --- Action to get user's organization ID ---
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

// --- Interface for Kanban Card ---
export interface KanbanCard {
  id: string;
  organization_id: string;
  product_id?: string | null;
  part_no: string;
  description: string;
  location: string;
  order_quantity: number;
  preferred_supplier: string;
  lead_time: string;
  header_color: "red" | "orange" | "green";
  created_at?: string;
  updated_at?: string;
}

// --- Action to Save/Update Kanban Card ---
type SaveKanbanCardState = {
  data: KanbanCard | null;
  error: { message: string } | null;
};

export async function saveKanbanCard(
  prevState: SaveKanbanCardState | null,
  formData: FormData
): Promise<SaveKanbanCardState> {
  const supabase = await createServerActionClient();

  // Get current user
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user?.id) {
    console.error("User not authenticated for saveKanbanCard:", userError);
    return { data: null, error: { message: "User not authenticated." } };
  }
  const userId = userData.user.id;

  // Get user's organization ID
  const organizationId = await getUserOrgId(supabase);
  if (!organizationId) {
    console.error("User organization not found");
    return { data: null, error: { message: "User organization not found." } };
  }

  // Extract editingCardId if present
  const editingCardId = formData.get("editingCardId") as string | null;

  // Prepare data object for Supabase
  const kanbanCardData = {
    part_no: formData.get("partNo") as string,
    description: formData.get("description") as string,
    location: formData.get("location") as string,
    order_quantity: parseInt(formData.get("orderQuantity") as string) || 0,
    preferred_supplier: formData.get("preferredSupplier") as string,
    lead_time: formData.get("leadTime") as string,
    header_color: (formData.get("headerColor") as "red" | "orange" | "green") || "red",
    product_id: formData.get("productId") as string | null,
    organization_id: organizationId,
  };

  // Input Validation
  if (!kanbanCardData.part_no || !kanbanCardData.location) {
    return {
      data: null,
      error: { message: "Part Number and Location are required." },
    };
  }

  // Perform Insert or Update
  let error: any = null;
  let data: any = null;

  try {
    if (editingCardId) {
      // UPDATE
      console.log(`Updating kanban card ID: ${editingCardId}`);
      const { data: updateData, error: updateError } = await supabase
        .from("kanban_cards")
        .update({ ...kanbanCardData, updated_at: new Date().toISOString() })
        .eq("id", editingCardId)
        .eq("organization_id", organizationId)
        .select()
        .single();

      data = updateData;
      error = updateError;
      if (!error) {
        console.log("Kanban card updated successfully:", data);
      }
    } else {
      // INSERT
      console.log("Inserting new kanban card...");
      const { data: insertData, error: insertError } = await supabase
        .from("kanban_cards")
        .insert(kanbanCardData)
        .select()
        .single();

      data = insertData;
      error = insertError;
      if (!error) {
        console.log("Kanban card inserted successfully:", data);
      }
    }

    if (error) {
      console.error("Error saving kanban card:", error);
      return {
        data: null,
        error: { message: `Database error: ${error.message}` },
      };
    }

    revalidatePath("/dashboard/kanban");
    return { data, error: null };
  } catch (e: any) {
    console.error("Unexpected error saving kanban card:", e);
    return {
      data: null,
      error: { message: `Unexpected error: ${e.message || e}` },
    };
  }
}

// --- Action to Fetch Kanban Cards ---
export async function fetchKanbanCardsForOrg() {
  const supabase = await createServerActionClient();
  const organizationId = await getUserOrgId(supabase);

  if (!organizationId) {
    return { data: [], error: { message: "User organization not found." } };
  }

  const { data, error } = await supabase
    .from("kanban_cards")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Server Action Error (fetchKanbanCardsForOrg):", error);
  }

  return { data: data || [], error };
}

// --- Action to Delete Kanban Cards ---
export async function deleteKanbanCards(cardIds: string[]) {
  if (!cardIds || cardIds.length === 0) {
    return { error: { message: "No card IDs provided for deletion." } };
  }

  const supabase = await createServerActionClient();
  const organizationId = await getUserOrgId(supabase);

  if (!organizationId) {
    return { error: { message: "User organization not found." } };
  }

  const { error } = await supabase
    .from("kanban_cards")
    .delete()
    .in("id", cardIds)
    .eq("organization_id", organizationId);

  if (error) {
    console.error("Server Action Error (deleteKanbanCards):", error);
    return { error };
  }

  revalidatePath("/dashboard/kanban");
  return { error: null };
}

// --- Action to Fetch Kanban Card by ID ---
export async function fetchKanbanCardById(cardId: string) {
  if (!cardId) {
    return { data: null, error: { message: "Card ID is required." } };
  }

  const supabase = await createServerActionClient();

  try {
    const { data: user, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.user?.id) {
      console.error("User not authenticated:", userError);
      return { data: null, error: { message: "User not authenticated" } };
    }

    const { data, error } = await supabase
      .from("kanban_cards")
      .select("*")
      .eq("id", cardId)
      .single();

    if (error) {
      console.error(`Error fetching kanban card ${cardId}:`, error);
      if (error.code === "PGRST116") {
        return { data: null, error: { message: "Kanban card not found." } };
      }
      return {
        data: null,
        error: { message: `Database error: ${error.message}` },
      };
    }

    console.log(`Fetched kanban card ${cardId} successfully.`);
    return { data, error: null };
  } catch (e: any) {
    console.error("Unexpected error fetching kanban card:", e);
    return {
      data: null,
      error: { message: `Unexpected error: ${e.message || e}` },
    };
  }
}

// --- Helper function to call PDF generation API ---
export async function generateKanbanCardsPdf(cardIds: string[]): Promise<{
  url?: string;
  error?: string;
}> {
  try {
    const response = await fetch("/api/generate-kanban-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kanbanCardIds: cardIds }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Failed to generate PDF");
    }

    return { url: result.url };
  } catch (error: any) {
    console.error("Error generating kanban cards PDF:", error);
    return { error: error.message };
  }
}
