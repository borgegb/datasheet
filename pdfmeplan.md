Guide: Integrating pdfme into Your Supabase Edge Function
This guide assumes you've already:
Finalized your pdfme JSON template (the one you provided).
Have font files (.ttf or .otf) ready for "Poppins-Bold", "Inter-Regular", and "Inter-Bold".
Have base64 strings for your logos (APPLIED, PED, CE, Ireland).
1. Update Your Edge Function index.ts
You'll need to modify supabase/functions/generate-datasheet/index.ts.
Key Changes:
Import pdfme: Import the generate function from @pdfme/generator and Template type from @pdfme/common.
Load Fonts & Template:
Fetch your font files (Poppins, Inter) using Deno.readFile.
Fetch your pdfme JSON template file. You can either include it directly in the function's shared directory or fetch it from Supabase storage if it needs to be more dynamic. For simplicity, let's assume it's in ../_shared/templates/datasheet-template.json.
Prepare Inputs: Transform the product data fetched from your database (or received in the request for preview) into the inputs array structure that pdfme expects. This is the most crucial step.
Call generate: Use the pdfme/generator's generate function with your template, inputs, and font options.
Handle Output: The generate function returns PDF bytes, which you can then save to storage or return as base64 for preview.
// supabase/functions/generate-datasheet/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.177.0/encoding/base64.ts";

// --- PDFME Imports ---
import { generate } from "https://esm.sh/@pdfme/generator@latest"; // Use latest or a specific version
import type { Template, Font } from "https://esm.sh/@pdfme/common@latest";
// For table schema if you use it directly from @pdfme/schemas
// import { table } from "https://esm.sh/@pdfme/schemas@latest";
// --- END PDFME Imports ---

console.log(`Function "generate-datasheet" (pdfme version) up and running!`);

// Supabase Admin Client
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

// --- Helper: Warranty Text ---
const getWarrantyText = (code: string | null): string => {
  // (Keep your existing getWarrantyText function)
  switch (code) {
    case "1y": return "This product is covered by a 12-month warranty against defect in materials and workmanship.";
    case "2y": return "This product is covered by a 24-month warranty (Placeholder Text).";
    case "lifetime": return "This product is covered by a limited lifetime warranty (Placeholder Text).";
    case "none": return "This product is sold without warranty (Placeholder Text).";
    default: return "Warranty information not specified.";
  }
};

// --- Helper: Shipping Text ---
const getShippingText = (code: string | null): string => {
  // (Keep your existing getShippingText function)
    switch (code) {
    case "expedited": return "The Applied 20 Litre Classic Blast Machine will be securely mounted on a wooden pallet measuring 1200mm x 1000mm. Please note that up to four units can be shipped on a single pallet. To maximise value and efficiency, we recommend shipping the full quantity per pallet whenever possible.";
    case "std": return "Standard shipping information placeholder.";
    case "freight": return "Freight shipping information placeholder.";
    default: return "Shipping information not specified.";
  }
};


// --- BEGIN BASE64 LOGO PLACEHOLDERS ---
// IMPORTANT: Replace these with your actual base64 encoded logo strings
// You can generate these by:
// 1. Reading the image file (e.g., PNG, JPG) into a Uint8Array
// 2. Converting the Uint8Array to a base64 string
// Example (Node.js, adapt for Deno or do it offline):
// const fs = require('fs');
// const logoBytes = fs.readFileSync('./path/to/your/logo.png');
// const base64String = Buffer.from(logoBytes).toString('base64');
// console.log(`data:image/png;base64,${base64String}`);

const APPLIED_LOGO_BASE64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="; // Replace!
const PED_LOGO_BASE64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="; // Replace!
const CE_LOGO_BASE64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="; // Replace!
const IRELAND_LOGO_BASE64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="; // Replace!
const DEFAULT_PRODUCT_IMAGE_BASE64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="; // Placeholder if no product image
// --- END BASE64 LOGO PLACEHOLDERS ---


serve(async (req: Request) => {
  console.log("--- generate-datasheet (pdfme) START ---");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      productId,
      userId,
      isPreview = false,
      // For preview, directly pass data (optional, can also fetch)
      productTitle: previewProductTitle,
      productCode: previewProductCode,
      description: previewDescription,
      keyFeatures: previewKeyFeatures,
      techSpecs: previewTechSpecs, // This should be the JSON string from the form
      weight: previewWeight,
      warranty: previewWarranty,
      shippingInfo: previewShippingInfo,
      imagePath: previewImagePath,
      // optionalLogos: previewOptionalLogos, // Handle later if needed for preview
    } = await req.json();

    console.log("Received request (pdfme):", { productId, userId, isPreview });

    if (!userId && !isPreview) { // For non-preview, userId might not be strictly needed if all data is via productId
      throw new Error("User ID is missing in the request for non-preview generation.");
    }
    if (!isPreview && !productId) {
      throw new Error("Product ID is missing for final generation.");
    }

    // 1. Load PDFME Template
    // Assuming your template.json is in supabase/functions/_shared/templates/
    const templateFilePath = new URL("../_shared/templates/datasheet-template.json", import.meta.url);
    const templateJsonString = await Deno.readTextFile(templateFilePath);
    const template: Template = JSON.parse(templateJsonString);

    // 2. Load Fonts
    // Ensure these paths are correct relative to your Edge Function.
    const poppinsBoldPath = new URL("../_shared/fonts/Poppins-Bold.ttf", import.meta.url);
    const interRegularPath = new URL("../_shared/fonts/Inter-Regular.ttf", import.meta.url);
    const interBoldPath = new URL("../_shared/fonts/Inter-Bold.ttf", import.meta.url);

    const poppinsBoldFontBytes = await Deno.readFile(poppinsBoldPath);
    const interRegularFontBytes = await Deno.readFile(interRegularPath);
    const interBoldFontBytes = await Deno.readFile(interBoldPath);

    const fonts: Font = {
      'Poppins-Bold': { data: poppinsBoldFontBytes, fallback: false, subset: true },
      'Inter-Regular': { data: interRegularFontBytes, fallback: true, subset: true }, // A fallback is good
      'Inter-Bold': { data: interBoldFontBytes, fallback: false, subset: true },
    };

    // 3. Fetch Product Data from DB (if not preview or if preview needs fresh DB data)
    let productData: any = {};
    if (!isPreview && productId) {
      console.log(`Fetching product data for ID: ${productId}`);
      const { data, error } = await supabaseAdmin
        .from("products")
        .select("*")
        .eq("id", productId)
        .single();
      if (error) throw new Error(`Failed to fetch product data: ${error.message}`);
      if (!data) throw new Error(`Product with ID ${productId} not found.`);
      productData = data;
      console.log("Fetched product data:", productData);
    } else if (isPreview) {
      // Use data passed in request for preview
      productData = {
        product_title: previewProductTitle,
        product_code: previewProductCode,
        description: previewDescription,
        key_features: previewKeyFeatures, // String, one feature per line
        tech_specs: previewTechSpecs,     // JSON string of specs array
        weight: previewWeight,
        warranty: previewWarranty,         // e.g., "1y"
        shipping_info: previewShippingInfo, // e.g., "expedited"
        image_path: previewImagePath,       // Storage path
        // optional_logos: previewOptionalLogos, // You'll need to resolve these to base64 or skip for preview
        // --- Add default/empty values for fields not passed in preview ---
        id: "preview-id",
        organization_id: "preview-org-id",
        // ... any other fields your `preparePdfmeInputs` might expect
      };
      console.log("Using preview data directly:", productData);
    }


    // 4. Prepare Inputs for PDFME
    // This function maps your DB/request data to the { key: value } structure pdfme needs
    // for the 'content' of its schemas.

    // --- Product Image Handling ---
    let productImageBase64 = DEFAULT_PRODUCT_IMAGE_BASE64; // Fallback
    if (productData.image_path) {
        try {
            console.log(`Fetching product image from: ${productData.image_path}`);
            const { data: blobData, error: downloadError } = await supabaseAdmin.storage
                .from("datasheet-assets") // Your bucket name
                .download(productData.image_path);

            if (downloadError) throw downloadError;
            if (!blobData) throw new Error("Product image blob data is null.");

            const imageBytes = await blobData.arrayBuffer();
            const base64String = base64Encode(imageBytes);
            // Determine MIME type (basic check)
            const mimeType = productData.image_path.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
            productImageBase64 = `data:${mimeType};base64,${base64String}`;
            console.log("Product image fetched and converted to base64.");
        } catch (imgError) {
            console.error("Error fetching/converting product image:", imgError.message);
            // productImageBase64 remains DEFAULT_PRODUCT_IMAGE_BASE64
        }
    }
    // --- End Product Image Handling ---


    const pdfInputs = [{ // pdfme expects an array of inputs, one per page (for simple, single-page PDF)
      // --- Map to schema names in your pdfme template.json ---
      appliedLogo: APPLIED_LOGO_BASE64, // From placeholder
      productTitle: productData.product_title || "N/A",
      productSubtitle: `Product Code ${productData.product_code || "N/A"}${productData.weight ? ` | Weight ${productData.weight}` : ""}`,
      introParagraph: productData.description || "No description available.",
      keyFeaturesList: (productData.key_features || "")
                          .split('\n')
                          .map((f: string) => f.trim())
                          .filter((f: string) => f)
                          .map((f: string) => `✔ ${f}`) // Add checkmark
                          .join('\n'),
      // specificationsTable expects an array of arrays: [["Label1", "Value1"], ["Label2", "Value2"]]
      specificationsTable: (() => {
        try {
          const specsArray = JSON.parse(productData.tech_specs || "[]");
          if (Array.isArray(specsArray)) {
            return specsArray.map((spec: { label: string, value: string }) => [spec.label, spec.value]);
          }
          return [];
        } catch (e) {
          console.warn("Could not parse tech_specs for pdfme table:", e);
          return []; // Default to empty array if parsing fails
        }
      })(),
      warrantyText: getWarrantyText(productData.warranty),
      shippingText: getShippingText(productData.shipping_info), // Use your helper
      pedLogo: PED_LOGO_BASE64, // From placeholder - or logic to conditionally include
      ceLogo: CE_LOGO_BASE64,   // From placeholder - or logic
      irelandLogo: IRELAND_LOGO_BASE64, // From placeholder - or logic
      productimage: productImageBase64, // The fetched/default product image base64
      // --- Footer text is usually static in basePdf.staticSchema, but can be dynamic if needed ---
      // footerWebsite1: "www.appliedpi.com", // Example if dynamic, but likely static
      // footerWebsite2: "www.ptocompressors.com", // Example
    }];

    // 5. Generate PDF
    console.log("Generating PDF with pdfme...");
    // pdfme's generate function might need plugins if you use complex schemas like 'table' from @pdfme/schemas
    // For simple text and image types, plugins might not be strictly needed for generation if schema def is correct.
    // If you used the 'table' type from @pdfme/schemas in your template, you need the table plugin.
    // Since the template has "type": "table", we need the table plugin.
    // However, importing full @pdfme/schemas might be heavy for Edge.
    // Let's try without explicit plugins first, relying on schema structure.
    // If generation fails for the table, we'll need to address plugin loading for Edge.
    // For now, assuming the basic types (text, image, line, rectangle) are handled by the core generator.
    // The table schema from the template provided should be handled if the 'content' for it is a stringified 2D array or a 2D array.
    // My input preparation for `specificationsTable` provides a 2D array.

    const pdfBytes = await generate({
        template,
        inputs: pdfInputs,
        options: { font: fonts },
        // plugins: { Table: table } // If you have the table plugin available and need it
    });
    console.log("PDF generated with pdfme (Size:", pdfBytes.length, "bytes)");

    // 6. Handle Response (Preview vs. Final)
    if (isPreview) {
      const pdfBase64 = base64Encode(pdfBytes);
      return new Response(JSON.stringify({ pdfData: pdfBase64 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    } else {
      // Final Mode: Save to Storage and Update DB
      if (!productId || !productData.organization_id) {
        throw new Error("Product ID or Organization ID is missing for final storage.");
      }
      const orgId = productData.organization_id;
      const safeTitle = (productData.product_title || "product").replace(/[^a-zA-Z0-9_\-\.]/g, "_");
      const safeCode = (productData.product_code || "code").replace(/[^a-zA-Z0-9_\-\.]/g, "_");
      const pdfFileName = `${safeTitle}-${safeCode}.pdf`;
      const storagePath = `${orgId}/${productId}/generated_pdfs/${pdfFileName}`;

      console.log(`Uploading PDF to storage at: ${storagePath}`);
      const { error: uploadError } = await supabaseAdmin.storage
        .from("datasheet-assets")
        .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: true });
      if (uploadError) throw new Error(`Failed to upload PDF to storage: ${uploadError.message}`);

      console.log("Updating product table with PDF storage path...");
      const { error: updateError } = await supabaseAdmin
        .from("products")
        .update({ pdf_storage_path: storagePath, updated_at: new Date().toISOString() })
        .eq("id", productId);
      if (updateError) throw new Error(`Failed to update product with PDF path: ${updateError.message}`);

      return new Response(
        JSON.stringify({ message: "PDF generated and saved successfully.", pdfStoragePath: storagePath }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

  } catch (error: any) {
    console.error("--- Error in generate-datasheet function (pdfme) ---", error, error.stack);
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
Use code with caution.
TypeScript
Important Considerations for the Edge Function:
datasheet-template.json Location:
Place your pdfme JSON template in supabase/functions/_shared/templates/datasheet-template.json.
Ensure your YOUR_..._BASE64_STRING placeholders within this JSON template file are replaced with actual base64 image data for static logos.
Font Files:
Place your .ttf font files (e.g., Poppins-Bold.ttf, Inter-Regular.ttf, Inter-Bold.ttf) in supabase/functions/_shared/fonts/.
pdfme Versioning: Using @latest for esm.sh imports is convenient for getting started but consider pinning to specific versions for production stability (e.g., https://esm.sh/@pdfme/generator@5.3.15).
Table Plugin for pdfme:
Your template uses "type": "table". The core generate function of pdfme might handle this if the content for the table schema is a simple 2D array (which we are providing).
If you encounter issues with table rendering, it might be because the more advanced features of the table schema (like complex styling or page breaks within the table) require the table plugin from @pdfme/schemas.
Importing full @pdfme/schemas can be heavy for Edge Functions. If needed, you might explore if a more lightweight, isolated table plugin for pdfme exists or if you can simplify the table schema in your template. For now, the provided code assumes the basic table rendering will work.
Image Handling:
The code now fetches the product image from Supabase Storage, converts it to base64, and passes it to the pdfme input.
Ensure the imagePath in your productData is the correct path within your "datasheet-assets" bucket.
Error Handling: The try...catch block is essential. Log errors and their stacks for easier debugging.
Memory/Timeout: Generating PDFs can be resource-intensive. Monitor your Edge Function's memory usage and execution time. For very complex PDFs or large numbers of them, you might hit limits. Supabase Pro plan offers higher limits.
2. Update Form Submission (DatasheetGeneratorForm.tsx)
Your useEffect that calls the Edge Function after a successful save (saveState) is already well-structured. The body of the invoke call will now primarily send productId and userId for final generation.
For preview, you'll gather all form data and send it directly to the Edge Function with isPreview: true.
// Inside DatasheetGeneratorForm.tsx, in your generateAndOpenPdf (after save)
// or handlePreview function

// For final generation (after save):
const { data: generateData, error: generateError } =
  await supabase.functions.invoke("generate-datasheet", {
    body: {
        productId: savedProductId, // The ID of the saved product
        userId: user.id,           // Current user's ID
        isPreview: false           // Explicitly false for final generation
    },
  });

// For preview:
const previewPayload = {
    isPreview: true,
    productTitle: productTitle, // from form state
    productCode: productCode,   // from form state
    description: description, // from form state
    keyFeatures: keyFeatures, // from form state (string, newline separated)
    techSpecs: JSON.stringify(specs.map(({ id, ...rest }) => rest)), // JSON string of specs array
    weight: weight,           // from form state
    warranty: warranty,       // from form state
    shippingInfo: shippingInfo, // from form state
    imagePath: uploadedImagePath, // from state (path in Supabase storage)
    // optionalLogos: { ... }, // You might simplify this for preview or pass flags
    userId: user.id, // Still good to pass for consistency or if preview needs user context
};
const { data: previewPdfData, error: previewError } =
    await supabase.functions.invoke("generate-datasheet", {
        body: previewPayload,
    });

// Handle response for preview (pdfData will be base64)
if (previewPdfData && previewPdfData.pdfData) {
    const pdfBlob = await fetch(`data:application/pdf;base64,${previewPdfData.pdfData}`).then(res => res.blob());
    const dataUrl = URL.createObjectURL(pdfBlob);
    window.open(dataUrl, "_blank");
    URL.revokeObjectURL(dataUrl);
    toast.success("Preview generated!", { id: "preview-toast-id" });
}
Use code with caution.
JavaScript
3. Testing and Iteration
Deploy the Edge Function: supabase functions deploy generate-datasheet --no-verify-jwt (if you handle auth within the function, otherwise remove --no-verify-jwt and pass the auth token).
Test Locally (Optional but Recommended): supabase functions serve generate-datasheet --no-verify-jwt and use a tool like Postman or curl to send test JSON payloads.
Thoroughly Test:
Preview generation.
Final generation after saving data.
Cases with and without product images.
Different numbers of key features (to test dynamic font sizing).
Different numbers of specifications (to test table generation).
Check console logs in the Supabase dashboard for your Edge Function.
Information for Your Team from pdfme Docs
Here's a summary you can share with your team, drawing from the pdfme documentation:
# Transitioning to `pdfme` for PDF Generation

We are adopting `pdfme` for generating our product datasheets. This library offers a powerful template-based approach, making it easier to manage complex layouts and dynamic content.

## Key Concepts of `pdfme`

1.  **Templates (`Template` type):**
    *   The core of `pdfme`. A JSON object defining the PDF structure.
    *   Consists of `basePdf` (static background/layout) and `schemas` (dynamic content areas).
    *   Our `datasheet-template.json` defines:
        *   `basePdf`: A4 page size, margins, and a `staticSchema` for the persistent footer.
        *   `schemas`: An array defining each dynamic element on the page (logo, titles, text blocks, image placeholders, tables). Each schema has a `name`, `type` (e.g., `text`, `image`, `table`), `position`, `width`, `height`, and styling properties.

2.  **Generator (`generate` function):**
    *   The function from `@pdfme/generator` that takes a `template` (our JSON) and `inputs` to produce the PDF bytes.
    *   `inputs`: An array of objects. Each object maps schema `name`s to their `content`. For example, if a schema is named `"productTitle"`, the input object would be `{ productTitle: "Actual Product Name" }`.
    *   `options`: Includes `font` definitions (mapping font names used in the template to actual font file data) and `plugins`.

3.  **Dynamic Content & Styling:**
    *   **Text (`text` schema):** Can have `dynamicFontSize` to fit content within a fixed height. Content is a simple string. For lists (like Key Features), we pre-format the string with newlines and bullet points (e.g., "✔ Feature 1\n✔ Feature 2").
    *   **Images (`image` schema):** Content should be a base64 encoded image string (e.g., `data:image/png;base64,...`).
    *   **Tables (`table` schema):** Content can be a 2D array of strings (e.g., `[["Label1", "Value1"], ["Label2", "Value2"]]`) or a JSON string representation of this array. Styles for head, body, columns can be defined within the schema.
    *   **Styling:** Font names, sizes, colors, alignment, padding, etc., are defined directly within each schema object in the template JSON.

4.  **Fonts:**
    *   Custom fonts (like Poppins, Inter) must be provided to the `generate` function.
    *   `pdfme` supports TTF and OTF fonts.
    *   Font subsetting is enabled by default to reduce PDF file size.

5.  **Plugins (e.g., for Tables from `@pdfme/schemas`):**
    *   While `pdfme`'s core generator handles basic schema types, more complex ones (like the advanced `table` schema from the separate `@pdfme/schemas` package, which supports features like automatic page breaks within tables) might require registering their specific plugin with the `generate` function.
    *   For our current Edge Function, we are initially trying to use the table schema by providing a simple 2D array as content, hoping the core generator can handle it sufficiently. If complex table features are needed or rendering fails, we may need to investigate how to efficiently use plugins in the Deno environment.

## Our Implementation Plan

1.  **Template (`datasheet-template.json`):** This JSON file (stored in `_shared/templates/`) is our single source of truth for the PDF layout.
2.  **Edge Function (`generate-datasheet/index.ts`):**
    *   Loads the template JSON and font files.
    *   Fetches product data from Supabase DB (or uses request data for previews).
    *   **Crucially, it transforms this product data into the `inputs` array structure required by `pdfme`'s `generate` function.** This involves mapping database fields to the `name`d schemas in our template and formatting data correctly (e.g., newlines for lists, 2D arrays for tables, base64 for images).
    *   Calls `pdfme.generate()` with the template, prepared inputs, and font configurations.
    *   Saves the resulting PDF bytes to Supabase Storage or returns it as base64 for previews.

## Key Areas for Attention

*   **Input Preparation:** Ensuring the data from our database is correctly formatted for each schema in the `inputs` object is critical.
*   **Dynamic Font Sizing for Lists:** The "Key Features" list relies on `dynamicFontSize: { fit: "vertical" }`. We need to test this with varying numbers of features to ensure readability and that it fits within its allocated `height`.
*   **Table Data Formatting:** The "Specifications" table requires its input to be a 2D array.
*   **Image Handling:** Images (logos, product image) need to be provided as base64 strings in the `inputs`.
*   **Edge Function Environment:** We are using `esm.sh` to import `pdfme` modules in our Deno Edge Function. We need to monitor performance and bundle size.

By using `pdfme`, we gain a more structured and maintainable way to generate PDFs that match our design specifications, especially as the complexity of datasheets might grow.
Use code with caution.
Markdown
This detailed plan should give you and your team a clear path to complete the PDF generation using pdfme. Good luck!