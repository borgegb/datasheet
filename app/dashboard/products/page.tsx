import React, { Suspense } from "react";
import ProductsPageClient from "./ProductsPageClient";

// This page component can now be a Server Component (or remain client if needed later)
export default function ProductsPage() {
  return (
    <div className="flex flex-col flex-1 p-4 md:p-6">
      <h1 className="text-2xl font-semibold mb-6">Saved Datasheets</h1>

      {/* Wrap the client component needing searchParams in Suspense */}
      <Suspense fallback={<p>Loading datasheets...</p>}>
        <ProductsPageClient />
      </Suspense>
    </div>
  );
}
