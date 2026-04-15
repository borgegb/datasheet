export type ImageSource =
  | "products"
  | "kanban_cards"
  | "production_kanban_cards"
  | "catalogs"
  | "storage_unlinked";

// Image types for the library
export interface ImageItem {
  id: string;
  path: string;
  url?: string; // Signed URL for display
  source: ImageSource;
  sourceId: string; // ID of the product/card/catalog
  sourceName: string; // Name of the product/card/catalog
  uploadedAt: string;
  organizationId: string;
  fileSize?: number;
  dimensions?: {
    width: number;
    height: number;
  };
}

export interface ImageFilters {
  source?: "all" | ImageSource;
  searchQuery?: string;
  dateRange?: {
    start?: Date;
    end?: Date;
  };
  sortBy?: 'date' | 'name' | 'size';
  sortOrder?: 'asc' | 'desc';
}

export interface ImageLibraryData {
  images: ImageItem[];
  totalCount: number;
  error?: string;
}
