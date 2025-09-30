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
  header_color: "red" | "orange" | "green" | "yellow" | "blue" | "purple" | "brown" | "pink" | "teal" | "cyan" | "gray" | "magenta" | "lime" | "silver";
  image_path?: string | null;
  pdf_storage_path?: string | null; // Add PDF storage path field
  signedImageUrl?: string | null; // Add optional signed URL field
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
    header_color:
      (formData.get("headerColor") as "red" | "orange" | "green" | "yellow" | "blue" | "purple" | "brown" | "pink" | "teal" | "cyan" | "gray" | "magenta" | "lime" | "silver") ||
      "red",
    product_id: formData.get("productId") as string | null,
    image_path: formData.get("imagePath") as string | null,
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

  const { data: kanbanCardsData, error } = await supabase
    .from("kanban_cards")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Server Action Error (fetchKanbanCardsForOrg):", error);
    return { data: [], error };
  }

  // --- Generate Signed URLs ---
  const processedData = await Promise.all(
    (kanbanCardsData || []).map(async (card) => {
      let signedUrl = null;
      if (card.image_path) {
        const { data: urlData, error: urlError } = await supabase.storage
          .from("datasheet-assets") // Ensure this is your bucket name
          .createSignedUrl(card.image_path, 60 * 5); // 5 minutes expiry

        if (urlError) {
          console.error(
            `Error generating signed URL for ${card.image_path}:`,
            urlError
          );
          // Log error and return null
        } else {
          signedUrl = urlData.signedUrl;
        }
      }
      return {
        ...card,
        signedImageUrl: signedUrl, // Add the signed URL to the object
      };
    })
  );
  // --- End Generate Signed URLs ---

  return { data: processedData, error: null };
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

    const { data: cardData, error } = await supabase
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

    // --- Generate Signed URL ---
    let signedUrl = null;
    if (cardData?.image_path) {
      const { data: urlData, error: urlError } = await supabase.storage
        .from("datasheet-assets") // Ensure this is your bucket name
        .createSignedUrl(cardData.image_path, 60 * 5); // 5 minutes expiry

      if (urlError) {
        console.error(
          `Error generating signed URL for ${cardData.image_path}:`,
          urlError
        );
        // Log error and return null
      } else {
        signedUrl = urlData.signedUrl;
      }
    }

    const processedCard = {
      ...cardData,
      signedImageUrl: signedUrl, // Add the signed URL to the object
    };
    // --- End Generate Signed URL ---

    console.log(`Fetched kanban card ${cardId} successfully.`);
    return { data: processedCard, error: null };
  } catch (e: any) {
    console.error("Unexpected error fetching kanban card:", e);
    return {
      data: null,
      error: { message: `Unexpected error: ${e.message || e}` },
    };
  }
}
