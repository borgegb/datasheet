import React from "react";
import { notFound } from "next/navigation";
import ProductsPageClient from "@/app/dashboard/products/ProductsPageClient"; // Re-use the client component
import {
  fetchProductsForOrg,
  fetchCatalogsForOrg,
} from "@/app/dashboard/actions"; // Import actions

// Define props type including params
interface CatalogProductsPageProps {
  params: {
    catalogId: string;
  };
}

// This page will be a Server Component to fetch data
export default async function CatalogProductsPage({
  params,
}: CatalogProductsPageProps) {
  const { catalogId } = params;

  if (!catalogId) {
    notFound(); // Handle missing ID
  }

  // --- Fetch Catalog Name ---
  // Option 1: Fetch all and find (simpler if list isn't huge)
  const { data: allCatalogs, error: catalogError } =
    await fetchCatalogsForOrg();
  const currentCatalog = allCatalogs?.find((cat) => cat.id === catalogId);
  // Option 2: Create fetchCatalogById action (more efficient for many catalogs)
  // const { data: currentCatalog, error: catalogError } = await fetchCatalogById(catalogId);

  if (catalogError || !currentCatalog) {
    // Handle error fetching catalog name or if catalog not found
    console.error(`Error fetching catalog ${catalogId}:`, catalogError);
    // Maybe show an error message or redirect? For now, just log.
    // Depending on behavior, you might call notFound() here too.
  }

  // --- Fetch Products for this Catalog ---
  // fetchProductsForOrg already accepts a catalogId filter
  const { data: products, error: productsError } = await fetchProductsForOrg(
    catalogId
  );

  if (productsError) {
    // Handle error fetching products - maybe pass error state to client?
    console.error(
      `Error fetching products for catalog ${catalogId}:`,
      productsError
    );
  }

  // --- Render the Page ---
  return (
    <div className="flex flex-col flex-1 p-4 md:p-6">
      <h1 className="text-2xl font-semibold mb-6">
        Datasheets in Catalog: {currentCatalog?.name || "Loading..."}
      </h1>

      {/* Render the existing client component, passing the filtered products */}
      {/* We pass products directly, client component won't need to fetch initial products */}
      {/* However, ProductsPageClient expects to manage its own state/fetching for updates */}
      {/* Consider refactoring ProductsPageClient or creating a simpler display component */}
      {/* For now, we'll let it re-fetch based on the URL param it reads */}

      {/* TODO: Review if ProductsPageClient needs modification or if a simpler 
           client component wrapper around ProductsDataTable is better here. 
           ProductsPageClient fetches catalogs again, which is redundant here. 
           It also fetches products based on URL param, which duplicates our fetch. */}
      {/* --- Pass fetched data as props --- */}
      <ProductsPageClient
        initialProducts={products || []}
        initialCatalogs={allCatalogs || []}
        hideCatalogFilter={true}
      />
      {/* -------------------------------- */}
    </div>
  );
}
