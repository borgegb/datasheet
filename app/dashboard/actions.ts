"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation"; // If needed later
import { createClient } from "@/lib/supabase/server";

// --- Action to get user's organization ID ---
// (Needed by other actions, avoids repeating logic)
async function getUserOrgId(
  supabase: Awaited<ReturnType<typeof createClient>>
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

// --- Action to Fetch Products ---
export async function fetchProductsForOrg(catalogId?: string | null) {
  const supabase = await createClient();
  const organizationId = await getUserOrgId(supabase);

  if (!organizationId) {
    return { data: [], error: { message: "User organization not found." } };
  }

  let query = supabase
    .from("products")
    .select("id, product_title, product_code, pdf_storage_path")
    .eq("organization_id", organizationId);

  // Conditionally add the catalog filter if provided
  if (catalogId) {
    query = query.eq("catalog_id", catalogId);
    console.log("Filtering products by catalog:", catalogId);
  } else {
    console.log("Fetching all products for org, no catalog filter.");
  }

  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;

  if (error) {
    console.error("Server Action Error (fetchProductsForOrg):", error);
  }

  return { data: data ?? [], error };
}

// --- Action to Fetch Catalogs ---
export async function fetchCatalogsForOrg() {
  const supabase = await createClient();
  const organizationId = await getUserOrgId(supabase);

  if (!organizationId) {
    return { data: [], error: { message: "User organization not found." } };
  }

  const { data, error } = await supabase
    .from("catalogs")
    .select("id, name")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });

  if (error) {
    console.error("Server Action Error (fetchCatalogsForOrg):", error);
  }

  return { data: data ?? [], error };
}

// --- ADD fetchCategories action ---
export async function fetchCategories() {
  "use server";
  const supabase = await createClient();

  // Assuming categories are global for now
  // Add .eq("organization_id", organizationId) if they become org-specific
  const { data, error } = await supabase
    .from("categories")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) {
    console.error("Server Action Error (fetchCategories):", error);
    // Return an empty array on error, or handle differently?
    return { data: [], error };
  }

  return { data: data ?? [], error: null };
}
// ---                           ---

// --- Action to Create Catalog ---
export async function createCatalog(catalogName: string) {
  const supabase = await createClient();
  const organizationId = await getUserOrgId(supabase);

  if (!catalogName?.trim()) {
    return { error: { message: "Catalog name cannot be empty." } };
  }
  if (!organizationId) {
    return { error: { message: "User organization not found." } };
  }

  const { data, error } = await supabase
    .from("catalogs")
    .insert({ name: catalogName.trim(), organization_id: organizationId })
    .select("id") // Optionally return the new ID
    .single();

  if (error) {
    console.error("Server Action Error (createCatalog):", error);
    return { error };
  }

  revalidatePath("/dashboard/catalogs"); // Revalidate the catalogs page
  revalidatePath("/dashboard/generator"); // Revalidate generator form (for dropdown)
  return { data, error: null };
}

// --- Action to Delete Products ---
export async function deleteProducts(productIds: string[]) {
  if (!productIds || productIds.length === 0) {
    return { error: { message: "No product IDs provided for deletion." } };
  }

  const supabase = await createClient();
  const organizationId = await getUserOrgId(supabase);

  if (!organizationId) {
    return { error: { message: "User organization not found." } };
  }

  // Important: Ensure user can only delete products within their org
  // The .in() filter combined with the .eq() should implicitly handle this
  // because the RLS policy on products checks the organization_id.
  // Double-check RLS policy on `products` ensures USING checks org_id.
  const { error } = await supabase
    .from("products")
    .delete()
    .in("id", productIds)
    .eq("organization_id", organizationId); // Ensure org match

  if (error) {
    console.error("Server Action Error (deleteProducts):", error);
    return { error };
  }

  revalidatePath("/dashboard/products"); // Revalidate the products list page
  return { error: null };
}

// --- Define State Type for saveDatasheet ---
type SaveDatasheetState = {
  data: any | null; // Can be product data on success/update, or null
  error: { message: string } | null; // Can be error object or null
};
// ----------------------------------------

// --- Action to Save/Update Datasheet (Product) ---
// Update signature to accept previous state and FormData
export async function saveDatasheet(
  prevState: SaveDatasheetState | null, // Use the defined type
  formData: FormData // Use FormData directly
): Promise<SaveDatasheetState> {
  // Use the defined type
  const supabase = await createClient();

  // Get current user
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user?.id) {
    console.error("User not authenticated for saveDatasheet:", userError);
    return { data: null, error: { message: "User not authenticated." } };
  }
  const userId = userData.user.id;

  // Get user's organization ID
  const organizationId = await getUserOrgId(supabase);
  if (!organizationId) {
    console.error("User organization not found:");
    return { data: null, error: { message: "User organization not found." } };
  }

  // Extract editingProductId if present
  const editingProductId = formData.get("editingProductId") as string | null;

  // Prepare data object for Supabase
  const productData = {
    product_title: formData.get("productTitle") as string,
    product_code: formData.get("productCode") as string,
    price: formData.get("price") as string | null,
    weight: formData.get("weight") as string | null,
    description: formData.get("description") as string | null,
    key_features: formData.get("keyFeatures") as string | null,
    tech_specs: formData.get("techSpecs") as string | null,
    warranty: formData.get("warranty") as string | null,
    shipping_info: formData.get("shippingInfo") as string | null,
    image_orientation: formData.get("imageOrientation") as
      | "portrait"
      | "landscape"
      | null,
    // Construct JSONB object for optional logos
    optional_logos: {
      includeIrelandLogo: formData.get("includeIrelandLogo") === "on",
      ceMark: formData.get("includeCeLogo") === "on",
      origin: formData.get("includeOriginLogo") === "on",
    },
    catalog_id: formData.get("catalogId") as string | null,
    image_path: formData.get("imagePath") as string | null,
    user_id: userId, // Always associate with the current user
    organization_id: organizationId, // Associate with the user's org
    // updated_at will be set by the database or manually below
    // created_at is handled by default DB value on insert
  };

  // --- Input Validation (Example) ---
  if (
    !productData.product_title ||
    !productData.product_code ||
    !productData.description
  ) {
    return {
      data: null,
      error: { message: "Product Title, Code, and Description are required." },
    };
  }
  // --- End Validation ---

  // Perform Insert or Update
  let error: any = null;
  let data: any = null;

  try {
    if (editingProductId) {
      // --- UPDATE ---
      console.log(`Updating product ID: ${editingProductId}`);
      // Exclude user_id and organization_id from update payload if they shouldn't change
      // Or rely on RLS to prevent changing them if the user isn't allowed
      const { data: updateData, error: updateError } = await supabase
        .from("products")
        .update({ ...productData, updated_at: new Date().toISOString() })
        .eq("id", editingProductId)
        .eq("organization_id", organizationId) // Ensure update is within user's org
        .select() // Optionally select the updated data
        .single(); // Assuming update affects one row

      data = updateData;
      error = updateError;
      if (!error) {
        console.log("Product updated successfully:", data);
      }
    } else {
      // --- INSERT ---
      console.log("Inserting new product...");
      const { data: insertData, error: insertError } = await supabase
        .from("products")
        .insert(productData) // organization_id and user_id are included here
        .select() // Select the inserted data (including new ID)
        .single(); // Assuming insert affects one row

      data = insertData;
      error = insertError;
      if (!error) {
        console.log("Product inserted successfully:", data);
      }
    }

    // Check for errors from DB operation
    if (error) {
      console.error("Error saving datasheet:", error);
      return {
        data: null,
        error: { message: `Database error: ${error.message}` },
      };
    }

    // Revalidate and return success
    revalidatePath("/dashboard/products"); // Revalidate the products list page
    // Revalidate the specific generator page (for create or update)
    const resultId = editingProductId || data?.id;
    if (resultId) {
      revalidatePath(`/dashboard/generator/${resultId}`);
    }
    revalidatePath("/dashboard/generator"); // Revalidate the base generator page (if needed)
    return { data, error: null }; // Fits SaveDatasheetState
  } catch (e: any) {
    console.error("Unexpected error saving datasheet:", e);
    return {
      data: null,
      error: { message: `Unexpected error: ${e.message || e}` },
    }; // Fits SaveDatasheetState
  }
}

// --- ADD fetchProductById action ---
export async function fetchProductById(productId: string) {
  "use server";

  if (!productId) {
    return { data: null, error: { message: "Product ID is required." } };
  }

  const supabase = await createClient();

  try {
    const { data: user, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.user?.id) {
      console.error("User not authenticated:", userError);
      return { data: null, error: { message: "User not authenticated" } };
    }

    // Fetch the product - ensure RLS allows this user to fetch this product
    // (e.g., based on user_id or organization_id link)
    const { data, error } = await supabase
      .from("products")
      .select("*") // Select all necessary fields for the form
      .eq("id", productId)
      // Optional: Add user/org check if RLS doesn't cover it fully
      // .eq('user_id', user.id)
      .single(); // Expect only one product

    if (error) {
      console.error(`Error fetching product ${productId}:`, error);
      if (error.code === "PGRST116") {
        // Code for "Resource Not Found"
        return { data: null, error: { message: "Product not found." } };
      }
      return {
        data: null,
        error: { message: `Database error: ${error.message}` },
      };
    }

    console.log(`Fetched product ${productId} successfully.`);
    return { data, error: null };
  } catch (e: any) {
    console.error("Unexpected error fetching product:", e);
    return {
      data: null,
      error: { message: `Unexpected error: ${e.message || e}` },
    };
  }
}
