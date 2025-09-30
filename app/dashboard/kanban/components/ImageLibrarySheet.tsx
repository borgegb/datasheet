"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, ImageIcon, Check, Loader2 } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface ImageItem {
  id: string;
  path: string;
  url?: string;
  source: 'products' | 'kanban_cards' | 'catalogs';
  sourceName: string;
  uploadedAt: string;
}

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
  const [loadingImages, setLoadingImages] = useState<Set<string>>(new Set());

  // Fetch images when sheet opens
  useEffect(() => {
    if (open) {
      fetchImages();
    }
  }, [open, organizationId]);

  const fetchImages = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/image-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch images');
      }

      const data = await response.json();
      setImages(data.images || []);
      setFilteredImages(data.images || []);
    } catch (error) {
      console.error('Error fetching images:', error);
      setImages([]);
      setFilteredImages([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter images based on search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredImages(images);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = images.filter(img => 
      img.sourceName.toLowerCase().includes(query) ||
      img.path.toLowerCase().includes(query)
    );
    setFilteredImages(filtered);
  }, [searchQuery, images]);

  // Load image URL on demand
  const loadImageUrl = async (image: ImageItem): Promise<string | null> => {
    if (image.url) return image.url;

    setLoadingImages(prev => new Set(prev).add(image.id));
    
    try {
      const response = await fetch('/api/image-library/signed-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagePath: image.path }),
      });

      if (!response.ok) {
        throw new Error('Failed to get signed URL');
      }

      const { url } = await response.json();
      
      // Update the image with the URL
      setImages(prev => prev.map(img => 
        img.id === image.id ? { ...img, url } : img
      ));
      setFilteredImages(prev => prev.map(img => 
        img.id === image.id ? { ...img, url } : img
      ));
      
      return url;
    } catch (error) {
      console.error('Error loading image URL:', error);
      return null;
    } finally {
      setLoadingImages(prev => {
        const newSet = new Set(prev);
        newSet.delete(image.id);
        return newSet;
      });
    }
  };

  const handleSelectImage = (image: ImageItem) => {
    // Extract filename from path
    const fileName = image.path.split('/').pop() || 'image';
    onSelectImage(image.path, fileName);
    setSelectedImage(image.id);
    
    // Close sheet after a brief delay to show selection
    setTimeout(() => {
      onOpenChange(false);
      setSelectedImage(null);
      setSearchQuery("");
    }, 300);
  };

  const getSourceColor = (source: string) => {
    switch (source) {
      case 'products':
        return 'bg-blue-500/10 text-blue-600';
      case 'kanban_cards':
        return 'bg-green-500/10 text-green-600';
      case 'catalogs':
        return 'bg-purple-500/10 text-purple-600';
      default:
        return 'bg-gray-500/10 text-gray-600';
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:w-[540px] sm:max-w-[540px] p-0 flex flex-col">
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle>Select Image from Library</SheetTitle>
          <SheetDescription>
            Choose an image for your kanban card
          </SheetDescription>
        </SheetHeader>

        {/* Search Bar */}
        <div className="px-6 py-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search images..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
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
                {searchQuery ? 'No images found matching your search' : 'No images available'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 py-4">
              {filteredImages.map((image) => (
                <ImageCard
                  key={image.id}
                  image={image}
                  isSelected={selectedImage === image.id}
                  isLoading={loadingImages.has(image.id)}
                  onSelect={() => handleSelectImage(image)}
                  onLoadImage={loadImageUrl}
                  getSourceColor={getSourceColor}
                />
              ))}
            </div>
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
  isLoading: boolean;
  onSelect: () => void;
  onLoadImage: (image: ImageItem) => Promise<string | null>;
  getSourceColor: (source: string) => string;
}

function ImageCard({ 
  image, 
  isSelected, 
  isLoading,
  onSelect, 
  onLoadImage,
  getSourceColor 
}: ImageCardProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(image.url || null);
  const [hasError, setHasError] = useState(false);
  const [isLoadingImage, setIsLoadingImage] = useState(!image.url);

  useEffect(() => {
    if (!imageUrl && !hasError) {
      loadImage();
    }
  }, []);

  const loadImage = async () => {
    setIsLoadingImage(true);
    const url = await onLoadImage(image);
    if (url) {
      setImageUrl(url);
    } else {
      setHasError(true);
    }
    setIsLoadingImage(false);
  };

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
        {isLoadingImage || isLoading ? (
          <div className="w-full h-full flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : hasError ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground p-4">
            <ImageIcon className="h-8 w-8 mb-2" />
            <p className="text-xs text-center">Image unavailable</p>
          </div>
        ) : imageUrl ? (
          <Image
            src={imageUrl}
            alt={image.sourceName}
            fill
            className="object-cover"
            sizes="(max-width: 540px) 50vw, 270px"
            unoptimized
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
            {image.source.replace('_', ' ')}
          </Badge>
          <p className="text-xs text-muted-foreground">
            {new Date(image.uploadedAt).toLocaleDateString()}
          </p>
        </div>
      </div>
    </div>
  );
}
