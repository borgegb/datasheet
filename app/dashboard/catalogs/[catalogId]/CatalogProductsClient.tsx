"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  startTransition,
} from "react";
import DatasheetsTable from "@/components/DatasheetsTable"; // Use the new table
import { columns, Product } from "@/app/dashboard/products/columns"; // Use columns from products
import { deleteProducts } from "@/app/dashboard/actions";
import { toast } from "sonner";
import type { Row } from "@tanstack/react-table";
import { createClient } from "@/lib/supabase/client";

// Define Category type
interface Category {
  id: string;
  name: string;
}

// Define Props
interface CatalogProductsClientProps {
  initialProducts: Product[];
  availableCategories: Category[];
  catalogName: string; // Keep track of the catalog name
}

export default function CatalogProductsClient({
  initialProducts,
  availableCategories,
  catalogName,
}: CatalogProductsClientProps) {
  // State for products (if needed for client-side updates like delete)
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [isLoading, setIsLoading] = useState(false); // Maybe track deleting state etc.

  // --- Delete Handlers (Adapted from ProductsPageClient) ---
  const handleDeleteSelectedRows = async (selectedRows: Row<Product>[]) => {
    const productIdsToDelete = selectedRows.map((row) => row.original.id);
    if (productIdsToDelete.length === 0) return;
    const toastId = toast.loading(
      `Deleting ${productIdsToDelete.length} datasheet(s)...`
    );
    setIsLoading(true);
    startTransition(async () => {
      const { error } = await deleteProducts(productIdsToDelete);
      if (error) {
        toast.error(`Failed to delete datasheets: ${error.message}`, {
          id: toastId,
        });
      } else {
        toast.success("Datasheet(s) deleted successfully.", { id: toastId });
        // Update local state to remove deleted items
        setProducts((prev) =>
          prev.filter((p) => !productIdsToDelete.includes(p.id))
        );
      }
      setIsLoading(false);
    });
  };

  const handleDeleteRow = async (productId: string) => {
    const productToDelete = products.find((p) => p.id === productId);
    const toastId = toast.loading(
      `Deleting "${productToDelete?.product_title || "datasheet"}"...`
    );
    setIsLoading(true);
    startTransition(async () => {
      const { error } = await deleteProducts([productId]);
      if (error) {
        toast.error(`Failed to delete datasheet: ${error.message}`, {
          id: toastId,
        });
      } else {
        toast.success("Datasheet deleted successfully.", { id: toastId });
        setProducts((prev) => prev.filter((p) => p.id !== productId));
      }
      setIsLoading(false);
    });
  };
  // --- End Delete Handlers ---

  // --- PDF Handlers (Adapted from ProductsPageClient) ---
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

  const handleDownload = async (storagePath: string, filename: string) => {
    if (!storagePath) {
      toast.error("No PDF file path found for this datasheet.");
      return;
    }
    const toastId = toast.loading("Downloading PDF...");
    try {
      const supabase = createClient();
      const { data: blobData, error: downloadError } = await supabase.storage
        .from("datasheet-assets")
        .download(storagePath);
      if (downloadError) throw downloadError;
      if (!blobData) throw new Error("Downloaded file data (Blob) is null.");
      const url = URL.createObjectURL(blobData);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Download started!", { id: toastId });
    } catch (error: any) {
      console.error("Error downloading file:", error);
      toast.error(`Download failed: ${error.message}`, { id: toastId });
    }
  };

  const handlePrint = async (storagePath: string, filename: string) => {
    if (!storagePath) {
      toast.error("No PDF file path found for printing.");
      return;
    }
    const toastId = toast.loading("Preparing PDF for printing...");

    try {
      const supabase = createClient();
      const { data: blobData, error: downloadError } = await supabase.storage
        .from("datasheet-assets")
        .download(storagePath);

      if (downloadError) throw downloadError;
      if (!blobData) throw new Error("Downloaded PDF data (Blob) is null.");

      const pdfUrl = URL.createObjectURL(blobData);
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.left = "-9999px";
      iframe.src = pdfUrl;
      iframe.title = `Printing ${filename}`;
      document.body.appendChild(iframe);

      iframe.onload = () => {
        setTimeout(() => {
          try {
            if (!iframe.contentWindow)
              throw new Error("Cannot access iframe content window.");
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            toast.success("Print dialog initiated!", { id: toastId });
          } catch (printError: any) {
            console.error("Error triggering print:", printError);
            toast.error(`Failed to initiate print: ${printError.message}`, {
              id: toastId,
            });
          } finally {
            // Debatable: Remove iframe immediately or after delay?
            // document.body.removeChild(iframe);
            // URL.revokeObjectURL(pdfUrl);
          }
        }, 200);
      };
      iframe.onerror = (err) => {
        console.error("Error loading PDF into iframe:", err);
        toast.error(`Failed to load PDF for printing.`, { id: toastId });
        // document.body.removeChild(iframe);
        // URL.revokeObjectURL(pdfUrl);
      };
    } catch (error: any) {
      console.error("Error preparing PDF for print:", error);
      toast.error(`Print preparation failed: ${error.message}`, {
        id: toastId,
      });
    }
  };

  const handleViewPdf = async (storagePath: string, filename: string) => {
    if (!storagePath) {
      toast.error("No PDF file path found to view.");
      return;
    }
    const toastId = toast.loading("Loading PDF...");
    try {
      const supabase = createClient();
      // Generate signed URL for viewing
      const { data: urlData, error: urlError } = await supabase.storage
        .from("datasheet-assets")
        .createSignedUrl(storagePath, 60 * 5); // 5 minute expiry

      if (urlError) throw urlError;
      if (!urlData?.signedUrl)
        throw new Error("Failed to generate signed URL.");

      window.open(urlData.signedUrl, "_blank");
      toast.success("PDF opened in new tab.", { id: toastId });
    } catch (error: any) {
      console.error("Error preparing PDF for viewing:", error);
      toast.error(`Failed to load PDF: ${error.message}`, { id: toastId });
    }
  };
  // --- End PDF Handlers ---

  return (
    <DatasheetsTable
      columns={columns}
      data={products} // Use local state
      availableCategories={availableCategories}
      onDeleteRow={handleDeleteRow}
      onDeleteRows={handleDeleteSelectedRows}
      onDownload={handleDownload}
      onPrint={handlePrint}
      onViewPdf={handleViewPdf}
      hideCatalogFilter={true} // Hide catalog filter on this specific page
      hideAddButton={true} // Hide the generic Add button from the table
      isLoading={isLoading} // Pass loading state if needed by table
    />
  );
}
