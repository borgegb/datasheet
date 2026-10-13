import "server-only";

import { createClient } from "@/lib/supabase/server";
import { ImageItem, ImageLibraryData } from "./types";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

export async function getImageLibraryOrganizationId(
  supabase?: ServerSupabase
) {
  const client = supabase ?? (await createClient());
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await client
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  return profile?.organization_id || null;
}

export async function fetchImageLibraryDataForOrganization(
  organizationId: string
): Promise<ImageLibraryData> {
  try {
    const supabase = await createClient();

    const [
      productsResult,
      kanbanResult,
      productionKanbanResult,
      catalogsResult,
    ] = await Promise.all([
      supabase
        .from("products")
        .select("id, product_title, image_path, created_at")
        .eq("organization_id", organizationId)
        .not("image_path", "is", null),

      supabase
        .from("kanban_cards")
        .select(
          "id, part_no, description, image_path, signature_path, created_at"
        )
        .eq("organization_id", organizationId),

      supabase
        .from("production_kanban_cards")
        .select("id, part_no, description, image_path, created_at")
        .eq("organization_id", organizationId)
        .not("image_path", "is", null),

      supabase
        .from("catalogs")
        .select("id, name, image_path, created_at")
        .eq("organization_id", organizationId)
        .not("image_path", "is", null),
    ]);

    const images: ImageItem[] = [];
    // Never scan Storage while rendering this page. The browser loads it in pages.
    for (const result of [productsResult, kanbanResult, productionKanbanResult, catalogsResult]) {
      if (result.error) throw new Error(result.error.message);
    }

    if (productsResult.data) {
      for (const product of productsResult.data) {
        if (!product.image_path) continue;

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

    if (productionKanbanResult.data) {
      for (const card of productionKanbanResult.data) {
        if (!card.image_path) continue;

        images.push({
          id: `production-kanban-${card.id}`,
          path: card.image_path,
          source: "production_kanban_cards",
          sourceId: card.id,
          sourceName: `${card.part_no}${
            card.description ? ` - ${card.description}` : ""
          } (Production Kanban)`,
          uploadedAt: card.created_at,
          organizationId,
        });
      }
    }

    if (catalogsResult.data) {
      for (const catalog of catalogsResult.data) {
        if (!catalog.image_path) continue;

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

    const finalImages = images.sort(
      (a, b) =>
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );

    return {
      organizationId,
      images: finalImages,
      totalCount: finalImages.length,
      error: undefined,
    };
  } catch (error) {
    console.error("Error fetching image library data:", error);
    return {
      images: [],
      totalCount: 0,
      error:
        error instanceof Error ? error.message : "Failed to fetch image data",
    };
  }
}
