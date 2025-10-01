"use client";

import { useState, useCallback } from "react";
import { ImageLibraryData, ImageFilters, ImageItem } from "./types";
import ImageGrid from "./components/ImageGrid";
import ImageFiltersComponent from "./components/ImageFilters";
import ImageDetails from "./components/ImageDetails";
import { generateSignedUrl } from "./actions";

interface ImageLibraryClientProps {
  initialData: ImageLibraryData;
}

export default function ImageLibraryClient({
  initialData,
}: ImageLibraryClientProps) {
  const [images] = useState<ImageItem[]>(initialData.images);
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
  const [filteredImages, setFilteredImages] = useState<ImageItem[]>(
    initialData.images
  );
  const [filters, setFilters] = useState<ImageFilters>({
    source: "all",
    searchQuery: "",
    sortBy: "date",
    sortOrder: "desc",
  });
  const [selectedImage, setSelectedImage] = useState<ImageItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
          case "name":
            return a.sourceName.localeCompare(b.sourceName) * order;
          case "date":
          default:
            return (
              (new Date(b.uploadedAt).getTime() -
                new Date(a.uploadedAt).getTime()) *
              order
            );
        }
      });

      return filtered;
    },
    []
  );

  // Handle filter changes
  const handleFilterChange = (newFilters: ImageFilters) => {
    console.log("[ImageLibraryClient] Filter change:", newFilters);
    setFilters(newFilters);
    const filtered = applyFilters(images, newFilters);
    console.log(
      "[ImageLibraryClient] Filtered results - before:",
      filteredImages.length,
      "after:",
      filtered.length
    );
    setFilteredImages(filtered);
  };

  // Load signed URL for image when needed
  const loadImageUrl = async (
    image: ImageItem,
    fullRes?: boolean
  ): Promise<string | null> => {
    // Check if we already have a URL in the map
    if (!fullRes) {
      const cachedUrl = imageUrls.get(image.id);
      if (cachedUrl) {
        console.log(
          "[ImageLibraryClient] Image URL found in cache:",
          image.path
        );
        return cachedUrl;
      }
    }

    if (!fullRes && image.url) {
      console.log(
        "[ImageLibraryClient] Image has initial URL, caching:",
        image.path
      );
      setImageUrls((prev) => new Map(prev).set(image.id, image.url!));
      return image.url;
    }

    console.log(
      "[ImageLibraryClient] Generating signed URL for:",
      image.path,
      fullRes ? "(full)" : "(thumb)"
    );
    const startTime = Date.now();

    const url = await generateSignedUrl(image.path);

    const genTime = Date.now() - startTime;
    console.log(
      "[ImageLibraryClient] Signed URL generation completed:",
      image.path,
      "success:",
      !!url,
      "time:",
      genTime,
      "ms"
    );

    if (url && !fullRes) {
      // Store the URL in the map instead of updating the entire images array
      console.log("[ImageLibraryClient] Caching URL for:", image.path);
      setImageUrls((prev) => new Map(prev).set(image.id, url));
    }

    return url;
  };

  // Prefetch a batch of image URLs and populate the local URL cache
  const prefetchImageUrls = async (
    imagesToPrefetch: ImageItem[]
  ): Promise<number> => {
    if (!imagesToPrefetch || imagesToPrefetch.length === 0) return 0;

    // Filter out those already cached or already having a URL
    const missing = imagesToPrefetch.filter((img) => {
      if (img.url) return false;
      return !imageUrls.get(img.id);
    });

    if (missing.length === 0) return 0;

    const paths = missing.map((i) => i.path);
    console.log(
      "[ImageLibraryClient] Prefetching batch signed URLs for",
      paths.length,
      "images"
    );
    try {
      const res = await fetch("/api/image-library/signed-url/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths }),
      });
      if (!res.ok) {
        console.warn(
          "[ImageLibraryClient] Batch prefetch failed status:",
          res.status
        );
        return 0;
      }
      const data = (await res.json()) as { urls?: Record<string, string> };
      const result = data.urls || {};
      console.log(
        "[ImageLibraryClient] Prefetch batch received",
        Object.keys(result).length,
        "URLs"
      );

      if (result && Object.keys(result).length > 0) {
        setImageUrls((prev) => {
          const next = new Map(prev);
          for (const img of missing) {
            const url = result[img.path];
            if (url) {
              next.set(img.id, url);
            }
          }
          return next;
        });
        return Object.keys(result).length;
      }
      return 0;
    } catch (e) {
      console.warn("[ImageLibraryClient] Prefetch batch error", e);
      return 0;
    }
  };

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
        onFilterChange={handleFilterChange}
        totalImages={images.length}
        filteredCount={filteredImages.length}
      />

      <ImageGrid
        images={filteredImages}
        onImageClick={setSelectedImage}
        onLoadImage={loadImageUrl}
        onPrefetchImages={prefetchImageUrls}
        isLoading={isLoading}
      />

      {selectedImage && (
        <ImageDetails
          image={selectedImage}
          onClose={() => setSelectedImage(null)}
          onLoadImage={loadImageUrl}
        />
      )}
    </div>
  );
}
