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
  const [images, setImages] = useState<ImageItem[]>(initialData.images);
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
  const loadImageUrl = async (image: ImageItem): Promise<string | null> => {
    if (image.url) {
      console.log(
        "[ImageLibraryClient] Image already has URL, returning cached:",
        image.path
      );
      return image.url;
    }

    console.log("[ImageLibraryClient] Generating signed URL for:", image.path);
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

    if (url) {
      // Update the image with the URL
      console.log(
        "[ImageLibraryClient] Updating state with new URL for:",
        image.path
      );
      setImages((prev) =>
        prev.map((img) => (img.id === image.id ? { ...img, url } : img))
      );
      setFilteredImages((prev) =>
        prev.map((img) => (img.id === image.id ? { ...img, url } : img))
      );
    }

    return url;
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
