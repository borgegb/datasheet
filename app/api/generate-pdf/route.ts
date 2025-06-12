// /api/generate-pdf   (Next.js 14 route)
export const runtime = "nodejs"; // full Node env
export const memory = 3009; // MB – Pro max
export const maxDuration = 300; // seconds

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { promises as fs } from "node:fs";
import path from "node:path";

// Import the new buildPdf function
import { buildPdfV2 } from "../../../lib/pdf/v2/buildPdf";
// Import a helper constant that might be used for default images
import {
  DEFAULT_PRODUCT_IMAGE_BASE64,
  getWarrantyText,
  getShippingText,
} from "../../../lib/pdf/_legacy/helpers_legacy";

// --- Supabase Client Initialization ---
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase: SupabaseClient = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
  {
    auth: { persistSession: false },
  }
);

// Helper to load a static asset (logo) from the `pdf/assets/` directory
// and return its base64 representation.
async function loadAssetAsBase64(assetFilename: string): Promise<string> {
  try {
    const assetPath = path.resolve(process.cwd(), "pdf/assets", assetFilename);
    const assetBytes = await fs.readFile(assetPath);
    let mimeType = "image/png"; // Default
    if (assetFilename.endsWith(".jpg") || assetFilename.endsWith(".jpeg")) {
      mimeType = "image/jpeg";
    }
    return `data:${mimeType};base64,${Buffer.from(assetBytes).toString(
      "base64"
    )}`;
  } catch (error: any) {
    console.warn(
      `Warning: Failed to load asset ${assetFilename}: ${error.message}`
    );
    return DEFAULT_PRODUCT_IMAGE_BASE64; // Fallback to a default placeholder
  }
}

export async function POST(req: Request) {
  console.log("--- Vercel POST /api/generate-pdf handler entered ---");
  try {
    const payload = await req.json();
    const { productId, isPreview, ...previewData } = payload;

    if (!productId && !isPreview) {
      throw new Error("Missing productId or not in preview mode.");
    }

    let productDataFromSource: any = {};
    let productImageBase64 = DEFAULT_PRODUCT_IMAGE_BASE64;

    // Load static logo assets concurrently
    const [
      appliedLogoBase64Data,
      irelandLogoBase64Data,
      pedLogoBase64Data,
      ceLogoBase64Data,
    ] = await Promise.all([
      loadAssetAsBase64("Appliedlogo.jpg"),
      loadAssetAsBase64("ireland_logo_512.png"),
      loadAssetAsBase64("ped-logo.png"),
      loadAssetAsBase64("ce-logo.png"),
    ]);

    if (!isPreview && productId) {
      console.log(`Fetching product data for ID: ${productId}`);
      const { data: dbProduct, error: dbError } = await supabase
        .from("products")
        .select("*, organization_id")
        .eq("id", productId)
        .single();

      if (dbError) {
        console.error("DB Error fetching product:", dbError);
        throw new Error(`DB Error: ${dbError.message}`);
      }
      if (!dbProduct) {
        throw new Error(`Product with ID ${productId} not found.`);
      }
      productDataFromSource = dbProduct;

      // Fetch product image if path exists
      if (productDataFromSource.image_path) {
        console.log(
          `Fetching product image from: ${productDataFromSource.image_path}`
        );
        const { data: blobData, error: downloadError } = await supabase.storage
          .from("datasheet-assets") // Bucket where product images are stored
          .download(productDataFromSource.image_path);

        if (downloadError) {
          console.warn(
            `Failed to download product image ${productDataFromSource.image_path}: ${downloadError.message}`
          );
          // Keep default image if download fails
        } else if (blobData) {
          const imageBytes = await blobData.arrayBuffer();
          const mimeType = productDataFromSource.image_path
            .toLowerCase()
            .endsWith(".png")
            ? "image/png"
            : "image/jpeg";
          productImageBase64 = `data:${mimeType};base64,${Buffer.from(
            imageBytes
          ).toString("base64")}`;
          console.log("Product image fetched and converted to base64.");
        } else {
          console.warn(
            `Product image blob data is null for ${productDataFromSource.image_path}.`
          );
        }
      }
    } else if (isPreview) {
      // Use preview data passed in the payload
      productDataFromSource = {
        product_title: previewData.productTitle,
        product_code: previewData.productCode,
        description: previewData.description,
        key_features: previewData.keyFeatures,
        tech_specs: previewData.techSpecs,
        weight: previewData.weight,
        warranty: previewData.warranty,
        shipping_info: previewData.shippingInfo,
        image_path: previewData.imagePath, // This would be a path/URL from client for preview
        image_orientation: previewData.imageOrientation,
        optional_logos: previewData.optionalLogos || {},
        organization_id: previewData.userId
          ? `user-${previewData.userId}-org-preview`
          : "preview-org-id",
      };
      // For isPreview, if an imagePath is provided, it might be a temporary URL or a path
      // that the client wants to see. If it's a Supabase storage path, we could attempt to fetch it.
      // For simplicity here, we'll assume if previewImagePath is a full base64 string, use it, else default.
      if (
        previewData.imagePath &&
        previewData.imagePath.startsWith("data:image")
      ) {
        productImageBase64 = previewData.imagePath;
      } else {
        console.log(
          "Preview mode: Using default product image or client needs to send base64 for product image."
        );
      }
      console.log("Using preview data directly.");
    } else {
      // This case should be caught by the initial check, but as a safeguard:
      return new Response(
        JSON.stringify({ error: "Invalid request parameters" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Build minimal input for header section for v2
    const headerInput = {
      appliedLogoBase64Data,
      productTitle: productDataFromSource.product_title || "",
      productSubtitle: `Product Code ${
        productDataFromSource.product_code || ""
      }`,
      introParagraph: productDataFromSource.description || "",
      productImageBase64,
      warrantyText: getWarrantyText(productDataFromSource.warranty),
      shippingHeading: "Shipping Information",
      shippingData: productDataFromSource.shipping_info || "",
      pedLogo:
        productDataFromSource.optional_logos?.origin === true
          ? pedLogoBase64Data
          : "",
      ceLogo:
        productDataFromSource.optional_logos?.ceMark === true
          ? ceLogoBase64Data
          : "",
      irelandLogo:
        productDataFromSource.optional_logos?.includeIrelandLogo === true
          ? irelandLogoBase64Data
          : "",
      keyFeaturesList: (() => {
        const keyFeaturesRaw = productDataFromSource.key_features || "";
        const keyFeaturesArray = keyFeaturesRaw
          .split("\n")
          .map((f: string) => f.trim().replace(/\r$/, "").trim())
          .filter((f: string) => f);
        return keyFeaturesArray.map((featureText: string) => ({
          icon: '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="8" fill="#2c5234"/><path d="M11.97 5.97a.75.75 0 0 0-1.06-1.06L7.25 8.56 5.53 6.84a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.06 0l4.19-4.18z" fill="#ffffff"/></svg>',
          text: featureText,
        }));
      })(),
      specificationsTable: (() => {
        // Pass raw data to buildPdf.ts for processing
        const rawSpecs = productDataFromSource.tech_specs;
        try {
          const parsed = Array.isArray(rawSpecs)
            ? rawSpecs
            : typeof rawSpecs === "string"
            ? JSON.parse(rawSpecs)
            : [];
          // Just return the parsed data, let buildPdf.ts handle filtering and formatting
          return (parsed || []).map((r: any) => [
            (r.label ?? "").toString(),
            (r.value ?? "").toString(),
          ]);
        } catch {
          return [["", ""]];
        }
      })(),
    } as const;

    console.log(
      "📋 Specs data being passed to buildPdf:",
      headerInput.specificationsTable
    );
    const pdfBytes = await buildPdfV2(headerInput);

    // Construct the file path as per the old structure
    if (!productDataFromSource.organization_id || !productId) {
      console.error(
        "Missing organization_id or productId for constructing storage path."
      );
      throw new Error(
        "Internal server error: cannot construct PDF storage path."
      );
    }
    const orgId = productDataFromSource.organization_id;
    const safeTitle = (
      productDataFromSource.product_title || "product"
    ).replace(/[^a-zA-Z0-9_\-\.]/g, "_");
    const safeCode = (productDataFromSource.product_code || "code").replace(
      /[^a-zA-Z0-9_\-\.]/g,
      "_"
    );
    const pdfFileName = `${safeTitle}-${safeCode}.pdf`;
    const filePath = `${orgId}/${productId}/generated_pdfs/${pdfFileName}`;

    console.log(
      `Uploading PDF to Supabase Storage at: datasheet-assets/${filePath}`
    );

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("datasheet-assets") // Changed bucket to datasheet-assets
      .upload(filePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true, // Changed to true to match old edge function's behavior (overwrite if exists)
      });

    if (uploadError) {
      console.error("Supabase Storage upload error:", uploadError);
      return new Response(
        JSON.stringify({
          error: `Storage upload failed: ${uploadError.message}`,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Update product table with the new pdf_storage_path (as in the old function)
    // This step was in your old function and is good practice if you store the path in the DB.
    // If you don't store it, this block can be removed, but the signed URL will still work.
    console.log("Updating product table with PDF storage path:", filePath);
    const { error: updateError } = await supabase
      .from("products")
      .update({
        pdf_storage_path: filePath, // Store the relative path
        updated_at: new Date().toISOString(),
      })
      .eq("id", productId);

    if (updateError) {
      // Log error but don't necessarily fail the whole request if PDF upload was successful
      console.warn(
        `Failed to update product table with PDF path: ${updateError.message}`
      );
      // Depending on requirements, you might want to throw an error here too
    }

    // Return a signed URL
    const { data: signedUrlData, error: signedUrlError } =
      await supabase.storage
        .from("datasheet-assets") // Changed bucket to datasheet-assets
        .createSignedUrl(filePath, 900); // 15 minutes

    if (signedUrlError) {
      console.error("Supabase signed URL error:", signedUrlError);
      return new Response(
        JSON.stringify({
          error: `Failed to create signed URL: ${signedUrlError.message}`,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    console.log("PDF generation and upload successful. Returning signed URL.");
    return Response.json({ url: signedUrlData?.signedUrl });
  } catch (error: any) {
    console.error("Error in POST /api/generate-pdf:", error, error.stack);
    const message =
      error.message || "An unknown error occurred during PDF generation.";
    return new Response(
      JSON.stringify({ error: message, stack: error.stack }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
