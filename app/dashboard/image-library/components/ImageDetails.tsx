"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Download, ExternalLink, Copy, X } from "lucide-react";
import { ImageItem } from "../types";
import { toast } from "sonner";

interface ImageDetailsProps {
  image: ImageItem | null;
  onClose: () => void;
  onLoadImage: (image: ImageItem) => Promise<string | null>;
}

export default function ImageDetails({ image, onClose, onLoadImage }: ImageDetailsProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    if (image) {
      loadImageDetails();
    }
  }, [image]);
  
  const loadImageDetails = async () => {
    if (!image) return;
    
    setIsLoading(true);
    const url = image.url || await onLoadImage(image);
    setImageUrl(url);
    setIsLoading(false);
  };
  
  const handleDownload = async () => {
    if (!imageUrl || !image) return;
    
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = image.path.split('/').pop() || 'image';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Image downloaded successfully");
    } catch (error) {
      toast.error("Failed to download image");
    }
  };
  
  const handleCopyPath = () => {
    if (!image) return;
    navigator.clipboard.writeText(image.path);
    toast.success("Path copied to clipboard");
  };
  
  const handleOpenSource = () => {
    if (!image) return;
    
    let url = '';
    switch (image.source) {
      case 'products':
        url = `/dashboard/generator?productId=${image.sourceId}`;
        break;
      case 'kanban_cards':
        url = `/dashboard/kanban/${image.sourceId}`;
        break;
      case 'catalogs':
        url = `/dashboard/catalogs/${image.sourceId}`;
        break;
    }
    
    if (url) {
      window.open(url, '_blank');
    }
  };
  
  if (!image) return null;
  
  return (
    <Sheet open={!!image} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            <span className="truncate pr-2">{image.sourceName}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </SheetTitle>
        </SheetHeader>
        
        <div className="mt-6 space-y-6">
          {/* Image Preview */}
          <div className="relative aspect-square w-full bg-muted rounded-lg overflow-hidden">
            {isLoading ? (
              <Skeleton className="w-full h-full" />
            ) : imageUrl ? (
              <Image
                src={imageUrl}
                alt={image.sourceName}
                fill
                className="object-contain"
                sizes="(max-width: 640px) 100vw, 576px"
                unoptimized
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                Failed to load image
              </div>
            )}
          </div>
          
          {/* Image Details */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Details</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Source</span>
                  <Badge variant="secondary" className="capitalize">
                    {image.source.replace('_', ' ')}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Uploaded</span>
                  <span className="text-sm text-muted-foreground">
                    {new Date(image.uploadedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">File Path</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handleCopyPath}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </Button>
                </div>
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="default"
                className="flex-1"
                onClick={handleDownload}
                disabled={!imageUrl}
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleOpenSource}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                View Source
              </Button>
            </div>
            
            {/* Path Display */}
            <div className="p-3 bg-muted rounded-md">
              <p className="text-xs font-mono break-all">{image.path}</p>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
