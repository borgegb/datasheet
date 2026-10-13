import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImageItem } from "@/app/dashboard/image-library/types";

const BUCKET = "datasheet-assets";
const PAGE_SIZE = 100;
const IMAGE_EXTENSION = /\.(avif|gif|jpe?g|png|svg|webp)$/i;

/** Runs in the browser using the signed-in user's Storage policies. Each request
 * lists only one page; no Vercel function waits for the whole folder tree. */
export async function scanStorageImages(
  client: SupabaseClient,
  organizationId: string,
  onBatch: (images: ImageItem[]) => void,
  signal: AbortSignal
) {
  const roots = [
    { label: "Kanban image", path: `${organizationId}/kanban/images` },
    { label: "Production Kanban image", path: `${organizationId}/production-kanban/images` },
    { label: "Product image", path: `${organizationId}/images` },
    { label: "Catalog image", path: `organizations/${organizationId}/catalog_images` },
  ];
  const queue = roots.map((root) => ({ ...root, depth: 0, offset: 0 }));
  while (queue.length) {
    signal.throwIfAborted();
    // Four pages at a time, including subfolders of the same root.
    await Promise.all(queue.splice(0, 4).map(async (folder) => {
      signal.throwIfAborted();
      const request = new AbortController();
      const cancel = () => request.abort();
      signal.addEventListener("abort", cancel, { once: true });
      const timeout = setTimeout(cancel, 10000);
      try {
        const { data, error } = await client.storage.from(BUCKET).list(folder.path, {
          limit: PAGE_SIZE,
          offset: folder.offset,
          sortBy: { column: "name", order: "asc" },
        }, { signal: request.signal });
        signal.throwIfAborted();
        if (error) throw new Error("Some storage images could not be loaded. Please retry.");
        const batch: ImageItem[] = [];
        for (const entry of data ?? []) {
          if (!entry.name) continue;
          const path = `${folder.path}/${entry.name}`;
          // Folder names can have image extensions too; id distinguishes files.
          if (!entry.id) {
            if (folder.depth < 4) queue.push({ ...folder, path, depth: folder.depth + 1, offset: 0 });
          } else if ((typeof entry.metadata?.mimetype === "string" && entry.metadata.mimetype.startsWith("image/")) || IMAGE_EXTENSION.test(entry.name)) {
            batch.push({
              id: `storage-${path}`, path, source: "storage_unlinked",
              sourceId: path, sourceName: `${folder.label} - ${entry.name}`,
              uploadedAt: entry.updated_at || entry.created_at || "1970-01-01T00:00:00.000Z",
              organizationId, fileSize: entry.metadata?.size,
            });
          }
        }
        if (batch.length) onBatch(batch);
        if (data?.length === PAGE_SIZE) queue.push({ ...folder, offset: folder.offset + PAGE_SIZE });
      } finally {
        clearTimeout(timeout);
        signal.removeEventListener("abort", cancel);
      }
    }));
  }
}

export function mergeUnlinkedImages(linked: ImageItem[], stored: ImageItem[]) {
  const referenced = new Set(linked.map((image) => image.path));
  const unique = new Map(stored.filter((image) => !referenced.has(image.path)).map((image) => [image.path, image]));
  return [...linked, ...unique.values()];
}

/** Browser requests avoid Next.js serializing a server action per thumbnail. */
export function createLibraryImageLoader(client: SupabaseClient) {
  const cache = new Map<string, { url: string; expiresAt: number }>();
  const pending = new Map<string, Promise<string | null>>();
  let active = 0;
  const waiting: Array<() => void> = [];
  const acquire = async () => {
    if (active < 4) active++;
    else await new Promise<void>((resolve) => waiting.push(resolve));
  };
  return (image: ImageItem, fullRes = false): Promise<string | null> => {
    const key = `${image.path}:${fullRes}`;
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.url);
    const existing = pending.get(key);
    if (existing) return existing;
    const request = (async () => {
      await acquire();
      try {
        const candidates = [image.path];
        if (image.path.includes("/images/") && image.organizationId) {
          const filename = image.path.split("/").pop();
          candidates.push(`${image.organizationId}/images/${filename}`, `images/${filename}`);
        }
        for (const path of new Set(candidates)) {
          const { data, error } = await client.storage.from(BUCKET).createSignedUrl(path, 3600,
            fullRes ? undefined : { transform: { width: 512, height: 512, resize: "contain", quality: 70 } });
          if (!error && data?.signedUrl) {
            cache.set(key, { url: data.signedUrl, expiresAt: Date.now() + 50 * 60 * 1000 });
            return data.signedUrl;
          }
        }
        return null;
      } catch {
        return null;
      } finally {
        pending.delete(key);
        const next = waiting.shift();
        if (next) next();
        else active--;
      }
    })();
    pending.set(key, request);
    return request;
  };
}
