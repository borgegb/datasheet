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

// Lightweight in-memory cache for this server instance
// Maps storage path -> signed URL (with naive TTL handling)
const signedUrlCache: Map<string, { url: string; expiresAt: number }> =
  new Map();
const ONE_HOUR_MS = 60 * 60 * 1000;

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

    // Generate signed URLs for first batch of images using batch resolver
    const firstPage = images.slice(0, 20);
    const firstPageUrls = await generateSignedUrlsBatch(
      firstPage.map((i) => i.path)
    );
    const imagesWithUrls = firstPage.map((img) => ({
      ...img,
      url: firstPageUrls[img.path] || undefined,
    }));

    // Combine images with URLs and those without (remaining pages resolved lazily)
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
  console.log("[generateSignedUrl] Starting URL generation for:", imagePath);
  const startTime = Date.now();

  try {
    const supabase = await createClient();

    // Try the original path first
    console.log("[generateSignedUrl] Attempting original path:", imagePath);
    const { data, error } = await supabase.storage
      .from("datasheet-assets")
      .createSignedUrl(imagePath, 60 * 60); // 1 hour expiry

    if (error) {
      console.error(
        "[generateSignedUrl] Error with original path:",
        imagePath,
        error.message
      );

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

      const totalTime = Date.now() - startTime;
      console.log(
        "[generateSignedUrl] Failed after",
        totalTime,
        "ms - no fallback worked for:",
        imagePath
      );
      return null;
    }

    const totalTime = Date.now() - startTime;
    console.log(
      "[generateSignedUrl] Success! Generated URL in",
      totalTime,
      "ms for:",
      imagePath
    );
    return data?.signedUrl || null;
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(
      "[generateSignedUrl] Exception after",
      totalTime,
      "ms:",
      error
    );
    return null;
  }
}

/**
 * Batch generation of signed URLs with minimal fallbacks and memoization.
 * - Uses per-path cache to avoid repeated work within TTL
 * - Applies cheap legacy path rewrites without directory listings
 * - Avoids expensive storage.list calls entirely
 */
export async function generateSignedUrlsBatch(
  imagePaths: string[]
): Promise<Record<string, string>> {
  const supabase = await createClient();
  const now = Date.now();
  const results: Record<string, string> = {};

  // Prepare candidates for each path (original + cheap fallbacks)
  // We keep evaluation order deterministic and minimal
  const pathToCandidates = new Map<string, string[]>();

  // Fetch org once for fallback building
  const organizationId = await getUserOrgId();

  for (const path of imagePaths) {
    // Cache hit
    const cached = signedUrlCache.get(path);
    if (cached && cached.expiresAt > now + 5 * 60 * 1000) {
      // keep a safety margin
      results[path] = cached.url;
      continue;
    }

    const candidates: string[] = [path];
    const filename = path.split("/").pop();
    const firstPart = path.split("/")[0];
    const isLikelyProduct = path.includes("/images/") && !!filename;

    // For product images with legacy user-id prefix, try org path and bare legacy path
    if (isLikelyProduct && organizationId) {
      if (firstPart && firstPart !== organizationId) {
        candidates.push(`${organizationId}/images/${filename}`);
      }
      candidates.push(`images/${filename}`);
    }

    pathToCandidates.set(path, candidates);
  }

  // For each original path, try candidates in order until one succeeds
  for (const [originalPath, candidates] of pathToCandidates.entries()) {
    // If already satisfied by cache above
    if (results[originalPath]) continue;

    let resolvedUrl: string | null = null;
    for (const candidate of candidates) {
      const { data, error } = await supabase.storage
        .from("datasheet-assets")
        .createSignedUrl(candidate, 60 * 60, {
          transform: {
            width: 512,
            height: 512,
            resize: "contain",
            quality: 70,
          },
        });
      if (!error && data?.signedUrl) {
        resolvedUrl = data.signedUrl;
        // Cache under the original requested path for future lookups
        signedUrlCache.set(originalPath, {
          url: resolvedUrl,
          expiresAt: now + ONE_HOUR_MS,
        });
        break;
      }
      // On error, just try next candidate; avoid lists/logging for speed
    }

    if (resolvedUrl) {
      results[originalPath] = resolvedUrl;
    }
  }

  return results;
}
