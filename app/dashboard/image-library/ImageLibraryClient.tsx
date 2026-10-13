"use client";

import { useState, useCallback, useMemo } from "react";
import { ImageLibraryData, ImageFilters, ImageItem } from "./types";
import ImageGrid from "./components/ImageGrid";
import ImageFiltersComponent from "./components/ImageFilters";
import ImageDetails from "./components/ImageDetails";
import { deleteUnlinkedLibraryImage } from "./actions";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { createLibraryImageLoader, mergeUnlinkedImages } from "@/lib/image-library/storage";
import { useLibraryStorage } from "@/hooks/use-library-storage";
import StorageLoadingStatus from "./components/StorageLoadingStatus";

interface ImageLibraryClientProps {
  initialData: ImageLibraryData;
}

export default function ImageLibraryClient({
  initialData,
}: ImageLibraryClientProps) {
  const storage = useLibraryStorage(initialData.error ? undefined : initialData.organizationId);
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set());
  const images = useMemo(() => mergeUnlinkedImages(initialData.images, storage.images)
    .filter((image) => !removedIds.has(image.id)), [initialData.images, storage.images, removedIds]);
  const [loadImageUrl] = useState(() => createLibraryImageLoader(createClient()));
  const [filters, setFilters] = useState<ImageFilters>({
    source: "all",
    searchQuery: "",
    sortBy: "date",
    sortOrder: "desc",
  });
  const [selectedImage, setSelectedImage] = useState<ImageItem | null>(null);

  // Apply filters to images
  const applyFilters = useCallback(
    (images: ImageItem[], filters: ImageFilters) => {
      let filtered = [...images];

      // Filter by source
      if (filters.source && filters.source !== "all") {
        filtered = filtered.filter((img) => img.source === filters.source);
      }

      // Filter by search query
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        filtered = filtered.filter(
          (img) =>
            img.sourceName.toLowerCase().includes(query) ||
            img.path.toLowerCase().includes(query)
        );
      }

      // Sort images
      filtered.sort((a, b) => {
        const order = filters.sortOrder === "asc" ? 1 : -1;

        switch (filters.sortBy) {
          case "name": {
            const cmp = a.sourceName.localeCompare(b.sourceName);
            return cmp * order;
          }
          case "date":
          default: {
            const aTime = new Date(a.uploadedAt).getTime();
            const bTime = new Date(b.uploadedAt).getTime();
            const cmp = aTime - bTime; // base ascending comparison
            return cmp * order; // flip when desc
          }
        }
      });

      return filtered;
    },
    []
  );

  const filteredImages = useMemo(() => applyFilters(images, filters), [images, filters, applyFilters]);

  const removeImageFromState = useCallback((imageId: string) => {
    setRemovedIds((previous) => new Set(previous).add(imageId));
    setSelectedImage((previous) => previous?.id === imageId ? null : previous);
  }, []);

  const handleDeleteImage = useCallback(
    async (image: ImageItem) => {
      if (image.source !== "storage_unlinked") {
        toast.error("Only unlinked storage images can be deleted.");
        return { ok: false };
      }

      const result = await deleteUnlinkedLibraryImage(image.path);

      if (result.error) {
        toast.error(result.error);
        return { ok: false };
      }

      toast.success("Image deleted from storage.");
      removeImageFromState(image.id);
      return { ok: true };
    },
    [removeImageFromState]
  );

  if (initialData.error) {
    return (
      <div className="text-center py-8">
        <p className="text-destructive">
          Error loading images: {initialData.error}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ImageFiltersComponent
        filters={filters}
        onFilterChange={setFilters}
        totalImages={images.length}
        filteredCount={filteredImages.length}
      />

      <StorageLoadingStatus loading={storage.loading} error={storage.error} onRetry={storage.retry} />

      <ImageGrid
        key={JSON.stringify(filters)}
        images={filteredImages}
        onImageClick={setSelectedImage}
        onLoadImage={loadImageUrl}
        isLoading={storage.loading}
      />

      {selectedImage && (
        <ImageDetails
          image={selectedImage}
          onClose={() => setSelectedImage(null)}
          onLoadImage={loadImageUrl}
          onDeleteImage={handleDeleteImage}
        />
      )}
    </div>
  );
}
