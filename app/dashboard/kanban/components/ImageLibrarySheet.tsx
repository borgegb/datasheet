"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, ImageIcon, Check, Loader2 } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

import type { ImageItem } from "@/app/dashboard/image-library/types";
import { createLibraryImageLoader, mergeUnlinkedImages } from "@/lib/image-library/storage";
import { createClient } from "@/lib/supabase/client";
import { useLibraryStorage } from "@/hooks/use-library-storage";
import StorageLoadingStatus from "@/app/dashboard/image-library/components/StorageLoadingStatus";

interface ImageLibrarySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectImage: (imagePath: string, fileName: string) => void;
  organizationId: string;
}

export default function ImageLibrarySheet({
  open,
  onOpenChange,
  onSelectImage,
  organizationId,
}: ImageLibrarySheetProps) {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [filteredImages, setFilteredImages] = useState<ImageItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [loadImageUrl] = useState(() => createLibraryImageLoader(createClient()));
  const [loadedOrganization, setLoadedOrganization] = useState<string>();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [visibleCount, setVisibleCount] = useState(40);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "alphabetical">(
    "newest"
  );

  const storage = useLibraryStorage(open && loadedOrganization === organizationId ? organizationId : undefined);
  const allImages = useMemo(() => mergeUnlinkedImages(images, storage.images), [images, storage.images]);

  useEffect(() => {
    setVisibleCount(40);
  }, [open, organizationId, searchQuery, sourceFilter, sortOrder]);

  // Cancel stale responses when the picker closes or changes organization.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setIsLoading(true);
    setLoadedOrganization(undefined);
    setLoadError(null);
    setImages([]);
    fetch("/api/image-library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("Failed to fetch images");
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      if (!controller.signal.aborted) {
        setImages((data.images || []).filter((img: ImageItem) => !!img.path));
        setLoadedOrganization(organizationId);
      }
    }).catch((error) => {
      if (!controller.signal.aborted) {
        console.error("Error fetching images:", error);
        setLoadError("Images could not be loaded.");
      }
    }).finally(() => {
      if (!controller.signal.aborted) setIsLoading(false);
    });
    return () => controller.abort();
  }, [open, organizationId, attempt]);

  // Filter and sort images
  useEffect(() => {
    let filtered = [...allImages];

    // Apply source filter
    if (sourceFilter !== "all") {
      filtered = filtered.filter((img) => img.source === sourceFilter);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (img) =>
          img.sourceName.toLowerCase().includes(query) ||
          img.path.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    if (sortOrder === "alphabetical") {
      filtered.sort((a, b) => a.sourceName.localeCompare(b.sourceName));
    } else {
      // newest first (default)
      filtered.sort(
        (a, b) =>
          new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
      );
    }

    setFilteredImages(filtered);
  }, [searchQuery, allImages, sourceFilter, sortOrder]);

  const handleSelectImage = (image: ImageItem) => {
    // Extract filename from path
    const fileName = image.path.split("/").pop() || "image";
    onSelectImage(image.path, fileName);
    setSelectedImage(image.id);

    // Close sheet after a brief delay to show selection
    setTimeout(() => {
      onOpenChange(false);
      setSelectedImage(null);
      setSearchQuery("");
      setSourceFilter("all");
      setSortOrder("newest");
    }, 300);
  };

  const getSourceColor = (source: string) => {
    switch (source) {
      case "products":
        return "bg-blue-500/10 text-blue-600";
      case "kanban_cards":
        return "bg-green-500/10 text-green-600";
      case "production_kanban_cards":
        return "bg-amber-500/10 text-amber-700";
      case "catalogs":
        return "bg-purple-500/10 text-purple-600";
      case "storage_unlinked":
        return "bg-slate-500/10 text-slate-700";
      default:
        return "bg-gray-500/10 text-gray-600";
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:w-[540px] sm:max-w-[540px] p-0 flex flex-col">
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle>Select Image from Library</SheetTitle>
          <SheetDescription>
            Choose an image from your library
          </SheetDescription>
        </SheetHeader>

        {/* Search and Filters */}
        <div className="px-6 py-4 border-b space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search images..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex gap-2">
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="products">Products</SelectItem>
                <SelectItem value="kanban_cards">Kanban</SelectItem>
                <SelectItem value="production_kanban_cards">
                  Production Kanban
                </SelectItem>
                <SelectItem value="catalogs">Catalogs</SelectItem>
                <SelectItem value="storage_unlinked">
                  Unlinked Storage
                </SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={sortOrder}
              onValueChange={(value) =>
                setSortOrder(value as "newest" | "alphabetical")
              }
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="alphabetical">A-Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="px-6">
          <StorageLoadingStatus loading={storage.loading} error={loadError || storage.error} onRetry={loadError ? () => setAttempt((value) => value + 1) : storage.retry} />
        </div>

        {/* Images Grid */}
        <ScrollArea className="flex-1 px-6">
          {isLoading ? (
            <div className="grid grid-cols-2 gap-4 py-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="aspect-square rounded-lg" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              ))}
            </div>
          ) : filteredImages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ImageIcon className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {searchQuery
                  ? "No images found matching your search"
                  : "No images available"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 py-4">
              {filteredImages.slice(0, visibleCount).map((image) => (
                <ImageCard
                  key={image.id}
                  image={image}
                  isSelected={selectedImage === image.id}
                  onSelect={() => handleSelectImage(image)}
                  onLoadImage={loadImageUrl}
                  getSourceColor={getSourceColor}
                />
              ))}
            </div>
          )}
          {filteredImages.length > visibleCount && (
            <Button variant="outline" className="mb-4 w-full" onClick={() => setVisibleCount((count) => count + 40)}>
              Show more images
            </Button>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// Image Card Component
interface ImageCardProps {
  image: ImageItem;
  isSelected: boolean;
  onSelect: () => void;
  onLoadImage: (image: ImageItem) => Promise<string | null>;
  getSourceColor: (source: string) => string;
}

function ImageCard({
  image,
  isSelected,
  onSelect,
  onLoadImage,
  getSourceColor,
}: ImageCardProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(image.url || null);
  const [hasError, setHasError] = useState(false);
  const [isLoadingImage, setIsLoadingImage] = useState(!image.url);

  useEffect(() => {
    let active = true;
    if (image.url) return;
    onLoadImage(image).then((url) => {
      if (!active) return;
      setImageUrl(url);
      setHasError(!url);
    }).catch(() => {
      if (active) setHasError(true);
    }).finally(() => {
      if (active) setIsLoadingImage(false);
    });
    return () => { active = false; };
  }, [image, onLoadImage]);

  return (
    <div
      className={cn(
        "relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all",
        isSelected
          ? "border-primary ring-2 ring-primary ring-offset-2"
          : "border-transparent hover:border-muted-foreground/30"
      )}
      onClick={onSelect}
    >
      <div className="aspect-square relative bg-muted">
        {isLoadingImage ? (
          <div className="w-full h-full flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : hasError ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground p-4">
            <ImageIcon className="h-8 w-8 mb-2" />
            <p className="text-xs text-center">
              Image unavailable
            </p>
          </div>
        ) : imageUrl ? (
          <Image
            src={imageUrl}
            alt={image.sourceName}
            fill
            className="object-cover"
            sizes="(max-width: 540px) 50vw, 270px"
            unoptimized
            onError={() => setHasError(true)}
          />
        ) : null}

        {/* Selection overlay */}
        {isSelected && (
          <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
            <div className="bg-primary text-primary-foreground rounded-full p-2">
              <Check className="h-6 w-6" />
            </div>
          </div>
        )}
      </div>

      <div className="p-3 space-y-1 bg-background">
        <p className="text-sm font-medium truncate" title={image.sourceName}>
          {image.sourceName}
        </p>
        <div className="flex items-center justify-between">
          <Badge
            variant="secondary"
            className={cn("text-xs capitalize", getSourceColor(image.source))}
          >
            {image.source === "storage_unlinked"
              ? "unlinked storage"
              : image.source.replaceAll("_", " ")}
          </Badge>
          <p className="text-xs text-muted-foreground">
            {new Date(image.uploadedAt).toLocaleDateString()}
          </p>
        </div>
      </div>
    </div>
  );
}
