"use client";

import { useState, useEffect, useRef } from "react";
import { ImageItem } from "../types";
import { Loader2 } from "lucide-react";
import ImageCard from "./ImageCard";

interface ImageGridProps {
  images: ImageItem[];
  onImageClick: (image: ImageItem) => void;
  onLoadImage: (image: ImageItem) => Promise<string | null>;
  isLoading?: boolean;
}

export default function ImageGrid({ images, onImageClick, onLoadImage, isLoading }: ImageGridProps) {
  const [visibleCount, setVisibleCount] = useState(10);
  const loaderRef = useRef<HTMLDivElement | null>(null);
  const hasMore = visibleCount < images.length;

  // Appending storage results preserves scroll progress. The parent resets this
  // component only when the user changes filters, not when URLs or data arrive.
  useEffect(() => {
    const loader = loaderRef.current;
    if (!loader || !hasMore) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        observer.disconnect();
        setVisibleCount((count) => count + 10);
      }
    }, { rootMargin: "300px" });
    observer.observe(loader);
    return () => observer.disconnect();
  }, [hasMore, visibleCount]);

  if (images.length === 0) return isLoading ? (
    <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Loading images" /></div>
  ) : (
    <div className="text-center py-12"><p className="text-muted-foreground">No images found matching your filters.</p></div>
  );

  return <>
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {images.slice(0, visibleCount).map((image) => (
        <ImageCard key={image.id} image={image} onClick={() => onImageClick(image)} onLoadImage={onLoadImage} />
      ))}
    </div>
    {hasMore && <div className="text-center py-4" ref={loaderRef}>
      <p className="text-sm text-muted-foreground">Showing {visibleCount} of {images.length} images</p>
    </div>}
  </>;
}
