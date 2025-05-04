"use client";

import React, {
  useState,
  useEffect,
  startTransition,
  useCallback,
} from "react";
import ProductsDataTable from "@/components/ProductsDataTable";
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

// This component contains all the client-side logic
export default function ProductsPageClient() {
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
      setIsLoading(true);
      const { data: catalogData, error: catalogError } =
        await fetchCatalogsForOrg();
      if (!isMounted) return;
      if (catalogError) {
        toast.error(`Failed to fetch catalogs: ${catalogError.message}`);
        setCatalogs([]);
      } else {
        setCatalogs(catalogData || []);
      }
      loadProducts(currentCatalogFilter);
    };
    fetchInitialData();
    return () => {
      isMounted = false;
    };
  }, [loadProducts, currentCatalogFilter]);

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

  return (
    <>
      {/* Table and its associated UI (Filters, Pagination) */}
      <ProductsDataTable
        columns={columns}
        data={isLoading ? [] : products}
        onDeleteRows={handleDeleteSelectedRows}
        onDeleteRow={handleDeleteRow}
        onDownload={handleDownload}
        catalogs={catalogs}
        currentCatalogFilter={currentCatalogFilter}
        isLoading={isLoading}
      />
    </>
  );
}
