"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageIcon, FileImage, Package } from "lucide-react";
import { ImageItem } from "../types";
import { cn } from "@/lib/utils";

interface ImageCardProps {
  image: ImageItem;
  onClick: () => void;
  onLoadImage: (image: ImageItem) => Promise<string | null>;
}

export default function ImageCard({
  image,
  onClick,
  onLoadImage,
}: ImageCardProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(image.url || null);
  const [isLoading, setIsLoading] = useState(!image.url);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!imageUrl && !hasError) {
      loadImage();
    }
  }, []);

  const loadImage = async () => {
    setIsLoading(true);
    const url = await onLoadImage(image);

    if (url) {
      setImageUrl(url);
    } else {
      setHasError(true);
    }
    setIsLoading(false);
  };

  const getSourceIcon = () => {
    switch (image.source) {
      case "products":
        return <Package className="h-3 w-3" />;
      case "kanban_cards":
        return <FileImage className="h-3 w-3" />;
      case "catalogs":
        return <ImageIcon className="h-3 w-3" />;
    }
  };

  const getSourceColor = () => {
    switch (image.source) {
      case "products":
        return "bg-blue-500/10 text-blue-600 hover:bg-blue-500/20";
      case "kanban_cards":
        return "bg-green-500/10 text-green-600 hover:bg-green-500/20";
      case "catalogs":
        return "bg-purple-500/10 text-purple-600 hover:bg-purple-500/20";
    }
  };

  return (
    <Card
      className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow group"
      onClick={onClick}
    >
      <div className="aspect-square relative bg-muted">
        {isLoading ? (
          <Skeleton className="w-full h-full" />
        ) : hasError ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground p-4">
            <ImageIcon className="h-12 w-12 mb-2" />
            <p className="text-xs text-center">Image unavailable</p>
          </div>
        ) : imageUrl ? (
          <Image
            src={imageUrl}
            alt={image.sourceName}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw"
          />
        ) : null}
      </div>

      <div className="p-3 space-y-2">
        <p className="text-sm font-medium truncate" title={image.sourceName}>
          {image.sourceName}
        </p>

        <div className="flex items-center justify-between">
          <Badge
            variant="secondary"
            className={cn("text-xs capitalize", getSourceColor())}
          >
            <span className="mr-1">{getSourceIcon()}</span>
            {image.source.replace("_", " ")}
          </Badge>

          <p className="text-xs text-muted-foreground">
            {new Date(image.uploadedAt).toLocaleDateString()}
          </p>
        </div>
      </div>
    </Card>
  );
}
