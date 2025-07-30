import React, { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import CatalogProductsClient from "./CatalogProductsClient"; // Use new client component
import {
  fetchProductsForOrg,
  fetchCategories, // Import fetchCategories
  fetchCatalogById, // Import new action
} from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

// Define props type including params
interface CatalogProductsPageProps {
  params: {
    catalogId: string;
  };
}

// Type for Category (matching definition elsewhere)
interface Category {
  id: string;
  name: string;
}

// This page will be a Server Component to fetch data
export default async function CatalogProductsPage({
  params,
}: CatalogProductsPageProps) {
  const { catalogId } = params;

  // Get user role for conditional UI
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/auth/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const userRole = profile?.role || "viewer"; // Default to viewer if no role found

  if (!catalogId) {
    notFound(); // Handle missing ID
  }

  // Fetch data concurrently
  const catalogDetailsPromise = fetchCatalogById(catalogId);
  const productsPromise = fetchProductsForOrg(catalogId);
  const categoriesPromise = fetchCategories();

  const [catalogDetailsResult, productsResult, categoriesResult] =
    await Promise.all([
      catalogDetailsPromise,
      productsPromise,
      categoriesPromise,
    ]);

  // Handle catalog not found or error
  if (catalogDetailsResult.error || !catalogDetailsResult.data) {
    console.error(
      `Error fetching catalog ${catalogId}:`,
      catalogDetailsResult.error
    );
    notFound(); // Catalog is essential for this page
  }
  const catalogName = catalogDetailsResult.data.name;

  // Handle other errors gracefully (pass to client or log)
  if (productsResult.error) {
    console.error(
      `Error fetching products for catalog ${catalogId}:`,
      productsResult.error
    );
    // Optionally pass error message to client
  }
  if (categoriesResult.error) {
    console.error("Error fetching categories:", categoriesResult.error);
    // Optionally pass error message to client
  }

  const products = productsResult.data || [];
  const availableCategories = categoriesResult.data || [];

  // --- Render the Page ---
  return (
    <div className="flex flex-col flex-1 p-4 md:p-6">
      {/* --- Add Header Row with Title and Button --- */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">
          Datasheets in Catalog: {catalogName}
        </h1>
        {/* Only show Add Datasheet button for owners and members */}
        {userRole !== "viewer" && (
          <Button asChild size="sm">
            <Link href={`/dashboard/generator?catalogId=${catalogId}`}>
              <PlusIcon className="mr-1.5 h-4 w-4" />
              Add Datasheet to Catalog
            </Link>
          </Button>
        )}
      </div>
      {/* -------------------------------------------- */}

      {/* Use Suspense for client component */}
      <Suspense fallback={<p>Loading datasheets table...</p>}>
        <CatalogProductsClient
          initialProducts={products}
          availableCategories={availableCategories}
          catalogName={catalogName} // Pass name if needed by client
          userRole={userRole} // Pass user role for permission checks
        />
      </Suspense>
    </div>
  );
}
