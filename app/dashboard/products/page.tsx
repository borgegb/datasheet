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
import { createClient } from "@/lib/supabase/client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

interface Catalog {
  id: string;
  name: string;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentCatalogFilter = searchParams.get("catalog");

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

  const handleDeleteSelectedRows = async (selectedRows: Row<Product>[]) => {
    const productIdsToDelete = selectedRows.map((row) => row.original.id);
    if (productIdsToDelete.length === 0) return;

    console.log("Deleting products:", productIdsToDelete);
    const toastId = toast.loading(
      `Deleting ${productIdsToDelete.length} datasheet(s)...`
    );

    startTransition(async () => {
      const { error } = await deleteProducts(productIdsToDelete);
      if (error) {
        console.error("Error deleting products:", error);
        toast.error(`Failed to delete datasheets: ${error.message}`, {
          id: toastId,
        });
      } else {
        toast.success("Datasheet(s) deleted successfully.", { id: toastId });
        loadProducts(currentCatalogFilter);
      }
    });
  };

  const handleDeleteRow = async (productId: string) => {
    console.log("Deleting single product:", productId);
    const toastId = toast.loading(`Deleting datasheet...`);

    startTransition(async () => {
      const { error } = await deleteProducts([productId]);
      if (error) {
        console.error("Error deleting product:", error);
        toast.error(`Failed to delete datasheet: ${error.message}`, {
          id: toastId,
        });
      } else {
        toast.success("Datasheet deleted successfully.", { id: toastId });
        loadProducts(currentCatalogFilter);
      }
    });
  };

  const handleDownload = async (storagePath: string, filename: string) => {
    if (!storagePath) {
      toast.error("No PDF file path found for this datasheet.");
      return;
    }
    console.log(`Attempting download for path: ${storagePath}`);
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

  return (
    <div className="flex flex-col flex-1 p-4 md:p-6">
      <h1 className="text-2xl font-semibold mb-6">Saved Datasheets</h1>

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
    </div>
  );
}
