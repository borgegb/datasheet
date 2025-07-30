"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation"; // If needed later
import { createClient as createServerActionClient } from "@/lib/supabase/server";
// --- Import Supabase client explicitly for admin client ---
import { createClient } from "@supabase/supabase-js";
// ---------------------------------------------------------

// --- Action to get user's organization ID ---
// (Needed by other actions, avoids repeating logic)
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

// --- Action to Fetch Products ---
export async function fetchProductsForOrg(catalogId?: string | null) {
  const supabase = await createServerActionClient();
  const organizationId = await getUserOrgId(supabase);

  if (!organizationId) {
    return { data: [], error: { message: "User organization not found." } };
  }

  let query = supabase
    .from("products")
    .select("id, product_title, product_code, pdf_storage_path, category_ids")
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

  const processedData =
    data?.map((product) => ({
      ...product,
      category_ids: product.category_ids ?? [],
    })) || [];

  return { data: processedData, error };
}

// --- Action to Fetch Catalogs ---
interface CatalogInfo {
  id: string;
  name: string;
  image_path: string | null;
  signedImageUrl?: string | null; // Add optional signed URL field
}

export async function fetchCatalogsForOrg(): Promise<{
  data: CatalogInfo[];
  error: { message: string } | null;
}> {
  const supabase = await createServerActionClient();
  const organizationId = await getUserOrgId(supabase);

  if (!organizationId) {
    return { data: [], error: { message: "User organization not found." } };
  }

  const { data: catalogsData, error: fetchError } = await supabase
    .from("catalogs")
    .select(
      `
      id,
      name,
      image_path 
    `
    )
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });

  if (fetchError) {
    console.error("Server Action Error (fetchCatalogsForOrg):", fetchError);
    return {
      data: [],
      error: { message: `Database error: ${fetchError.message}` },
    };
  }

  if (!catalogsData) {
    return { data: [], error: null }; // No catalogs found
  }

  // --- Generate Signed URLs ---
  const processedData = await Promise.all(
    catalogsData.map(async (catalog) => {
      let signedUrl = null;
      if (catalog.image_path) {
        const { data: urlData, error: urlError } = await supabase.storage
          .from("datasheet-assets") // Ensure this is your bucket name
          .createSignedUrl(catalog.image_path, 60 * 5); // 5 minutes expiry

        if (urlError) {
          console.error(
            `Error generating signed URL for ${catalog.image_path}:`,
            urlError
          );
          // Decide how to handle: return null URL, or maybe even filter out?
          // For now, just log error and return null.
        } else {
          signedUrl = urlData.signedUrl;
        }
      }
      return {
        ...catalog,
        signedImageUrl: signedUrl, // Add the signed URL to the object
      };
    })
  );
  // --- End Generate Signed URLs ---

  return { data: processedData, error: null };
}

// --- ADD fetchCategories action ---
export async function fetchCategories() {
  "use server";
  const supabase = await createServerActionClient();

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

// --- ADD createCategory action ---
export async function createCategory(categoryName: string) {
  "use server";
  const supabase = await createServerActionClient();

  // 1. Get current user
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    console.error("Create Category Error: User not authenticated.");
    return { error: { message: "Authentication required." } };
  }
  const userId = userData.user.id;

  // 2. Verify user is owner
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, organization_id") // Need role, and org_id if categories were org-specific
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    console.error(
      `Create Category Error: Profile not found for user ${userId}.`,
      profileError
    );
    return { error: { message: "User profile not found." } };
  }

  if (profile.role !== "owner") {
    console.warn(`Create Category Denied: User ${userId} is not an owner.`);
    return {
      error: { message: "Only organization owners can create categories." },
    };
  }

  // 3. Validate input
  const trimmedName = categoryName.trim();
  if (!trimmedName) {
    return { error: { message: "Category name cannot be empty." } };
  }

  // 4. Insert into DB (assuming global categories for now)
  // If org-specific, add .insert({ name: trimmedName, organization_id: profile.organization_id })
  const { data, error } = await supabase
    .from("categories")
    .insert({ name: trimmedName })
    .select("id") // Optionally return the new ID
    .single();

  if (error) {
    console.error("Server Action Error (createCategory):", error);
    // Handle potential unique constraint violation more gracefully?
    if (error.code === "23505") {
      // unique_violation
      return {
        error: { message: `Category '${trimmedName}' already exists.` },
      };
    }
    return { error: { message: `Database error: ${error.message}` } };
  }

  // 5. Revalidate relevant paths
  revalidatePath("/dashboard/organization");
  revalidatePath("/dashboard/generator"); // Revalidate generator form (for dropdowns)

  console.log(`Category '${trimmedName}' created successfully.`);
  return { data, error: null }; // Return the new category ID
}
// ---                         ---

// --- ADD updateCategory action ---
export async function updateCategory(categoryId: string, newName: string) {
  "use server";
  const supabase = await createServerActionClient();

  // 1. Get current user & verify owner (similar to createCategory)
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return { error: { message: "Authentication required." } };
  }
  const userId = userData.user.id;
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if (profileError || !profile) {
    return { error: { message: "User profile not found." } };
  }
  if (profile.role !== "owner") {
    return {
      error: { message: "Only organization owners can update categories." },
    };
  }

  // 2. Validate input
  const trimmedName = newName.trim();
  if (!trimmedName) {
    return { error: { message: "Category name cannot be empty." } };
  }
  if (!categoryId) {
    return { error: { message: "Category ID is required." } };
  }

  // 3. Update in DB
  const { data, error } = await supabase
    .from("categories")
    .update({ name: trimmedName })
    .eq("id", categoryId)
    .select("id") // Optionally return the updated ID
    .single();

  if (error) {
    console.error("Server Action Error (updateCategory):", error);
    if (error.code === "23505") {
      // unique_violation
      return {
        error: { message: `Category name '${trimmedName}' already exists.` },
      };
    }
    return { error: { message: `Database error: ${error.message}` } };
  }

  // 4. Revalidate paths
  revalidatePath("/dashboard/organization");
  revalidatePath("/dashboard/generator");

  console.log(`Category '${trimmedName}' updated successfully.`);
  return { data, error: null };
}
// ---                         ---

// --- ADD deleteCategory action ---
export async function deleteCategory(categoryId: string) {
  "use server";
  const supabase = await createServerActionClient();

  // 1. Get current user & verify owner (similar to createCategory)
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return { error: { message: "Authentication required." } };
  }
  const userId = userData.user.id;
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if (profileError || !profile) {
    return { error: { message: "User profile not found." } };
  }
  if (profile.role !== "owner") {
    return {
      error: { message: "Only organization owners can delete categories." },
    };
  }

  // 2. Validate input
  if (!categoryId) {
    return { error: { message: "Category ID is required for deletion." } };
  }

  // 3. Delete from DB
  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId);

  if (error) {
    console.error("Server Action Error (deleteCategory):", error);
    // Check for foreign key violation (if category is in use)
    // Supabase error code for foreign_key_violation is '23503'
    if (error.code === "23503") {
      return {
        error: {
          message:
            "This category is currently in use by products and cannot be deleted.",
        },
      };
    }
    return { error: { message: `Database error: ${error.message}` } };
  }

  // 4. Revalidate paths
  revalidatePath("/dashboard/organization");
  revalidatePath("/dashboard/generator");

  console.log(`Category ID '${categoryId}' deleted successfully.`);
  return { error: null }; // No data to return on successful delete
}
// ---                         ---

// --- Action to Create Catalog ---
export async function createCatalog(
  catalogName: string,
  imagePath?: string | null
) {
  const supabase = await createServerActionClient();

  // --- Add Owner Verification ---
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return { error: { message: "Authentication required." } };
  }
  const userId = userData.user.id;
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, organization_id") // Ensure organization_id is selected
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    return { error: { message: "User profile not found." } };
  }
  if (profile.role !== "owner") {
    return {
      error: { message: "Only organization owners can create catalogs." },
    };
  }
  if (!profile.organization_id) {
    return {
      error: { message: "User is not associated with an organization." },
    }; // Should not happen if owner
  }
  const organizationId = profile.organization_id;
  // --- End Owner Verification ---

  if (!catalogName?.trim()) {
    return { error: { message: "Catalog name cannot be empty." } };
  }
  // organizationId is now available from the profile check above, no need for getUserOrgId(supabase)

  const { data, error } = await supabase
    .from("catalogs")
    .insert({
      name: catalogName.trim(),
      organization_id: organizationId, // Use organizationId from profile
      image_path: imagePath,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Server Action Error (createCatalog):", error);
    return { error };
  }

  revalidatePath("/dashboard/catalogs");
  revalidatePath("/dashboard/generator");
  return { data, error: null };
}

// --- ADD updateCatalog action ---
export async function updateCatalog(
  catalogId: string,
  newName: string,
  newImagePath?: string | null // Optional new image path
) {
  "use server";
  const supabase = await createServerActionClient();

  // 1. Verify user is owner
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return { error: { message: "Authentication required." } };
  }
  const userId = userData.user.id;
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, organization_id")
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    return { error: { message: "User profile not found." } };
  }
  if (profile.role !== "owner") {
    return {
      error: { message: "Only organization owners can update catalogs." },
    };
  }
  if (!profile.organization_id) {
    return { error: { message: "User organization context missing." } };
  }

  // 2. Validate input
  const trimmedName = newName.trim();
  if (!trimmedName) {
    return { error: { message: "Catalog name cannot be empty." } };
  }
  if (!catalogId) {
    return { error: { message: "Catalog ID is required." } };
  }

  // 3. Fetch current catalog data (to check old image path if needed)
  const { data: currentCatalog, error: fetchCurrentError } = await supabase
    .from("catalogs")
    .select("image_path")
    .eq("id", catalogId)
    .eq("organization_id", profile.organization_id) // Ensure it belongs to the user's org
    .single();

  if (fetchCurrentError) {
    console.error(
      "Error fetching current catalog for update:",
      fetchCurrentError
    );
    return { error: { message: "Could not find the catalog to update." } };
  }

  // 4. Prepare update payload
  const updatePayload: { name: string; image_path?: string | null } = {
    name: trimmedName,
  };
  // Only include image_path in update if it's explicitly provided (even if null)
  if (newImagePath !== undefined) {
    updatePayload.image_path = newImagePath;
  }

  // 5. Update DB
  const { data, error: updateError } = await supabase
    .from("catalogs")
    .update(updatePayload)
    .eq("id", catalogId)
    .eq("organization_id", profile.organization_id) // Redundant check, but good practice
    .select("id")
    .single();

  if (updateError) {
    console.error("Server Action Error (updateCatalog):", updateError);
    return {
      error: {
        message: `Database error updating catalog: ${updateError.message}`,
      },
    };
  }

  // 6. Handle old image deletion (if image path changed)
  const oldImagePath = currentCatalog?.image_path;
  if (
    newImagePath !== undefined &&
    oldImagePath &&
    oldImagePath !== newImagePath
  ) {
    console.log(`Deleting old catalog image: ${oldImagePath}`);
    const { error: deleteImageError } = await supabase.storage
      .from("datasheet-assets") // Use correct bucket name
      .remove([oldImagePath]);
    if (deleteImageError) {
      console.error("Failed to delete old catalog image:", deleteImageError);
      // Non-fatal error, maybe log it but don't block the update success message?
      // toast.warning("Catalog updated, but failed to delete old image."); // Can't use toast on server
    }
  }

  // 7. Revalidate paths
  revalidatePath("/dashboard/catalogs");
  revalidatePath("/dashboard/generator"); // Dropdown might need update

  console.log(`Catalog '${trimmedName}' updated successfully.`);
  return { data, error: null };
}
// ---                         ---

// --- ADD deleteCatalog action ---
export async function deleteCatalog(catalogId: string) {
  "use server";
  const supabase = await createServerActionClient();

  // 1. Verify user is owner
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return { error: { message: "Authentication required." } };
  }
  const userId = userData.user.id;
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, organization_id")
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    return { error: { message: "User profile not found." } };
  }
  if (profile.role !== "owner") {
    return {
      error: { message: "Only organization owners can delete catalogs." },
    };
  }
  if (!profile.organization_id) {
    return { error: { message: "User organization context missing." } };
  }

  // 2. Validate input
  if (!catalogId) {
    return { error: { message: "Catalog ID is required for deletion." } };
  }

  // 3. Fetch catalog info (mainly for image path)
  const { data: catalogToDelete, error: fetchError } = await supabase
    .from("catalogs")
    .select("image_path")
    .eq("id", catalogId)
    .eq("organization_id", profile.organization_id)
    .single();

  if (fetchError) {
    console.error("Error fetching catalog for deletion:", fetchError);
    // If not found, maybe it was already deleted? Treat as success? Or specific error?
    return { error: { message: "Could not find the catalog to delete." } };
  }

  // 4. Delete from DB
  const { error: deleteDbError } = await supabase
    .from("catalogs")
    .delete()
    .eq("id", catalogId)
    .eq("organization_id", profile.organization_id);

  if (deleteDbError) {
    console.error("Server Action Error (deleteCatalog - DB):", deleteDbError);
    // Check for foreign key violation (if catalog is in use by products)
    if (deleteDbError.code === "23503") {
      return {
        error: {
          message:
            "This catalog is currently in use by products and cannot be deleted.",
        },
      };
    }
    return {
      error: {
        message: `Database error deleting catalog: ${deleteDbError.message}`,
      },
    };
  }

  // 5. Delete associated image from storage (if exists)
  if (catalogToDelete?.image_path) {
    console.log(`Deleting catalog image: ${catalogToDelete.image_path}`);
    const { error: deleteImageError } = await supabase.storage
      .from("datasheet-assets") // Use correct bucket name
      .remove([catalogToDelete.image_path]);
    if (deleteImageError) {
      console.error("Failed to delete catalog image:", deleteImageError);
      // Non-fatal? Log and continue, or return a warning?
    }
  }

  // 6. Revalidate paths
  revalidatePath("/dashboard/catalogs");
  revalidatePath("/dashboard/generator"); // Dropdown might need update

  console.log(`Catalog ID '${catalogId}' deleted successfully.`);
  return { error: null };
}
// ---                         ---

// --- ADD fetchCatalogById action ---
interface CatalogDetails {
  id: string;
  name: string;
  // Add other fields if needed later
}

export async function fetchCatalogById(catalogId: string): Promise<{
  data: CatalogDetails | null;
  error: { message: string } | null;
}> {
  "use server";
  const supabase = await createServerActionClient();
  const organizationId = await getUserOrgId(supabase);

  if (!organizationId) {
    return { data: null, error: { message: "User organization not found." } };
  }
  if (!catalogId) {
    return { data: null, error: { message: "Catalog ID is required." } };
  }

  const { data, error } = await supabase
    .from("catalogs")
    .select("id, name") // Select fields needed for display
    .eq("id", catalogId)
    .eq("organization_id", organizationId) // Ensure user can only fetch from their org
    .single();

  if (error) {
    console.error(
      `Server Action Error (fetchCatalogById: ${catalogId}):`,
      error
    );
    if (error.code === "PGRST116") {
      // Not found
      return { data: null, error: { message: "Catalog not found." } };
    }
    return {
      data: null,
      error: { message: `Database error: ${error.message}` },
    };
  }

  return { data, error: null };
}
// ---                         ---

// --- Action to Delete Products ---
export async function deleteProducts(productIds: string[]) {
  if (!productIds || productIds.length === 0) {
    return { error: { message: "No product IDs provided for deletion." } };
  }

  const supabase = await createServerActionClient();
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

// --- Action to Fetch Product COUNT for Org ---
export async function fetchProductCountForOrg() {
  "use server";
  const supabase = await createServerActionClient();
  const organizationId = await getUserOrgId(supabase);

  if (!organizationId) {
    return { count: 0, error: { message: "User organization not found." } };
  }

  const { count, error } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true }) // Select only count
    .eq("organization_id", organizationId);

  if (error) {
    console.error("Server Action Error (fetchProductCountForOrg):", error);
    return { count: 0, error };
  }

  return { count: count ?? 0, error: null };
}
// ---                         ---

// --- Action to Fetch Catalog COUNT for Org ---
export async function fetchCatalogCountForOrg() {
  "use server";
  const supabase = await createServerActionClient();
  const organizationId = await getUserOrgId(supabase);

  if (!organizationId) {
    return { count: 0, error: { message: "User organization not found." } };
  }

  const { count, error } = await supabase
    .from("catalogs")
    .select("id", { count: "exact", head: true }) // Select only count
    .eq("organization_id", organizationId);

  if (error) {
    console.error("Server Action Error (fetchCatalogCountForOrg):", error);
    return { count: 0, error };
  }

  return { count: count ?? 0, error: null };
}
// ---                         ---

// --- Action to Fetch RECENT Products for Org ---
interface RecentProduct {
  id: string;
  product_title: string | null;
  product_code: string | null;
  updated_at: string | null; // Or created_at depending on desired logic
  pdf_storage_path: string | null; // Add PDF path
}

export async function fetchRecentProductsForOrg(limit: number = 5): Promise<{
  data: RecentProduct[];
  error: { message: string } | null;
}> {
  "use server";
  const supabase = await createServerActionClient();
  const organizationId = await getUserOrgId(supabase);

  if (!organizationId) {
    return { data: [], error: { message: "User organization not found." } };
  }

  const { data, error } = await supabase
    .from("products")
    // Select the necessary fields including pdf_storage_path
    .select("id, product_title, product_code, updated_at, pdf_storage_path")
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    console.error("Server Action Error (fetchRecentProductsForOrg):", error);
    return { data: [], error: { message: `Database error: ${error.message}` } };
  }

  return { data: data ?? [], error: null };
}
// ---                         ---

// --- Define State Type for saveDatasheet ---
type SaveDatasheetState = {
  data: any | null; // Can be product data on success/update, or null
  error: { message: string } | null; // Can be error object or null
};
// ----------------------------------------

// --- Action to Save/Update Datasheet (Product) ---
export async function saveDatasheet(
  prevState: SaveDatasheetState | null,
  formData: FormData
): Promise<SaveDatasheetState> {
  const supabase = await createServerActionClient();

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

  // --- Extract and parse category IDs ---
  let categoryIds: string[] = [];
  const categoryIdsJson = formData.get("categoryIdsJson") as string | null;
  if (categoryIdsJson) {
    try {
      categoryIds = JSON.parse(categoryIdsJson);
      if (!Array.isArray(categoryIds)) {
        console.warn(
          "Parsed categoryIdsJson is not an array, defaulting to empty."
        );
        categoryIds = [];
      }
    } catch (e) {
      console.error("Error parsing categoryIdsJson:", e);
      return {
        data: null,
        error: { message: "Invalid category data format." },
      };
    }
  }
  // -----------------------------------

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
    optional_logos: {
      includeIrelandLogo: formData.get("includeIrelandLogo") === "on",
      ceMark: formData.get("includeCeLogo") === "on",
      origin: formData.get("includeOriginLogo") === "on",
      includeAppliedLogo: formData.get("includeAppliedLogo") === "on",
    },
    catalog_id: formData.get("catalogId") as string | null,
    image_path: formData.get("imagePath") as string | null,
    user_id: userId,
    organization_id: organizationId,
    category_ids: categoryIds,
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
      const { data: updateData, error: updateError } = await supabase
        .from("products")
        .update({ ...productData, updated_at: new Date().toISOString() })
        .eq("id", editingProductId)
        .eq("organization_id", organizationId)
        .select()
        .single();

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
        .insert(productData)
        .select()
        .single();

      data = insertData;
      error = insertError;
      if (!error) {
        console.log("Product inserted successfully:", data);
      }
    }

    if (error) {
      console.error("Error saving datasheet:", error);
      return {
        data: null,
        error: { message: `Database error: ${error.message}` },
      };
    }

    revalidatePath("/dashboard/products");
    const resultId = editingProductId || data?.id;
    if (resultId) {
      revalidatePath(`/dashboard/generator/${resultId}`);
    }
    revalidatePath("/dashboard/generator");
    return { data, error: null };
  } catch (e: any) {
    console.error("Unexpected error saving datasheet:", e);
    return {
      data: null,
      error: { message: `Unexpected error: ${e.message || e}` },
    };
  }
}

// --- ADD fetchProductById action ---
export async function fetchProductById(productId: string) {
  "use server";

  if (!productId) {
    return { data: null, error: { message: "Product ID is required." } };
  }

  const supabase = await createServerActionClient();

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

// --- Action to Invite User to Organization ---
type InviteUserResult = { error: { message: string } | null };

export async function inviteUserToOrg(
  emailToInvite: string,
  roleToInvite: string = "member"
): Promise<InviteUserResult> {
  "use server";

  // Basic email validation
  if (
    !emailToInvite ||
    !/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(emailToInvite)
  ) {
    return { error: { message: "Invalid email format." } };
  }

  // Role validation
  const allowedRoles = ["member", "viewer"];
  if (!allowedRoles.includes(roleToInvite)) {
    return { error: { message: "Invalid role specified. Must be 'member' or 'viewer'." } };
  }

  const supabase = await createServerActionClient();

  try {
    // 1. Get current user and their profile (including role and org id)
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      console.error("Invite Error: User not authenticated.");
      return { error: { message: "Authentication required." } };
    }
    const userId = userData.user.id;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("organization_id, role")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      console.error(
        `Invite Error: Profile not found for user ${userId}.`,
        profileError
      );
      return { error: { message: "User profile not found." } };
    }

    // 2. Check if the current user is an owner and has an organization
    if (profile.role !== "owner") {
      console.warn(`Invite Attempt Denied: User ${userId} is not an owner.`);
      return {
        error: { message: "Only organization owners can invite users." },
      };
    }
    if (!profile.organization_id) {
      console.error(
        `Invite Error: Owner ${userId} does not have an organization_id.`
      );
      return { error: { message: "Organization information missing." } };
    }
    const ownerOrgId = profile.organization_id;

    // 3. Call the admin invite function
    // --- Create explicit admin client for this specific call ---
    const supabaseAdmin = createClient(
      // Use imported createClient
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!, // Ensure this key is correct!
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    // ---------------------------------------------------------

    console.log(`Inviting ${emailToInvite} to organization ${ownerOrgId}...`);
    // --- Use the supabaseAdmin client ---
    const { data: inviteData, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(
        // ----------------------------------
        emailToInvite,
        {
          data: {
            initial_organization_id: ownerOrgId,
            initial_role: roleToInvite, // Use the provided role
          },
          redirectTo: "/dashboard", // Where user lands after confirming invite
        }
      );

    // 4. Handle invite result
    if (inviteError) {
      console.error(`Invite Error for ${emailToInvite}:`, inviteError);
      // Provide more specific feedback if possible
      if (inviteError.message.includes("already registered")) {
        return {
          error: { message: `User ${emailToInvite} is already registered.` },
        };
      }
      if (inviteError.message.includes("Unable to validate email address")) {
        return { error: { message: "Invalid email format provided." } };
      }
      return {
        error: { message: `Failed to send invitation: ${inviteError.message}` },
      };
    }

    console.log(
      `Invitation sent successfully to ${emailToInvite} with role '${roleToInvite}'. Data:`,
      inviteData
    );
    return { error: null }; // Success
  } catch (e: any) {
    console.error("Unexpected error inviting user:", e);
    return {
      error: { message: `An unexpected error occurred: ${e.message || e}` },
    };
  }
}
// --- End Invite User Action ---

// --- Action to Fetch Organization Members ---
// Define a type for the member data we want to return
type OrgMember = {
  id: string;
  full_name: string | null;
  email: string | null; // We might need to fetch this from auth.users
  role: string | null;
};

type FetchMembersResult = {
  data: OrgMember[];
  error: { message: string } | null;
};

export async function fetchOrgMembers(): Promise<FetchMembersResult> {
  "use server";

  const supabase = await createServerActionClient(); // Use server action client for initial checks

  try {
    // 1. Get current user and their organization ID (using server action client)
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return { data: [], error: { message: "Authentication required." } };
    }
    const userId = userData.user.id;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .single();

    if (profileError || !profile?.organization_id) {
      console.error(
        `FetchMembers Error: Org ID not found for user ${userId}.`,
        profileError
      );
      return { data: [], error: { message: "User organization not found." } };
    }
    const organizationId = profile.organization_id;

    // 2. Fetch profiles belonging to the same organization (using server action client)
    const { data: membersData, error: membersError } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("organization_id", organizationId)
      .order("role", { ascending: true })
      .order("full_name", { ascending: true });

    if (membersError) {
      console.error(
        `FetchMembers Error: Failed fetching profiles for org ${organizationId}.`,
        membersError
      );
      return {
        data: [],
        error: { message: `Database error: ${membersError.message}` },
      };
    }

    if (!membersData) {
      return { data: [], error: null };
    }

    // 3. Fetch emails for the members (using EXPLICIT admin client)
    // --- Create explicit admin client ---
    const supabaseAdmin = createClient(
      // Use imported createClient
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!, // Ensure this key is correct!
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    // ----------------------------------

    const memberIds = membersData.map((m) => m.id);
    let emailsMap = new Map<string, string | null>();

    if (memberIds.length > 0) {
      // --- Use supabaseAdmin and await ---
      const { data: usersData, error: usersError } =
        await supabaseAdmin.auth.admin.listUsers({
          // ... potential pagination ...
        });
      // ---------------------------------

      if (usersError) {
        console.error(
          `FetchMembers Warning: Failed fetching user emails for org ${organizationId}.`,
          usersError
        );
      } else if (usersData?.users) {
        // --- Add explicit type for user ---
        usersData.users.forEach((user: { id: string; email?: string }) => {
          // --------------------------------
          if (memberIds.includes(user.id)) {
            emailsMap.set(user.id, user.email || null);
          }
        });
      }
    }

    // 4. Combine profile data with email data
    const combinedMembers = membersData.map((member) => ({
      ...member,
      email: emailsMap.get(member.id) || null,
    }));

    return { data: combinedMembers, error: null };
  } catch (e: any) {
    console.error("Unexpected error fetching organization members:", e);
    return {
      data: [],
      error: { message: `An unexpected error occurred: ${e.message || e}` },
    };
  }
}

// --- End Fetch Org Members Action ---

// --- Action to Remove Product from Catalog ---
export async function removeProductFromCatalog(productId: string) {
  "use server";
  const supabase = await createServerActionClient();

  // 1. Get current user and verify they have access
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return { error: { message: "Authentication required." } };
  }
  const userId = userData.user.id;

  // 2. Get user's organization ID
  const organizationId = await getUserOrgId(supabase);
  if (!organizationId) {
    return { error: { message: "User organization not found." } };
  }

  // 3. Validate input
  if (!productId) {
    return { error: { message: "Product ID is required." } };
  }

  // 4. Verify the product belongs to the user's organization before updating
  const { data: productCheck, error: checkError } = await supabase
    .from("products")
    .select("id, product_title, catalog_id")
    .eq("id", productId)
    .eq("organization_id", organizationId)
    .single();

  if (checkError || !productCheck) {
    console.error("Error checking product ownership:", checkError);
    return { error: { message: "Product not found or access denied." } };
  }

  // 5. Check if product is actually in a catalog
  if (!productCheck.catalog_id) {
    return {
      error: { message: "Product is not currently assigned to any catalog." },
    };
  }

  // 6. Update the product to remove catalog assignment
  const { data, error: updateError } = await supabase
    .from("products")
    .update({
      catalog_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId)
    .eq("organization_id", organizationId) // Double-check organization
    .select("id, product_title")
    .single();

  if (updateError) {
    console.error(
      "Server Action Error (removeProductFromCatalog):",
      updateError
    );
    return {
      error: {
        message: `Database error removing product from catalog: ${updateError.message}`,
      },
    };
  }

  // 7. Revalidate relevant paths
  revalidatePath("/dashboard/products"); // Products list page
  revalidatePath("/dashboard/catalogs"); // Catalogs page
  // Note: We can't revalidate the specific catalog page since we don't have the catalog ID
  // But the client will handle local state updates

  console.log(
    `Product '${productCheck.product_title}' removed from catalog successfully.`
  );
  return { data, error: null };
}
// --- End Remove Product from Catalog Action ---
