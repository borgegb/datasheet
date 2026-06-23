"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServerActionClient } from "@/lib/supabase/server";
// --- Import Supabase client explicitly for admin client ---
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { VariantColumnDefinition } from "@/lib/datasheet/variant-table";
import {
  DEFAULT_CERTIFICATION_SETTINGS,
  mapCertificationSettingsRow,
  type CertificationSettings,
  type CertificationSettingsRow,
} from "@/lib/certifications/settings";
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

async function getOwnerOrgId(
  supabase: Awaited<ReturnType<typeof createServerActionClient>>
): Promise<{ organizationId: string | null; error: { message: string } | null }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return {
      organizationId: null,
      error: { message: "Authentication required." },
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, organization_id")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !profile) {
    return {
      organizationId: null,
      error: { message: "User profile not found." },
    };
  }

  if (profile.role !== "owner") {
    return {
      organizationId: null,
      error: { message: "Only organization owners can manage organization settings." },
    };
  }

  if (!profile.organization_id) {
    return {
      organizationId: null,
      error: { message: "User organization context missing." },
    };
  }

  return { organizationId: profile.organization_id, error: null };
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
  display_order?: number | null; // Add display order for drag and drop
}

export async function fetchCatalogsForOrg(): Promise<{
  data: CatalogInfo[];
  error: { message: string } | null;
}> {
  const start = Date.now();
  console.log("[fetchCatalogsForOrg] start");
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
      image_path,
      display_order
    `
    )
    .eq("organization_id", organizationId)
    .order("display_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true }); // Fallback for null display_order

  if (fetchError) {
    console.error("Server Action Error (fetchCatalogsForOrg):", fetchError);
    return {
      data: [],
      error: { message: `Database error: ${fetchError.message}` },
    };
  }

  if (!catalogsData) {
    console.log(
      "[fetchCatalogsForOrg] db returned 0 rows in",
      Date.now() - start,
      "ms"
    );
    return { data: [], error: null }; // No catalogs found
  }

  const afterDb = Date.now();
  console.log(
    "[fetchCatalogsForOrg] db returned",
    catalogsData.length,
    "rows in",
    afterDb - start,
    "ms"
  );

  // --- Generate Signed URLs (thumbnail transform) ---
  const signStart = Date.now();
  const processedData = await Promise.all(
    catalogsData.map(async (catalog) => {
      let signedUrl = null;
      if (catalog.image_path) {
        const { data: urlData, error: urlError } = await supabase.storage
          .from("datasheet-assets")
          .createSignedUrl(catalog.image_path, 60 * 5, {
            transform: {
              width: 512,
              height: 512,
              resize: "cover",
              quality: 75,
            },
          });

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
  const signEnd = Date.now();
  const signedCount = processedData.filter((c) => !!c.signedImageUrl).length;
  console.log(
    "[fetchCatalogsForOrg] signed",
    signedCount,
    "thumbnails in",
    signEnd - signStart,
    "ms; total",
    signEnd - start,
    "ms"
  );

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

export type OrganizationVariantColumn = VariantColumnDefinition & {
  id: string;
  displayOrder: number;
  archivedAt: string | null;
};

type VariantColumnRow = {
  id: string;
  key: string;
  label: string;
  placeholder: string | null;
  weight: number | string | null;
  display_order: number | null;
  archived_at: string | null;
};

const mapVariantColumnRow = (
  row: VariantColumnRow
): OrganizationVariantColumn => ({
  id: row.id,
  key: row.key,
  label: row.label,
  placeholder: row.placeholder || undefined,
  weight: (() => {
    const parsed =
      typeof row.weight === "number"
        ? row.weight
        : Number.parseFloat(String(row.weight || 14));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 14;
  })(),
  displayOrder: row.display_order ?? 0,
  archivedAt: row.archived_at,
});

export async function fetchVariantColumnsForOrg(
  includeArchived = false
): Promise<{
  data: OrganizationVariantColumn[];
  error: { message: string } | null;
}> {
  "use server";
  const supabase = await createServerActionClient();
  const organizationId = await getUserOrgId(supabase);

  if (!organizationId) {
    return { data: [], error: { message: "User organization not found." } };
  }

  const fetchRows = async () => {
    let query = supabase
      .from("variant_datasheet_columns")
      .select("id, key, label, placeholder, weight, display_order, archived_at")
      .eq("organization_id", organizationId);

    if (!includeArchived) {
      query = query.is("archived_at", null);
    }

    return query
      .order("archived_at", { ascending: true, nullsFirst: true })
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });
  };

  const { data, error } = await fetchRows();

  if (error) {
    console.error("Server Action Error (fetchVariantColumnsForOrg):", error);
    return { data: [], error: { message: `Database error: ${error.message}` } };
  }

  return {
    data: ((data || []) as VariantColumnRow[]).map(mapVariantColumnRow),
    error: null,
  };
}

export async function fetchCertificationSettingsForOrg(): Promise<{
  data: CertificationSettings;
  error: { message: string } | null;
}> {
  "use server";
  const supabase = await createServerActionClient();
  const organizationId = await getUserOrgId(supabase);

  if (!organizationId) {
    return {
      data: DEFAULT_CERTIFICATION_SETTINGS,
      error: { message: "User organization not found." },
    };
  }

  const { data, error } = await supabase
    .from("certification_settings")
    .select("template_revision, cat_ii_certificate_no, cat_iii_certificate_no")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("Server Action Error (fetchCertificationSettingsForOrg):", error);
    return {
      data: DEFAULT_CERTIFICATION_SETTINGS,
      error: { message: `Database error: ${error.message}` },
    };
  }

  return {
    data: mapCertificationSettingsRow(data as CertificationSettingsRow | null),
    error: null,
  };
}

export async function updateCertificationSettings(formData: FormData) {
  "use server";
  const supabase = await createServerActionClient();
  const { organizationId, error: ownerError } = await getOwnerOrgId(supabase);

  if (ownerError || !organizationId) {
    return { error: ownerError || { message: "User organization not found." } };
  }

  const templateRevision = String(
    formData.get("templateRevision") || ""
  ).trim();
  const catIiCertificateNo = String(
    formData.get("catIiCertificateNo") || ""
  ).trim();
  const catIiiCertificateNo = String(
    formData.get("catIiiCertificateNo") || ""
  ).trim();

  if (!templateRevision) {
    return { error: { message: "Template revision is required." } };
  }

  if (!catIiCertificateNo) {
    return { error: { message: "Cat. II certificate number is required." } };
  }

  if (!catIiiCertificateNo) {
    return { error: { message: "Cat. III certificate number is required." } };
  }

  const { data, error } = await supabase
    .from("certification_settings")
    .upsert(
      {
        organization_id: organizationId,
        template_revision: templateRevision,
        cat_ii_certificate_no: catIiCertificateNo,
        cat_iii_certificate_no: catIiiCertificateNo,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id" }
    )
    .select("organization_id")
    .single();

  if (error) {
    console.error("Server Action Error (updateCertificationSettings):", error);
    return { error: { message: `Database error: ${error.message}` } };
  }

  revalidatePath("/dashboard/organization");
  revalidatePath("/dashboard/certifications");
  return { data, error: null };
}

export async function createVariantColumn(label: string) {
  "use server";
  const supabase = await createServerActionClient();
  const { organizationId, error: ownerError } = await getOwnerOrgId(supabase);

  if (ownerError || !organizationId) {
    return { error: ownerError || { message: "User organization not found." } };
  }

  const trimmedLabel = label.trim();
  if (!trimmedLabel) {
    return { error: { message: "Variant column name cannot be empty." } };
  }

  const { data: existingColumns, error: orderError } = await supabase
    .from("variant_datasheet_columns")
    .select("display_order")
    .eq("organization_id", organizationId)
    .order("display_order", { ascending: false })
    .limit(1);

  if (orderError) {
    return { error: { message: `Database error: ${orderError.message}` } };
  }

  const maxDisplayOrder = existingColumns?.[0]?.display_order || 0;

  const { data, error } = await supabase
    .from("variant_datasheet_columns")
    .insert({
      organization_id: organizationId,
      key: `custom_${randomUUID()}`,
      label: trimmedLabel,
      placeholder: trimmedLabel,
      weight: 14,
      display_order: maxDisplayOrder + 10,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Server Action Error (createVariantColumn):", error);
    return { error: { message: `Database error: ${error.message}` } };
  }

  revalidatePath("/dashboard/organization");
  revalidatePath("/dashboard/generator");
  return { data, error: null };
}

export async function updateVariantColumn(columnId: string, label: string) {
  "use server";
  const supabase = await createServerActionClient();
  const { organizationId, error: ownerError } = await getOwnerOrgId(supabase);

  if (ownerError || !organizationId) {
    return { error: ownerError || { message: "User organization not found." } };
  }

  const trimmedLabel = label.trim();
  if (!trimmedLabel) {
    return { error: { message: "Variant column name cannot be empty." } };
  }

  const { data, error } = await supabase
    .from("variant_datasheet_columns")
    .update({
      label: trimmedLabel,
      placeholder: trimmedLabel,
      updated_at: new Date().toISOString(),
    })
    .eq("id", columnId)
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .select("id")
    .single();

  if (error) {
    console.error("Server Action Error (updateVariantColumn):", error);
    return { error: { message: `Database error: ${error.message}` } };
  }

  revalidatePath("/dashboard/organization");
  revalidatePath("/dashboard/generator");
  return { data, error: null };
}

export async function archiveVariantColumn(columnId: string) {
  "use server";
  const supabase = await createServerActionClient();
  const { organizationId, error: ownerError } = await getOwnerOrgId(supabase);

  if (ownerError || !organizationId) {
    return { error: ownerError || { message: "User organization not found." } };
  }

  const { data: targetColumn, error: targetError } = await supabase
    .from("variant_datasheet_columns")
    .select("archived_at")
    .eq("id", columnId)
    .eq("organization_id", organizationId)
    .single();

  if (targetError) {
    console.error("Server Action Error (archiveVariantColumn):", targetError);
    return { error: { message: `Database error: ${targetError.message}` } };
  }

  if (targetColumn.archived_at) {
    return { error: null };
  }

  const { count: activeColumnCount, error: countError } = await supabase
    .from("variant_datasheet_columns")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .is("archived_at", null);

  if (countError) {
    console.error("Server Action Error (archiveVariantColumn):", countError);
    return { error: { message: `Database error: ${countError.message}` } };
  }

  if ((activeColumnCount || 0) <= 1) {
    return {
      error: { message: "At least one active variant column is required." },
    };
  }

  const { error } = await supabase
    .from("variant_datasheet_columns")
    .update({
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", columnId)
    .eq("organization_id", organizationId);

  if (error) {
    console.error("Server Action Error (archiveVariantColumn):", error);
    return { error: { message: `Database error: ${error.message}` } };
  }

  revalidatePath("/dashboard/organization");
  revalidatePath("/dashboard/generator");
  return { error: null };
}

export async function restoreVariantColumn(columnId: string) {
  "use server";
  const supabase = await createServerActionClient();
  const { organizationId, error: ownerError } = await getOwnerOrgId(supabase);

  if (ownerError || !organizationId) {
    return { error: ownerError || { message: "User organization not found." } };
  }

  const { error } = await supabase
    .from("variant_datasheet_columns")
    .update({
      archived_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", columnId)
    .eq("organization_id", organizationId);

  if (error) {
    console.error("Server Action Error (restoreVariantColumn):", error);
    return { error: { message: `Database error: ${error.message}` } };
  }

  revalidatePath("/dashboard/organization");
  revalidatePath("/dashboard/generator");
  return { error: null };
}

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

// --- ADD updateCatalogOrder action ---
export async function updateCatalogOrder(
  catalogOrders: { id: string; display_order: number }[]
) {
  "use server";
  const supabase = await createServerActionClient();

  // 1. Verify user is owner or admin
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

  // Only owners can reorder catalogs (you can adjust this to include 'member' if needed)
  if (profile.role !== "owner") {
    return {
      error: { message: "Only organization owners can reorder catalogs." },
    };
  }

  if (!profile.organization_id) {
    return { error: { message: "User organization context missing." } };
  }

  // 2. Update each catalog's display_order
  const errors = [];

  for (const { id, display_order } of catalogOrders) {
    const { error: updateError } = await supabase
      .from("catalogs")
      .update({ display_order })
      .eq("id", id)
      .eq("organization_id", profile.organization_id); // Security: only update own org's catalogs

    if (updateError) {
      errors.push({ id, error: updateError.message });
      console.error(`Error updating catalog ${id} order:`, updateError);
    }
  }

  if (errors.length > 0) {
    return {
      error: {
        message: `Failed to update ${errors.length} catalog(s) order.`,
        details: errors,
      },
    };
  }

  // 3. Revalidate paths
  revalidatePath("/dashboard/catalogs");

  console.log(`Updated order for ${catalogOrders.length} catalogs.`);
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

const normalizeOptionalFormString = (
  value: FormDataEntryValue | null
): string | null => {
  if (typeof value !== "string") return null;
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
};

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
      categoryIds = categoryIds
        .filter((categoryId): categoryId is string => {
          return typeof categoryId === "string" && categoryId.trim().length > 0;
        })
        .map((categoryId) => categoryId.trim());
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
    catalog_id: normalizeOptionalFormString(formData.get("catalogId")),
    image_path: normalizeOptionalFormString(formData.get("imagePath")),
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
    return {
      error: {
        message: "Invalid role specified. Must be 'member' or 'viewer'.",
      },
    };
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

// --- Action to Update User Role ---
type UpdateUserRoleResult = { error: { message: string } | null };

export async function updateUserRole(
  targetUserId: string,
  newRole: string
): Promise<UpdateUserRoleResult> {
  "use server";

  console.log("🔥 SERVER ACTION: updateUserRole called");
  console.log("📥 Parameters:", { targetUserId, newRole });

  // Role validation
  const allowedRoles = ["member", "viewer", "owner"];
  if (!allowedRoles.includes(newRole)) {
    console.error("❌ Invalid role:", newRole);
    return {
      error: {
        message:
          "Invalid role specified. Must be 'member', 'viewer', or 'owner'.",
      },
    };
  }

  console.log("✅ Role validation passed");

  const supabase = await createServerActionClient();
  console.log("🔗 Supabase client created");

  try {
    // 1. Get current user and their profile (including role and org id)
    console.log("👤 Getting current user...");
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      console.error("❌ Update Role Error: User not authenticated.", userError);
      return { error: { message: "Authentication required." } };
    }
    const currentUserId = userData.user.id;
    console.log("✅ Current user:", {
      currentUserId,
      email: userData.user.email,
    });

    console.log("📋 Getting current user profile...");
    const { data: currentUserProfile, error: profileError } = await supabase
      .from("profiles")
      .select("organization_id, role")
      .eq("id", currentUserId)
      .single();

    if (profileError || !currentUserProfile) {
      console.error(
        `❌ Update Role Error: Profile not found for user ${currentUserId}.`,
        profileError
      );
      return { error: { message: "User profile not found." } };
    }
    console.log("✅ Current user profile:", currentUserProfile);

    // 2. Check if the current user is an owner
    if (currentUserProfile.role !== "owner") {
      console.warn(
        `Update Role Attempt Denied: User ${currentUserId} is not an owner.`
      );
      return {
        error: { message: "Only organization owners can update user roles." },
      };
    }

    if (!currentUserProfile.organization_id) {
      console.error(
        `Update Role Error: Owner ${currentUserId} does not have an organization_id.`
      );
      return { error: { message: "Organization information missing." } };
    }

    // 3. Get target user profile to verify they're in the same organization
    console.log("🎯 Getting target user profile...", { targetUserId });
    const { data: targetUserProfile, error: targetProfileError } =
      await supabase
        .from("profiles")
        .select("organization_id, role")
        .eq("id", targetUserId)
        .single();

    if (targetProfileError || !targetUserProfile) {
      console.error(
        `❌ Update Role Error: Target user profile not found for ${targetUserId}.`,
        targetProfileError
      );
      return { error: { message: "Target user not found." } };
    }
    console.log("✅ Target user profile:", targetUserProfile);

    // 4. Verify target user is in the same organization
    if (
      targetUserProfile.organization_id !== currentUserProfile.organization_id
    ) {
      console.warn(
        `Update Role Attempt Denied: Target user ${targetUserId} is not in the same organization.`
      );
      return {
        error: { message: "Cannot update users from other organizations." },
      };
    }

    // 5. Prevent owners from demoting themselves (would lock out organization)
    if (
      targetUserId === currentUserId &&
      targetUserProfile.role === "owner" &&
      newRole !== "owner"
    ) {
      console.warn(
        `Update Role Attempt Denied: Owner ${currentUserId} trying to demote themselves.`
      );
      return {
        error: { message: "You cannot demote yourself from owner role." },
      };
    }

    // 6. Update the user's role
    console.log("💾 Updating user role in database...");
    console.log("📝 Update query:", {
      table: "profiles",
      update: { role: newRole },
      where: { id: targetUserId },
      currentRole: targetUserProfile.role,
    });

    const { data: updateData, error: updateError } = await supabase
      .from("profiles")
      .update({ role: newRole })
      .eq("id", targetUserId)
      .select(); // Add select to see what was updated

    console.log("🔄 Database update response:", { updateData, updateError });

    if (updateError) {
      console.error(`❌ Update Role Error for ${targetUserId}:`, updateError);
      return {
        error: {
          message: `Failed to update user role: ${updateError.message}`,
        },
      };
    }

    console.log(
      `✅ Successfully updated user ${targetUserId} role to '${newRole}'.`
    );
    console.log("📊 Updated record:", updateData);

    // Revalidate the organization page to refresh the members list
    console.log("🔄 Revalidating /dashboard/organization...");
    revalidatePath("/dashboard/organization");

    return { error: null }; // Success
  } catch (e: any) {
    console.error("Unexpected error updating user role:", e);
    return {
      error: { message: `An unexpected error occurred: ${e.message || e}` },
    };
  }
}
// --- End Update User Role Action ---

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
