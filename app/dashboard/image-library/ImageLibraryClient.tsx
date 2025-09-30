"use client";

import { useState, useCallback, useRef } from "react";
import { ImageLibraryData, ImageFilters, ImageItem } from "./types";
import ImageGrid from "./components/ImageGrid";
import ImageFiltersComponent from "./components/ImageFilters";
import ImageDetails from "./components/ImageDetails";
import { generateSignedUrl, generateBatchSignedUrls } from "./actions";

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
  
  // Batch loading state
  const pendingBatch = useRef<Set<string>>(new Set());
  const batchTimer = useRef<NodeJS.Timeout | null>(null);
  const batchPromise = useRef<Promise<void> | null>(null);

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

  // Process batch of URLs
  const processBatch = useCallback(async () => {
    if (pendingBatch.current.size === 0) return;
    
    const paths = Array.from(pendingBatch.current);
    pendingBatch.current.clear();
    
    console.log(`[ImageLibraryClient] Processing batch of ${paths.length} URLs`);
    
    const urlMap = await generateBatchSignedUrls(paths);
    
    if (urlMap.size > 0) {
      setImageUrls(prev => {
        const newMap = new Map(prev);
        urlMap.forEach((url, path) => {
          // Find the image ID for this path
          const image = images.find(img => img.path === path);
          if (image) {
            newMap.set(image.id, url);
          }
        });
        return newMap;
      });
    }
  }, [images]);

  // Load signed URL for image when needed
  const loadImageUrl = async (image: ImageItem): Promise<string | null> => {
    // Check if we already have a URL in the map
    const cachedUrl = imageUrls.get(image.id);
    if (cachedUrl) {
      return cachedUrl;
    }

    if (image.url) {
      setImageUrls((prev) => new Map(prev).set(image.id, image.url!));
      return image.url;
    }

    // Add to batch
    pendingBatch.current.add(image.path);
    
    // Clear existing timer
    if (batchTimer.current) {
      clearTimeout(batchTimer.current);
      batchTimer.current = null;
    }
    
    // Create or reuse batch promise
    if (!batchPromise.current) {
      batchPromise.current = new Promise<void>((resolve) => {
        batchTimer.current = setTimeout(async () => {
          await processBatch();
          resolve();
          batchPromise.current = null;
          batchTimer.current = null;
        }, 50); // Wait 50ms to collect more URLs
      });
    }
    
    // Wait for the batch to complete
    await batchPromise.current;
    
    // Return the URL from the cache after batch processing
    return imageUrls.get(image.id) || null;
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
