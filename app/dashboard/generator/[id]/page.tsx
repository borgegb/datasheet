"use client"; // Still likely needs client interactivity for the form

import DatasheetGeneratorForm from "../DatasheetGeneratorForm"; // Adjust import path
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";

// Define the expected shape of the fetched product data
// (Should match the structure returned by the select query)
interface ProductData {
  id: string;
  product_title: string;
  product_code: string;
  description: string | null;
  tech_specs: string | null;
  price: string | null;
  image_path: string | null;
  weight: string | null;
  key_features: string | null;
  warranty: string | null;
  shipping_info: string | null;
  image_orientation: "portrait" | "landscape" | null;
  optional_logos: any | null; // Use 'any' or a specific type for JSONB
  catalog_id: string | null;
  // Add other fields as needed
}

export default function EditDatasheetPage({
  params,
}: {
  params: { id: string };
}) {
  const productId = params.id;
  const [initialData, setInitialData] = useState<ProductData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) return; // Should not happen with dynamic route, but good practice

    const fetchProductData = async () => {
      setIsLoading(true);
      setError(null);
      const supabase = createClient();
      const { data, error: fetchError } = await supabase
        .from("products")
        .select("*") // Select all columns for editing
        .eq("id", productId)
        .single();

      if (fetchError) {
        console.error("Error fetching product data for edit:", fetchError);
        setError(
          `Failed to load datasheet data: ${
            fetchError.message || "Not found or access denied"
          }`
        );
        toast.error(
          `Failed to load datasheet data: ${
            fetchError.message || "Not found or access denied"
          }`
        );
        setInitialData(null);
      } else if (data) {
        console.log("Fetched product data for edit:", data);
        setInitialData(data as ProductData);
        toast.success("Datasheet data loaded for editing.");
      } else {
        setError("Datasheet not found.");
        toast.error("Datasheet not found.");
      }
      setIsLoading(false);
    };

    fetchProductData();
  }, [productId]); // Depend only on productId

  return (
    <div className="flex flex-col flex-1 p-4 md:p-6">
      {isLoading && <p>Loading datasheet data...</p>}
      {error && <p className="text-destructive">Error: {error}</p>}
      {/* Render the form only when data is loaded or if creating new (handled separately) */}
      {/* Pass fetched data as initialData prop */}
      {!isLoading && !error && (
        <DatasheetGeneratorForm
          key={productId}
          /* Add key to force re-render */ initialData={initialData}
          editingProductId={productId}
        />
      )}
      {/* If initialData is null AFTER loading and no error, it means not found */}
      {!isLoading && !error && !initialData && productId && (
        <p>Datasheet with ID {productId} not found or you don't have access.</p>
      )}
    </div>
  );
}
