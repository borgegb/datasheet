"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { scanStorageImages } from "@/lib/image-library/storage";
import type { ImageItem } from "@/app/dashboard/image-library/types";

export function useLibraryStorage(organizationId?: string) {
  const [result, setResult] = useState<{ organizationId?: string; images: ImageItem[] }>({ images: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    setResult((previous) => previous.organizationId === organizationId
      ? previous : { organizationId, images: [] });
    setError(null);
    setLoading(Boolean(organizationId));
    if (!organizationId) return;
    const controller = new AbortController();
    scanStorageImages(createClient(), organizationId, (batch) => {
      setResult((previous) => {
        const images = new Map(previous.images.map((image) => [image.path, image]));
        for (const image of batch) {
          if (!images.has(image.path)) images.set(image.path, image);
        }
        return { organizationId, images: [...images.values()] };
      });
    }, controller.signal).then(() => {
      if (!controller.signal.aborted) setLoading(false);
    }).catch(() => {
      if (controller.signal.aborted) return;
      // Stop the remaining workers after a failure; keep images already loaded.
      controller.abort();
      setError("Some storage images could not be loaded.");
      setLoading(false);
    });
    return () => controller.abort();
  }, [organizationId, attempt]);

  return { images: result.organizationId === organizationId ? result.images : [], loading, error, retry };
}
