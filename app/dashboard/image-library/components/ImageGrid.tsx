"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ImageItem } from "../types";

import { Loader2 } from "lucide-react";
import ImageCard from "./ImageCard";

interface ImageGridProps {
  images: ImageItem[];
  onImageClick: (image: ImageItem) => void;
  onLoadImage: (image: ImageItem) => Promise<string | null>;
  isLoading?: boolean;
}

export default function ImageGrid({
  images,
  onImageClick,
  onLoadImage,
  isLoading,
}: ImageGridProps) {
  const [visibleImages, setVisibleImages] = useState<ImageItem[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const imagesPerPage = 10; // Reduced from 20 to improve performance

  // Reset when images array length changes (due to filtering)
  useEffect(() => {
    console.log(
      "[ImageGrid] Images array length changed, resetting. Total images:",
      images.length
    );
    setVisibleImages(images.slice(0, imagesPerPage));
    setPage(1);
  }, [images.length]); // Only reset when the length changes, not when URLs are added

  // Throttle scroll events
  const lastScrollTime = useRef(0);

  const loadMoreImages = useCallback(async () => {
    if (loadingMore || visibleImages.length >= images.length) return;

    console.log(
      "[ImageGrid] loadMoreImages started - current page:",
      page,
      "visible:",
      visibleImages.length
    );
    const startTime = Date.now();

    setLoadingMore(true);
    const nextPage = page + 1;
    const startIndex = page * imagesPerPage;
    const endIndex = nextPage * imagesPerPage;
    const newImages = images.slice(startIndex, endIndex);

    console.log(
      "[ImageGrid] Loading batch - startIndex:",
      startIndex,
      "endIndex:",
      endIndex,
      "batch size:",
      newImages.length
    );

    if (newImages.length === 0) {
      setLoadingMore(false);
      return;
    }

    // Load URLs for new batch
    const loadStartTime = Date.now();
    const loadPromises = newImages.map((img) => onLoadImage(img));

    await Promise.all(loadPromises);

    const loadEndTime = Date.now();
    console.log(
      "[ImageGrid] URL loading completed in",
      loadEndTime - loadStartTime,
      "ms"
    );

    setVisibleImages((prev) => {
      console.log(
        "[ImageGrid] Updating visible images - previous:",
        prev.length,
        "adding:",
        newImages.length
      );
      return [...prev, ...newImages];
    });
    setPage(nextPage);
    setLoadingMore(false);

    const totalTime = Date.now() - startTime;
    console.log("[ImageGrid] loadMoreImages completed in", totalTime, "ms");
  }, [
    images,
    visibleImages.length,
    loadingMore,
    page,
    imagesPerPage,
    onLoadImage,
  ]);

  // Load more images when scrolling with throttling
  useEffect(() => {
    const handleScroll = () => {
      const now = Date.now();

      // Throttle to max once per 200ms
      if (now - lastScrollTime.current < 200) {
        return;
      }

      lastScrollTime.current = now;

      if (loadingMore || visibleImages.length >= images.length) {
        return;
      }

      const scrollHeight = document.documentElement.scrollHeight;
      const scrollTop = document.documentElement.scrollTop;
      const clientHeight = document.documentElement.clientHeight;
      const scrollPosition = scrollTop + clientHeight;
      const triggerPoint = scrollHeight - 300; // Reduced from 500

      if (scrollPosition >= triggerPoint) {
        console.log("[ImageGrid] Triggering loadMoreImages");
        loadMoreImages();
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [visibleImages.length, images.length, loadingMore, loadMoreImages]);

  if (isLoading && visibleImages.length === 0) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          No images found matching your filters.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {visibleImages.map((image) => (
          <ImageCard
            key={image.id}
            image={image}
            onClick={() => onImageClick(image)}
            onLoadImage={onLoadImage}
          />
        ))}
      </div>

      {loadingMore && (
        <div className="flex justify-center items-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {visibleImages.length < images.length && !loadingMore && (
        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground">
            Showing {visibleImages.length} of {images.length} images
          </p>
        </div>
      )}
    </>
  );
}
