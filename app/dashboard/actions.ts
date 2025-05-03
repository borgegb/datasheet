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
export async function fetchProductsForOrg() {
  const supabase = await createClient();
  const organizationId = await getUserOrgId(supabase);

  if (!organizationId) {
    // Return empty or throw error, depending on how page handles it
    return { data: [], error: { message: "User organization not found." } };
  }

  const { data, error } = await supabase
    .from("products")
    .select("id, product_title, product_code") // Keep selection minimal for list view
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Server Action Error (fetchProductsForOrg):", error);
  }

  // Return data and error explicitly for the component to handle
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

// --- Action to Save/Update Datasheet (Product) ---
// Update signature to accept previous state and FormData
export async function saveDatasheet(
  prevState: { error?: { message: string } } | null, // Previous state from useActionState
  formData: FormData // Use FormData directly
) {
  const supabase = await createClient();

  // Extract editingProductId from FormData (assuming hidden input)
  const editingProductId = formData.get("editingProductId") as string | null;
  formData.delete("editingProductId"); // Remove it so it doesn't go into productData

  // Extract other fields using formData.get()
  const productTitle = formData.get("productTitle") as string;
  const productCode = formData.get("productCode") as string;
  const description = formData.get("description") as string;
  const techSpecs = formData.get("techSpecs") as string | null;
  const price = formData.get("price") as string | null;
  const imagePath = formData.get("imagePath") as string | null;
  const weight = formData.get("weight") as string | null;
  const keyFeatures = formData.get("keyFeatures") as string | null;
  const warranty = formData.get("warranty") as string | null;
  const shippingInfo = formData.get("shippingInfo") as string | null;
  const imageOrientation = formData.get("imageOrientation") as
    | "portrait"
    | "landscape";
  // Checkbox values are tricky with FormData, might be 'on' or null
  const includeCeLogo = formData.get("includeCeLogo") === "on";
  const includeOriginLogo = formData.get("includeOriginLogo") === "on";
  const catalogId = formData.get("catalogId") as string | null;
  // catalogCategory needs to be handled if included in form

  const organizationId = await getUserOrgId(supabase);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !organizationId) {
    return {
      error: { message: "Authentication or Organization details missing." },
    };
  }
  // Re-validate required fields based on extracted data
  if (!productTitle || !productCode || !description) {
    return {
      error: { message: "Required fields (Title, Code, Description) missing." },
    };
  }

  const productData = {
    product_title: productTitle,
    product_code: productCode,
    description: description,
    tech_specs: techSpecs,
    price: price,
    image_path: imagePath,
    weight: weight,
    key_features: keyFeatures,
    warranty: warranty,
    shipping_info: shippingInfo,
    image_orientation: imageOrientation,
    optional_logos: {
      // Construct JSONB object
      ceMark: includeCeLogo,
      origin: includeOriginLogo,
    },
    catalog_id: catalogId === "" ? null : catalogId, // Handle empty string from select
    user_id: user.id,
    organization_id: organizationId,
  };

  console.log(
    editingProductId ? "Updating data:" : "Inserting data:",
    productData
  );

  let result;
  try {
    if (editingProductId) {
      // UPDATE
      result = await supabase
        .from("products")
        .update(productData)
        .eq("id", editingProductId)
        .eq("organization_id", organizationId)
        .select("id")
        .single();
    } else {
      // INSERT
      result = await supabase
        .from("products")
        .insert([productData])
        .select("id")
        .single();
    }

    if (result.error) {
      console.error("Server Action Error (saveDatasheet):", result.error);
      // Return error state for useActionState
      return {
        data: null,
        error: {
          message: result.error.message || "Database operation failed.",
        },
      };
    }

    // Revalidate paths after save/update
    revalidatePath("/dashboard/products");
    if (editingProductId) {
      revalidatePath(`/dashboard/generator/${editingProductId}`);
    }

    // Return success state for useActionState (change error: null to error: undefined)
    return { data: result.data, error: undefined };
  } catch (error: any) {
    console.error("Server Action Error (saveDatasheet):", error);
    // Return error state for useActionState
    return {
      data: null,
      error: { message: error.message || "Database operation failed." },
    };
  }
}
