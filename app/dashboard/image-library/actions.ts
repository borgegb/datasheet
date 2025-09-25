"use server";

/**
 * Image Library Server Actions
 *
 * Note: There's a legacy issue with product image paths:
 * - Old products store images with user ID: {user_id}/images/{filename}
 * - New products should use organization ID: {organization_id}/images/{filename}
 * - Kanban uses: {organization_id}/kanban/images/{filename}
 * - Catalogs use: organizations/{organization_id}/catalog_images/{filename}
 *
 * The generateSignedUrl function handles these different path structures.
 * 
 * IMPORTANT: Product images stored under user IDs require a storage policy update.
 * Add this policy in Supabase Dashboard → Storage → Policies:
 * 
 * Name: Allow org members to read legacy product images
 * Operation: SELECT
 * Target roles: authenticated
 * Policy:
 * ((bucket_id = 'datasheet-assets'::text) AND EXISTS (
 *   SELECT 1 FROM products p
 *   JOIN profiles prof ON prof.organization_id = p.organization_id
 *   WHERE prof.id = auth.uid()
 *   AND p.image_path = name
 * ))
 */

import { createClient } from "@/lib/supabase/server";
import { ImageItem, ImageLibraryData } from "./types";

async function getUserOrgId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  return profile?.organization_id || null;
}

export async function fetchImagesForLibrary(): Promise<ImageLibraryData> {
  try {
    const supabase = await createClient();
    const organizationId = await getUserOrgId();

    if (!organizationId) {
      return { images: [], totalCount: 0, error: "Organization not found" };
    }

    // Fetch images from all sources in parallel
    const [productsResult, kanbanResult, catalogsResult] = await Promise.all([
      // Products images
      supabase
        .from("products")
        .select("id, product_title, image_path, created_at")
        .eq("organization_id", organizationId)
        .not("image_path", "is", null),

      // Kanban cards images (both main image and signature)
      supabase
        .from("kanban_cards")
        .select(
          "id, part_no, description, image_path, signature_path, created_at"
        )
        .eq("organization_id", organizationId),

      // Catalogs images
      supabase
        .from("catalogs")
        .select("id, name, image_path, created_at")
        .eq("organization_id", organizationId)
        .not("image_path", "is", null),
    ]);

    const images: ImageItem[] = [];

    // Process product images
    if (productsResult.data) {
      for (const product of productsResult.data) {
        if (product.image_path) {
          images.push({
            id: `product-${product.id}`,
            path: product.image_path,
            source: "products",
            sourceId: product.id,
            sourceName: product.product_title || "Untitled Product",
            uploadedAt: product.created_at,
            organizationId,
          });
        }
      }
    }

    // Process kanban images
    if (kanbanResult.data) {
      for (const card of kanbanResult.data) {
        if (card.image_path) {
          images.push({
            id: `kanban-${card.id}-main`,
            path: card.image_path,
            source: "kanban_cards",
            sourceId: card.id,
            sourceName: `${card.part_no} - ${
              card.description || "Kanban Card"
            }`,
            uploadedAt: card.created_at,
            organizationId,
          });
        }

        if (card.signature_path) {
          images.push({
            id: `kanban-${card.id}-signature`,
            path: card.signature_path,
            source: "kanban_cards",
            sourceId: card.id,
            sourceName: `${card.part_no} - Signature`,
            uploadedAt: card.created_at,
            organizationId,
          });
        }
      }
    }

    // Process catalog images
    if (catalogsResult.data) {
      for (const catalog of catalogsResult.data) {
        if (catalog.image_path) {
          images.push({
            id: `catalog-${catalog.id}`,
            path: catalog.image_path,
            source: "catalogs",
            sourceId: catalog.id,
            sourceName: `${catalog.name} (Catalog)`,
            uploadedAt: catalog.created_at,
            organizationId,
          });
        }
      }
    }

    // Sort by upload date (newest first)
    images.sort(
      (a, b) =>
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );

    // Generate signed URLs for first batch of images (e.g., first 20)
    const imagesWithUrls = await Promise.all(
      images.slice(0, 20).map(async (image) => {
        const url = await generateSignedUrl(image.path);
        return {
          ...image,
          url: url || undefined,
        };
      })
    );

    // Combine images with URLs and those without
    const finalImages = [...imagesWithUrls, ...images.slice(20)];

    return {
      images: finalImages,
      totalCount: images.length,
      error: undefined,
    };
  } catch (error) {
    console.error("Error fetching images:", error);
    return {
      images: [],
      totalCount: 0,
      error: error instanceof Error ? error.message : "Failed to fetch images",
    };
  }
}

export async function generateSignedUrl(
  imagePath: string
): Promise<string | null> {
  try {
    const supabase = await createClient();

    // Try the original path first
    const { data, error } = await supabase.storage
      .from("datasheet-assets")
      .createSignedUrl(imagePath, 60 * 60); // 1 hour expiry

    if (error) {
      console.error("Error generating signed URL for path:", imagePath, error);

      // If it's a product image path (starts with a UUID), try alternative paths
      if (
        error.message === "Object not found" ||
        error.message === "The resource was not found"
      ) {
        console.log(`Storage error for ${imagePath}: ${error.message}`);

        // Only try alternatives for product images
        if (!imagePath.includes("/images/")) {
          return null;
        }

        console.log("Trying alternative paths for product image...");

        // Get organization ID
        const organizationId = await getUserOrgId();
        console.log(`Current organization ID: ${organizationId}`);
        if (!organizationId) return null;

        // Extract filename from path
        const filename = imagePath.split("/").pop();
        if (!filename) return null;

        // Extract the first part of the path (might be user ID or org ID)
        const pathParts = imagePath.split("/");
        const firstPart = pathParts[0];
        console.log(
          `Path analysis - First part: ${firstPart}, Filename: ${filename}`
        );

        // Try organization-based path (only if the first part isn't already the org ID)
        if (firstPart !== organizationId) {
          const orgPath = `${organizationId}/images/${filename}`;
          console.log(`Trying organization path: ${orgPath}`);
          const { data: orgData, error: orgError } = await supabase.storage
            .from("datasheet-assets")
            .createSignedUrl(orgPath, 60 * 60);

          if (!orgError && orgData?.signedUrl) {
            console.log(
              `Found image at organization path: ${orgPath} (original was: ${imagePath})`
            );
            return orgData.signedUrl;
          } else if (orgError) {
            console.log(`Organization path failed: ${orgError.message}`);
          }
        }

        // Try without any prefix (legacy path)
        const legacyPath = `images/${filename}`;
        console.log(`Trying legacy path: ${legacyPath}`);
        const { data: legacyData, error: legacyError } = await supabase.storage
          .from("datasheet-assets")
          .createSignedUrl(legacyPath, 60 * 60);

        if (!legacyError && legacyData?.signedUrl) {
          console.log("Found image at legacy path:", legacyPath);
          return legacyData.signedUrl;
        } else if (legacyError) {
          console.log(`Legacy path failed: ${legacyError.message}`);
        }

        // Try listing files to see what's actually in storage
        console.log(`All paths failed. Attempting to list files in bucket...`);

        // Check if we can access the bucket at all
        const { data: rootList, error: rootError } = await supabase.storage
          .from("datasheet-assets")
          .list("", { limit: 5 });

        if (rootError) {
          console.error(`Cannot access storage bucket: ${rootError.message}`);
          return null;
        } else {
          console.log(
            `Root folders in bucket:`,
            rootList?.map((f) => f.name).join(", ") || "none"
          );
        }

        // First, try listing in the organization folder
        const { data: orgListData, error: orgListError } =
          await supabase.storage
            .from("datasheet-assets")
            .list(`${organizationId}/images`, {
              limit: 10,
            });

        if (!orgListError && orgListData && orgListData.length > 0) {
          console.log(
            `Files found in ${organizationId}/images:`,
            orgListData
              .map((f) => f.name)
              .slice(0, 5)
              .join(", ")
          );
        } else {
          console.log(`No files found in ${organizationId}/images`);
        }

        // If the first part looks like a UUID and is different from org ID, try listing there
        if (
          firstPart &&
          firstPart !== organizationId &&
          firstPart.match(/^[a-f0-9-]{36}$/)
        ) {
          console.log(
            `Checking if files exist in original path: ${firstPart}/images`
          );
          const { data: userListData, error: userListError } =
            await supabase.storage
              .from("datasheet-assets")
              .list(`${firstPart}/images`, {
                limit: 10,
              });

          if (!userListError && userListData && userListData.length > 0) {
            console.log(
              `Files found in ${firstPart}/images:`,
              userListData
                .map((f) => f.name)
                .slice(0, 5)
                .join(", ")
            );

            // The files exist in the original location
            console.log(
              `Files confirmed at: ${firstPart}/images/ but access is blocked by storage policies`
            );
            console.log(
              `Storage Policy Fix Required: Add a policy to allow organization members to read product images from user folders`
            );
            
            // We know the files exist but can't access them due to RLS policies
            // Return null for now until policies are updated
          } else {
            console.log(`No files found in ${firstPart}/images`);
          }
        }
      }

      return null;
    }

    return data?.signedUrl || null;
  } catch (error) {
    console.error("Error in generateSignedUrl:", error);
    return null;
  }
}
