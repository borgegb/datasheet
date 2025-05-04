import React from "react";
import DatasheetGeneratorForm from "../DatasheetGeneratorForm"; // Adjust import path if needed
import { fetchProductById } from "../../actions"; // Assuming action exists or will be created
import { notFound } from "next/navigation";

interface EditDatasheetPageProps {
  params: {
    productId: string;
  };
}

export default async function EditDatasheetPage({
  params,
}: EditDatasheetPageProps) {
  const { productId } = params;

  if (!productId) {
    notFound(); // Or handle error appropriately
  }

  console.log(`[Edit Page Server] Fetching data for productId: ${productId}`);
  const { data: initialData, error } = await fetchProductById(productId);

  if (error) {
    console.error("[Edit Page Server] Error fetching product:", error);
    // Optionally show an error message to the user instead of just notFound
    notFound(); // Product fetch failed
  }

  if (!initialData) {
    console.log(`[Edit Page Server] Product not found for ID: ${productId}`);
    notFound(); // Product not found
  }

  console.log(
    "[Edit Page Server] Rendering form with initial data:",
    initialData
  );

  return (
    <div className="p-4 md:p-6">
      {/* Pass fetched data and product ID to the form */}
      <DatasheetGeneratorForm
        initialData={initialData}
        editingProductId={productId}
      />
    </div>
  );
}

// Optional: Add metadata generation if needed
// export async function generateMetadata({ params }: EditDatasheetPageProps) {
//   // Fetch product title for metadata?
//   return {
//     title: `Edit Datasheet - ${params.productId}`, // Placeholder title
//   };
// }
