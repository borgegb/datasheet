import "server-only";

import { createClient } from "@/lib/supabase/server";
import { ImageItem, ImageLibraryData } from "./types";

const STORAGE_BUCKET = "datasheet-assets";
const IMAGE_FILE_EXTENSION_PATTERN = /\.(avif|gif|jpe?g|png|svg|webp)$/i;
const FALLBACK_UPLOAD_DATE = "1970-01-01T00:00:00.000Z";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

type StorageImagePrefix = {
  label: string;
  path: string;
};

type StorageListEntry = {
  name: string;
  id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  metadata?: {
    size?: number;
    mimetype?: string;
  } | null;
};

function getStorageImagePrefixes(organizationId: string): StorageImagePrefix[] {
  return [
    {
      label: "Kanban image",
      path: `${organizationId}/kanban/images`,
    },
    {
      label: "Production Kanban image",
      path: `${organizationId}/production-kanban/images`,
    },
    {
      label: "Product image",
      path: `${organizationId}/images`,
    },
    {
      label: "Catalog image",
      path: `organizations/${organizationId}/catalog_images`,
    },
  ];
}

function getImageFileName(path: string) {
  const fileName = path.split("/").pop()?.trim();
  return fileName || "image";
}

function getStorageUploadedAt(entry: StorageListEntry) {
  return entry.updated_at || entry.created_at || FALLBACK_UPLOAD_DATE;
}

function isImageStorageEntry(entry: StorageListEntry) {
  const mimetype = entry.metadata?.mimetype;
  if (typeof mimetype === "string" && mimetype.startsWith("image/")) {
    return true;
  }

  return IMAGE_FILE_EXTENSION_PATTERN.test(entry.name);
}

function isStorageFolderEntry(entry: StorageListEntry) {
  return !isImageStorageEntry(entry) && !entry.id;
}

async function listStorageImagesRecursively(
  supabase: ServerSupabase,
  prefix: string,
  depth = 0
): Promise<Array<{ path: string; entry: StorageListEntry }>> {
  if (depth > 4) {
    return [];
  }

  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).list(
    prefix,
    {
      limit: 1000,
      sortBy: { column: "updated_at", order: "desc" },
    }
  );

  if (error) {
    console.warn(`Failed to list storage prefix "${prefix}":`, error.message);
    return [];
  }

  const results: Array<{ path: string; entry: StorageListEntry }> = [];

  for (const rawEntry of (data ?? []) as StorageListEntry[]) {
    const entryName = rawEntry.name?.trim();
    if (!entryName) {
      continue;
    }

    const fullPath = `${prefix}/${entryName}`;

    if (isImageStorageEntry(rawEntry)) {
      results.push({ path: fullPath, entry: rawEntry });
      continue;
    }

    if (isStorageFolderEntry(rawEntry)) {
      const nestedEntries = await listStorageImagesRecursively(
        supabase,
        fullPath,
        depth + 1
      );
      results.push(...nestedEntries);
    }
  }

  return results;
}

function createUnlinkedStorageImage(options: {
  entry: StorageListEntry;
  label: string;
  organizationId: string;
  path: string;
}): ImageItem {
  const fileName = getImageFileName(options.path);

  return {
    id: `storage-${options.path}`,
    path: options.path,
    source: "storage_unlinked",
    sourceId: options.path,
    sourceName: `${options.label} - ${fileName}`,
    uploadedAt: getStorageUploadedAt(options.entry),
    organizationId: options.organizationId,
    fileSize: options.entry.metadata?.size,
  };
}

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
      storageImageGroups,
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

      Promise.all(
        getStorageImagePrefixes(organizationId).map(async (prefix) => ({
          label: prefix.label,
          entries: await listStorageImagesRecursively(supabase, prefix.path),
        }))
      ),
    ]);

    const images: ImageItem[] = [];
    const referencedPaths = new Set<string>();

    if (productsResult.data) {
      for (const product of productsResult.data) {
        if (!product.image_path) continue;

        referencedPaths.add(product.image_path);
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
          referencedPaths.add(card.image_path);
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
          referencedPaths.add(card.signature_path);
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

        referencedPaths.add(card.image_path);
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

        referencedPaths.add(catalog.image_path);
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

    const unlinkedImagesByPath = new Map<string, ImageItem>();

    for (const storageGroup of storageImageGroups) {
      for (const storageEntry of storageGroup.entries) {
        if (referencedPaths.has(storageEntry.path)) {
          continue;
        }

        if (!unlinkedImagesByPath.has(storageEntry.path)) {
          unlinkedImagesByPath.set(
            storageEntry.path,
            createUnlinkedStorageImage({
              entry: storageEntry.entry,
              label: storageGroup.label,
              organizationId,
              path: storageEntry.path,
            })
          );
        }
      }
    }

    const finalImages = [...images, ...unlinkedImagesByPath.values()].sort(
      (a, b) =>
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );

    return {
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
