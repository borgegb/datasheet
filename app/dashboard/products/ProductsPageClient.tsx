"use client";

import React, {
  useState,
  useEffect,
  startTransition,
  useCallback,
} from "react";
import DatasheetsTable from "@/components/DatasheetsTable";
import { columns, Product } from "./columns";
import {
  fetchProductsForOrg,
  deleteProducts,
  fetchCatalogsForOrg,
} from "../actions";
import { toast } from "sonner";
import type { Row } from "@tanstack/react-table";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Catalog type definition
interface Catalog {
  id: string;
  name: string;
}

// Define Category type for props
interface Category {
  id: string;
  name: string;
}

// --- Define Props for ProductsPageClient ---
interface ProductsPageClientProps {
  initialProducts?: Product[]; // Optional initial products
  initialCatalogs?: Catalog[]; // Optional initial catalogs
  hideCatalogFilter?: boolean; // <-- Add new prop
  hideAddButton?: boolean; // <-- Add prop here
  availableCategories: Category[];
}
// ----------------------------------------

// This component contains all the client-side logic
// --- Update component signature to accept props ---
export default function ProductsPageClient({
  initialProducts,
  initialCatalogs,
  hideCatalogFilter = false,
  hideAddButton = false,
  availableCategories,
}: ProductsPageClientProps) {
  // ----------------------------------------------
  // --- Update state initialization with initial props ---
  const [products, setProducts] = useState<Product[]>(
    initialProducts || [] // Use initial or empty array
  );
  const [catalogs, setCatalogs] = useState<Catalog[]>(
    initialCatalogs || [] // Use initial or empty array
  );
  // Set initial loading state based on whether initialProducts were provided
  const [isLoading, setIsLoading] = useState(!initialProducts); // If initial data exists, not loading initially
  // --------------------------------------------------

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams(); // Use hook here

  const currentCatalogFilter = searchParams.get("catalog");

  // Function to load products, now accepting catalog filter
  const loadProducts = useCallback((catalogIdFilter: string | null) => {
    setIsLoading(true);
    startTransition(async () => {
      const { data, error } = await fetchProductsForOrg(catalogIdFilter);
      if (error) {
        toast.error(`Failed to fetch datasheets: ${error.message}`);
        setProducts([]);
      } else {
        setProducts(data || []);
      }
      setIsLoading(false);
    });
  }, []);

  // Effect to fetch initial data (catalogs and products based on URL filter)
  useEffect(() => {
    let isMounted = true;
    const fetchInitialData = async () => {
      // --- Conditionally fetch Catalogs ---
      if (!initialCatalogs) {
        console.log("ProductsPageClient: No initial catalogs, fetching...");
        setIsLoading(true); // Ensure loading is true if fetching
        const { data: catalogData, error: catalogError } =
          await fetchCatalogsForOrg();
        if (!isMounted) return;
        if (catalogError) {
          toast.error(`Failed to fetch catalogs: ${catalogError.message}`);
          setCatalogs([]);
        } else {
          setCatalogs(catalogData || []);
        }
      } else {
        console.log("ProductsPageClient: Using initial catalogs.");
        setCatalogs(initialCatalogs); // Already set in useState, but explicit
      }
      // -----------------------------------

      // --- Conditionally load Products ---
      // Only fetch products if initialProducts were NOT provided
      if (!initialProducts) {
        console.log("ProductsPageClient: No initial products, fetching...");
        // Loading state is handled within loadProducts
        loadProducts(currentCatalogFilter);
      } else {
        console.log("ProductsPageClient: Using initial products.");
        setProducts(initialProducts); // Already set in useState
        setIsLoading(false); // Ensure loading is false if using initial data
      }
      // --------------------------------
    };

    // Run the fetch logic
    fetchInitialData();

    return () => {
      isMounted = false;
    };
    // Depend on initial props as well to re-run if they change (though unlikely here)
  }, [loadProducts, currentCatalogFilter, initialProducts, initialCatalogs]);

  // Handler for bulk deletion
  const handleDeleteSelectedRows = async (selectedRows: Row<Product>[]) => {
    const productIdsToDelete = selectedRows.map((row) => row.original.id);
    if (productIdsToDelete.length === 0) return;
    const toastId = toast.loading(
      `Deleting ${productIdsToDelete.length} datasheet(s)...`
    );
    startTransition(async () => {
      const { error } = await deleteProducts(productIdsToDelete);
      if (error) {
        toast.error(`Failed to delete datasheets: ${error.message}`, {
          id: toastId,
        });
      } else {
        toast.success("Datasheet(s) deleted successfully.", { id: toastId });
        loadProducts(currentCatalogFilter); // Reload with current filter
      }
    });
  };

  // Handler for single row deletion
  const handleDeleteRow = async (productId: string) => {
    const toastId = toast.loading(`Deleting datasheet...`);
    startTransition(async () => {
      const { error } = await deleteProducts([productId]);
      if (error) {
        toast.error(`Failed to delete datasheet: ${error.message}`, {
          id: toastId,
        });
      } else {
        toast.success("Datasheet deleted successfully.", { id: toastId });
        loadProducts(currentCatalogFilter); // Reload with current filter
      }
    });
  };

  // Handler for single row download
  const handleDownload = async (storagePath: string, filename: string) => {
    if (!storagePath) {
      toast.error("No PDF file path found for this datasheet.");
      return;
    }
    const toastId = toast.loading("Downloading PDF...");
    try {
      const supabase = createClient(); // Use client-side client for download
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

  // --- ADD handlePrint function ---
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

      // Create a hidden iframe
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.left = "-9999px"; // Position off-screen
      iframe.src = pdfUrl;
      iframe.title = `Printing ${filename}`; // Add title for accessibility/debugging

      document.body.appendChild(iframe);

      iframe.onload = () => {
        // Add a small delay to ensure PDF rendering is complete
        setTimeout(() => {
          try {
            if (!iframe.contentWindow) {
              throw new Error("Cannot access iframe content window.");
            }
            // Attempt to focus the iframe before printing
            iframe.contentWindow.focus();
            // Trigger print dialog
            iframe.contentWindow.print();
            toast.success("Print dialog initiated!", { id: toastId });
          } catch (printError: any) {
            console.error("Error triggering print:", printError);
            toast.error(`Failed to initiate print: ${printError.message}`, {
              id: toastId,
            });
          } finally {
            // Clean up iframe and object URL after a longer delay
            document.body.removeChild(iframe);
            URL.revokeObjectURL(pdfUrl);
          }
        }, 200); // Small delay (e.g., 200ms)
      };

      iframe.onerror = (err) => {
        console.error("Error loading PDF into iframe:", err);
        toast.error(`Failed to load PDF for printing.`, { id: toastId });
        document.body.removeChild(iframe);
        URL.revokeObjectURL(pdfUrl);
      };
    } catch (error: any) {
      console.error("Error preparing PDF for print:", error);
      toast.error(`Print preparation failed: ${error.message}`, {
        id: toastId,
      });
    }
  };
  // ---                        ---

  // --- ADD handleViewPdf function ---
  const handleViewPdf = async (storagePath: string, filename: string) => {
    if (!storagePath) {
      toast.error("No PDF file path found to view.");
      return;
    }
    const toastId = toast.loading("Loading PDF...");

    try {
      const supabase = createClient();
      const { data: blobData, error: downloadError } = await supabase.storage
        .from("datasheet-assets")
        .download(storagePath);

      if (downloadError) throw downloadError;
      if (!blobData) throw new Error("Downloaded PDF data (Blob) is null.");

      const pdfUrl = URL.createObjectURL(blobData);
      window.open(pdfUrl, "_blank"); // Open in new tab
      toast.success("PDF opened in new tab.", { id: toastId });

      // Optional: Revoke URL after a delay
      // setTimeout(() => URL.revokeObjectURL(pdfUrl), 60000); // e.g., after 1 minute
    } catch (error: any) {
      console.error("Error preparing PDF for viewing:", error);
      toast.error(`Failed to load PDF: ${error.message}`, { id: toastId });
    }
  };
  // ---                           ---

  // Log the products data just before rendering the table
  console.log("Products data passed to table:", products);

  return (
    <>
      {/* Table and its associated UI (Filters, Pagination) */}
      <DatasheetsTable
        columns={columns}
        data={isLoading ? [] : products}
        onDeleteRows={handleDeleteSelectedRows}
        onDeleteRow={handleDeleteRow}
        onDownload={handleDownload}
        onPrint={handlePrint}
        onViewPdf={handleViewPdf}
        catalogs={catalogs}
        currentCatalogFilter={currentCatalogFilter}
        isLoading={isLoading}
        hideCatalogFilter={hideCatalogFilter}
        hideAddButton={hideAddButton}
        availableCategories={availableCategories}
      />
    </>
  );
}
