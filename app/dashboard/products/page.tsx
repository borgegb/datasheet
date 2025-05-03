"use client";

import React, { useState, useEffect, startTransition } from "react";
import ProductsDataTable from "@/components/ProductsDataTable";
import { columns, Product } from "./columns";
import { fetchProductsForOrg, deleteProducts } from "../actions";
import { toast } from "sonner";
import type { Row } from "@tanstack/react-table";

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadProducts = () => {
    setIsLoading(true);
    startTransition(async () => {
      const { data, error } = await fetchProductsForOrg();
      if (error) {
        console.error("Error fetching products via action:", error);
        toast.error(`Failed to fetch datasheets: ${error.message}`);
        setProducts([]);
      } else {
        setProducts(data || []);
      }
      setIsLoading(false);
    });
  };

  useEffect(() => {
    loadProducts();
  }, []);

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
        loadProducts();
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
        loadProducts();
      }
    });
  };

  return (
    <div className="flex flex-col flex-1 p-4 md:p-6">
      <h1 className="text-2xl font-semibold mb-6">Saved Datasheets</h1>

      {isLoading ? (
        <p>Loading datasheets...</p>
      ) : (
        <ProductsDataTable
          columns={columns}
          data={products}
          onDeleteRows={handleDeleteSelectedRows}
          onDeleteRow={handleDeleteRow}
        />
      )}
    </div>
  );
}
