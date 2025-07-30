"use client";

import { ColumnDef, FilterFn, RowData, Row } from "@tanstack/react-table";
import {
  ArrowUpDown,
  MoreHorizontal,
  Edit,
  Trash2,
  Download,
  Printer,
  ExternalLink,
  Eye,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";

// Define the shape of our Product data (matching the fetch in page.tsx)
export interface Product {
  id: string;
  product_title: string | null;
  product_code: string | null;
  pdf_storage_path: string | null;
  category_ids: string[] | null;
}

// Define the type for the cell context, including our custom delete function
// This avoids prop drilling through the main table component
interface ProductCellContext {
  onDeleteRow?: (productId: string) => void;
  onDownload?: (storagePath: string, filename: string) => void;
  onPrint?: (storagePath: string, filename: string) => void;
  onViewPdf?: (storagePath: string, filename: string) => void;
  availableCategories?: Category[];
}

// Define Category type used in meta and rendering
interface Category {
  id: string;
  name: string;
}

// Custom filter function for categories (imported or redefined)
const categoriesFilterFn: FilterFn<any> = (
  row,
  columnId,
  filterValue: string[]
) => {
  if (!filterValue?.length) return true;
  const rowCategoryIds = row.getValue(columnId) as string[] | null | undefined;
  if (!rowCategoryIds || rowCategoryIds.length === 0) return false;
  return rowCategoryIds.some((id) => filterValue.includes(id));
};

// Helper function to generate safe filenames
const getSafeFilename = (
  name: string | null | undefined,
  code: string | null | undefined,
  extension: string
): string => {
  const safeBase = (name || code || "datasheet")
    .replace(/[^a-z0-9]/gi, "_")
    .toLowerCase();
  return `${safeBase}.${extension}`;
};

// Extend TableMeta interface to include availableCategories
declare module "@tanstack/react-table" {
  interface TableMeta<TData extends RowData> {
    onDeleteRow?: (productId: string) => void;
    onRemoveFromCatalog?: (productId: string) => void;
    onRemoveSelectedFromCatalog?: (selectedRows: Row<TData>[]) => void;
    onDownload?: (storagePath: string, filename: string) => void;
    onPrint?: (storagePath: string, filename: string) => void;
    onViewPdf?: (storagePath: string, filename: string) => void;
    availableCategories?: Category[];
  }
}

export const columns: ColumnDef<Product>[] = [
  // Optional: Select Checkbox Column (can be removed if not needed)
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    size: 40,
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "product_title",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Product Title
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    size: 250,
    cell: ({ row }) => {
      return (
        <div className="font-medium">
          {row.getValue("product_title") || (
            <span className="text-muted-foreground italic">
              Untitled Datasheet
            </span>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "product_code",
    header: "Product Code",
    size: 150,
    cell: ({ row }) => {
      return (
        row.getValue("product_code") || (
          <span className="text-muted-foreground italic">No Code</span>
        )
      );
    },
  },
  {
    accessorKey: "category_ids",
    header: "Categories",
    size: 200,
    filterFn: categoriesFilterFn,
    enableSorting: false,
    cell: ({ row, table }) => {
      const categoryIds = row.getValue("category_ids") as string[] | null;
      const availableCategories = table.options.meta?.availableCategories;

      if (!categoryIds || categoryIds.length === 0 || !availableCategories) {
        return (
          <span className="text-muted-foreground text-xs italic">None</span>
        );
      }

      const categoryNames = categoryIds
        .map((id) => availableCategories.find((cat) => cat.id === id)?.name)
        .filter((name) => name !== undefined) as string[];

      if (categoryNames.length === 0) {
        return (
          <span className="text-muted-foreground text-xs italic">Unknown</span>
        );
      }

      return (
        <div className="flex flex-wrap gap-1">
          {categoryNames.map((name) => (
            <Badge key={name} variant="secondary" className="font-normal">
              {name}
            </Badge>
          ))}
        </div>
      );
    },
  },
  {
    id: "actions",
    size: 60,
    enableHiding: false,
    cell: ({ row, table }) => {
      const product = row.original;
      const safeFilename = getSafeFilename(
        product.product_title,
        product.product_code,
        "pdf"
      );

      return (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              {/* Only show Edit for owners and members, not viewers */}
              {table.options.meta?.userRole !== "viewer" && (
                <DropdownMenuItem asChild>
                  <Link
                    href={`/dashboard/generator/${product.id}`}
                    className="cursor-pointer"
                  >
                    <Edit className="mr-2 h-4 w-4" /> Edit
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                disabled={!product.pdf_storage_path}
                onSelect={() =>
                  table.options.meta?.onViewPdf?.(
                    product.pdf_storage_path!,
                    safeFilename
                  )
                }
                className="cursor-pointer"
              >
                <Eye className="mr-2 h-4 w-4" /> View PDF
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!product.pdf_storage_path}
                onSelect={() =>
                  table.options.meta?.onDownload?.(
                    product.pdf_storage_path!,
                    safeFilename
                  )
                }
                className="cursor-pointer"
              >
                <Download className="mr-2 h-4 w-4" /> Download PDF
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!product.pdf_storage_path}
                onSelect={() =>
                  table.options.meta?.onPrint?.(
                    product.pdf_storage_path!,
                    safeFilename
                  )
                }
                className="cursor-pointer"
              >
                <Printer className="mr-2 h-4 w-4" /> Print PDF
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {/* Remove from Catalog - only show when handler is available */}
              {table.options.meta?.onRemoveFromCatalog && (
                <>
                  <DropdownMenuItem
                    className="text-orange-600 focus:text-orange-700 cursor-pointer"
                    onSelect={() =>
                      table.options.meta?.onRemoveFromCatalog?.(product.id)
                    }
                  >
                    <ExternalLink className="mr-2 h-4 w-4" /> Remove from
                    Catalog
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {/* Only show Delete for owners and members, not viewers */}
              {table.options.meta?.userRole !== "viewer" && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive cursor-pointer"
                  onSelect={() => table.options.meta?.onDeleteRow?.(product.id)}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    },
  },
];
