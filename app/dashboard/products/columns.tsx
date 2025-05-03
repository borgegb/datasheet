"use client";

import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, MoreHorizontal, Edit, Trash2 } from "lucide-react";
import Link from "next/link";

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

// Define the shape of our Product data (matching the fetch in page.tsx)
export interface Product {
  id: string;
  product_title: string;
  product_code: string;
  // Add catalog_name etc. here if you join/fetch it
}

// Define the type for the cell context, including our custom delete function
// This avoids prop drilling through the main table component
interface ProductCellContext {
  onDeleteRow?: (productId: string) => void;
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
  },
  {
    accessorKey: "product_code",
    header: "Product Code",
  },
  // TODO: Add Catalog column if needed
  // {
  //   accessorKey: "catalog_name", // Assumes you fetch/join catalog name
  //   header: "Catalog",
  // },
  {
    id: "actions",
    cell: ({ row, table }) => {
      const product = row.original;
      // Get the delete handler from table meta options (we will set this up in ProductsDataTable)
      const tableMeta = table.options.meta as {
        onDeleteRow?: (productId: string) => void;
      };
      const handleDelete = () => {
        if (tableMeta?.onDeleteRow) {
          tableMeta.onDeleteRow(product.id);
        }
      };

      return (
        // Use AlertDialog to wrap the delete action
        <AlertDialog>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href={`/dashboard/generator/${product.id}`}>
                  <Edit className="mr-2 h-4 w-4" /> Edit
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {/* TODO: Add Download action */}
              <DropdownMenuItem disabled>Download PDF</DropdownMenuItem>
              {/* Delete Action - Triggers AlertDialog */}
              <AlertDialogTrigger asChild>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive cursor-pointer"
                  onSelect={(e) => e.preventDefault()} // Prevent closing dropdown immediately
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </DropdownMenuItem>
              </AlertDialogTrigger>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Alert Dialog Content for Delete Confirmation */}
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the
                datasheet titled "{product.product_title}".
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              {/* Call the handleDelete passed via context/meta */}
              <AlertDialogAction onClick={handleDelete}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      );
    },
  },
];
