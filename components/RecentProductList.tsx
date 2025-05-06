"use client";

import React from "react";
import Link from "next/link";
import {
  MoreHorizontal,
  EditIcon,
  Download,
  Eye,
  TrashIcon,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { createClient } from "@/lib/supabase/client";
import { deleteProducts } from "@/app/dashboard/actions"; // Assuming this path is correct relative to components dir
import { toast } from "sonner";

interface RecentProduct {
  id: string;
  product_title: string | null;
  product_code: string | null;
  updated_at: string | null;
  pdf_storage_path: string | null;
}

interface RecentProductListProps {
  items: RecentProduct[];
}

export function RecentProductList({ items }: RecentProductListProps) {
  const [isDeleting, setIsDeleting] = React.useState<string | null>(null); // Store ID being deleted

  const getSafeFilename = (
    name: string | null | undefined,
    code: string | null | undefined,
    extension: string
  ) => {
    const safeBase = (name || code || "datasheet")
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase();
    return `${safeBase}.${extension}`;
  };

  const handleViewPdf = async (storagePath: string, filename: string) => {
    if (!storagePath) {
      toast.error("No PDF available for this datasheet.");
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from("datasheet-assets") // Use correct bucket name
      .createSignedUrl(storagePath, 60 * 1); // 1 minute expiry for view

    if (error) {
      console.error("Error generating signed URL:", error);
      toast.error("Could not get PDF URL. Please try again.");
    } else {
      window.open(data.signedUrl, "_blank");
    }
  };

  const handleDownloadPdf = async (storagePath: string, filename: string) => {
    if (!storagePath) {
      toast.error("No PDF available for this datasheet.");
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from("datasheet-assets") // Use correct bucket name
      .download(storagePath);

    if (error) {
      console.error("Error downloading PDF:", error);
      toast.error(`Failed to download PDF: ${error.message}`);
    } else {
      const url = window.URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("PDF download started.");
    }
  };

  const handleDeleteProduct = async (
    productId: string,
    productName: string | null
  ) => {
    setIsDeleting(productId);
    const deleteToastId = toast.loading(
      `Deleting "${productName || "datasheet"}"...`
    );

    const result = await deleteProducts([productId]); // deleteProducts expects an array

    toast.dismiss(deleteToastId);
    setIsDeleting(null);

    if (result.error) {
      toast.error(`Failed to delete: ${result.error.message}`);
    } else {
      toast.success(`"${productName || "Datasheet"}" deleted successfully.`);
      // Note: List won't refresh automatically here unless parent page re-fetches.
      // Consider adding a callback prop if instant refresh is needed.
    }
  };

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No recent datasheet activity found.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((product) => {
        const safeFilename = getSafeFilename(
          product.product_title,
          product.product_code,
          "pdf"
        );
        const isCurrentlyDeleting = isDeleting === product.id;
        return (
          <li
            key={product.id}
            className="flex items-center justify-between gap-x-2 p-3 border rounded-md text-sm hover:bg-muted/50"
          >
            <div className="flex-1 truncate min-w-0">
              <span className="font-medium truncate block">
                {product.product_title || "Untitled Datasheet"}
              </span>
              <span className="text-muted-foreground text-xs">
                ({product.product_code || "No Code"})
              </span>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  disabled={isCurrentlyDeleting}
                >
                  {isCurrentlyDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MoreHorizontal className="h-4 w-4" />
                  )}
                  <span className="sr-only">Actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link
                    href={`/dashboard/generator/${product.id}`}
                    className="cursor-pointer"
                  >
                    <EditIcon className="mr-2 h-4 w-4" /> Edit
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!product.pdf_storage_path}
                  onSelect={() =>
                    product.pdf_storage_path &&
                    handleViewPdf(product.pdf_storage_path, safeFilename)
                  }
                  className="cursor-pointer"
                >
                  <Eye className="mr-2 h-4 w-4" /> View PDF
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!product.pdf_storage_path}
                  onSelect={() =>
                    product.pdf_storage_path &&
                    handleDownloadPdf(product.pdf_storage_path, safeFilename)
                  }
                  className="cursor-pointer"
                >
                  <Download className="mr-2 h-4 w-4" /> Download PDF
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    {/* This item triggers the AlertDialog */}
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                      onSelect={(e) => e.preventDefault()} // Prevent closing dropdown when triggering dialog
                    >
                      <TrashIcon className="mr-2 h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently
                        delete the datasheet "
                        <strong>
                          {product.product_title || "Untitled Datasheet"}
                        </strong>
                        ".
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() =>
                          handleDeleteProduct(product.id, product.product_title)
                        }
                        className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                      >
                        Yes, delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        );
      })}
    </ul>
  );
}
