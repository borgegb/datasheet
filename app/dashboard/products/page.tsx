import React, { Suspense } from "react";
import ProductsPageClient from "./ProductsPageClient";
import { fetchCategories } from "../actions"; // Corrected import path

// Type definition for categories passed to client
interface Category {
  id: string;
  name: string;
}

// This page component can now be a Server Component (or remain client if needed later)
export default async function ProductsPage() {
  // Fetch categories server-side
  const { data: availableCategories, error: categoriesError } =
    await fetchCategories();

  if (categoriesError) {
    console.error(
      "Failed to fetch categories for Products page:",
      categoriesError
    );
    // Handle error - maybe show an error message or pass empty array
  }

  return (
    <div className="flex flex-col flex-1 p-4 md:p-6">
      <h1 className="text-2xl font-semibold mb-6">Saved Datasheets</h1>

      {/* Wrap the client component needing searchParams in Suspense */}
      <Suspense fallback={<p>Loading datasheets...</p>}>
        {/* Pass categories to the client component */}
        <ProductsPageClient availableCategories={availableCategories || []} />
      </Suspense>
    </div>
  );
}
