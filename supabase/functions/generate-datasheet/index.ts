// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

console.log("--- generate-datasheet (pdfme version) script loaded ---"); // Indicate new version

// Setup type definitions for built-in Supabase Runtime APIs
// import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// import "jsr:@supabase/functions-js/edge-runtime.d.ts" // Removed for now
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.177.0/encoding/base64.ts";

// --- PDFME Imports ---
import { generate } from "https://esm.sh/@pdfme/generator@^5.3.0";
import type { Template, Font } from "https://esm.sh/@pdfme/common@^5.3.0";
// Import the schemas you will use as plugins
import {
  text,
  image,
  line,
  table,
  rectangle,
} from "https://esm.sh/@pdfme/schemas@^5.3.0";
//

// --- Helper function for Warranty Text (Keep for now, used in input prep) ---
const getWarrantyText = (code: string | null): string => {
  switch (code) {
    case "1y":
      return "This product is covered by a 12-month warranty against defects in materals and workmanship. ";
    case "2y":
      return "This product is covered by a 24-month warranty (Placeholder Text).";
    case "lifetime":
      return "This product is covered by a limited lifetime warranty (Placeholder Text).";
    case "none":
      return "This product is covered by a 12-month warranty against defects in materals and workmanship. ";
    default:
      return "Warranty information not specified.";
  }
};

// --- Helper function for Shipping Text (Keep for now, used in input prep) ---
const getShippingText = (code: string | null): string => {
  switch (code) {
    case "expedited":
      return "The Applied 20 Litre Classic Blast Machine will be securely mounted on a wooden pallet measuring 1200mm x 1000mm. Please note that up to four units can be shipped on a single pallet. To maximise value and efficiency, we recommend shipping the full quantity per pallet whenever possible.";
    case "std":
      return "The Applied 20 Litre Classic Blast Machine is shipped securely mounted on a wooden pallet measuring 1200mm×1000mm.  Up to four units can be shipped on a single pallet, and it is recommended to ship the full quantity per pallet to maximize value and efficiency.";
    case "freight":
      return "Freight shipping information placeholder.";
    default:
      return "Shipping information not specified.";
  }
};
// --- END Helper Functions ---

// --- Remove Base64 constant placeholders for static logos ---
// const APPLIED_LOGO_BASE64 = "...";
// const PED_LOGO_BASE64 = "...";
// const CE_LOGO_BASE64 = "...";
// const IRELAND_LOGO_BASE64 = "...";
const DEFAULT_PRODUCT_IMAGE_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="; // Keep for product image fallback
// --- End Base64 Logo Placeholders ---

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

serve(async (req: Request): Promise<Response> => {
  console.log("--- generate-datasheet (pdfme) handler entered ---");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      productId,
      userId,
      isPreview = false,
      productTitle: previewProductTitle,
      productCode: previewProductCode,
      description: previewDescription,
      keyFeatures: previewKeyFeatures,
      techSpecs: previewTechSpecs,
      weight: previewWeight,
      warranty: previewWarranty,
      shippingInfo: previewShippingInfo,
      imagePath: previewImagePath,
      optionalLogos: previewOptionalLogos,
    } = await req.json().catch(() => ({}));
    console.log("Request body (parsed for pdfme):", {
      productId,
      userId,
      isPreview,
    });

    let template: Template;
    let fonts: Font = {};
    // --- Variables for loaded static logo base64 strings ---
    let appliedLogoBase64Data = DEFAULT_PRODUCT_IMAGE_BASE64; // Fallback
    let irelandLogoBase64Data = DEFAULT_PRODUCT_IMAGE_BASE64; // Fallback
    let pedLogoBase64Data = DEFAULT_PRODUCT_IMAGE_BASE64; // Fallback
    let ceLogoBase64Data = DEFAULT_PRODUCT_IMAGE_BASE64; // Fallback
    // -------------------------------------------------------

    try {
      const templateFilePath = new URL(
        "../_shared/templates/datasheet-template.json",
        import.meta.url
      );
      const templateJsonString = await Deno.readTextFile(templateFilePath);
      template = JSON.parse(templateJsonString) as any as Template;
      console.log(
        "PDFME template loaded successfully from (attempted):",
        templateFilePath.pathname
      );

      const poppinsBoldPath = new URL(
        "../_shared/fonts/Poppins-Bold.ttf",
        import.meta.url
      );
      const interRegularPath = new URL(
        "../_shared/fonts/Inter-Regular.ttf",
        import.meta.url
      );
      const interBoldPath = new URL(
        "../_shared/fonts/Inter-Bold.ttf",
        import.meta.url
      );

      const poppinsBoldFontBytes = await Deno.readFile(poppinsBoldPath);
      const interRegularFontBytes = await Deno.readFile(interRegularPath);
      const interBoldFontBytes = await Deno.readFile(interBoldPath);

      fonts = {
        "Poppins-Bold": {
          data: poppinsBoldFontBytes,
          fallback: false,
          subset: true,
        },
        "Inter-Regular": {
          data: interRegularFontBytes,
          fallback: true,
          subset: true,
        },
        "Inter-Bold": {
          data: interBoldFontBytes,
          fallback: false,
          subset: true,
        },
      };
      console.log(
        "Custom fonts (Poppins-Bold, Inter-Regular, Inter-Bold) loaded successfully."
      );

      // --- Load Static Logo Files and Convert to Base64 ---
      try {
        const appliedLogoPath = new URL(
          "../_shared/assets/Appliedlogo.jpg",
          import.meta.url
        );
        const appliedLogoBytes = await Deno.readFile(appliedLogoPath);
        appliedLogoBase64Data = `data:image/jpeg;base64,${base64Encode(
          appliedLogoBytes
        )}`;
        console.log("Applied logo loaded and converted to base64.");
      } catch (e) {
        console.error(
          "Error loading Applied Main Logo:",
          e
        ); /* Falls back to default */
      }

      try {
        const irelandLogoPath = new URL(
          "../_shared/assets/ireland_logo_512.png",
          import.meta.url
        );
        const irelandLogoBytes = await Deno.readFile(irelandLogoPath);
        irelandLogoBase64Data = `data:image/png;base64,${base64Encode(
          irelandLogoBytes
        )}`;
        console.log("Ireland logo loaded and converted to base64.");
      } catch (e) {
        console.error(
          "Error loading Ireland Logo:",
          e
        ); /* Falls back to default */
      }

      // PED logo
      try {
        const pedLogoPath = new URL(
          "../_shared/assets/ped-logo.png",
          import.meta.url
        );
        const pedBytes = await Deno.readFile(pedLogoPath);
        pedLogoBase64Data = `data:image/png;base64,${base64Encode(pedBytes)}`;
        console.log("PED logo loaded and converted to base64.");
      } catch (e) {
        console.error("Error loading PED Logo:", e);
      }

      // CE logo
      try {
        const ceLogoPath = new URL(
          "../_shared/assets/ce-logo.png",
          import.meta.url
        );
        const ceBytes = await Deno.readFile(ceLogoPath);
        ceLogoBase64Data = `data:image/png;base64,${base64Encode(ceBytes)}`;
        console.log("CE logo loaded and converted to base64.");
      } catch (e) {
        console.error("Error loading CE Logo:", e);
      }
      // For PED and CE, we'll use Applied logo as placeholder for now if the flags are set
      // -----------------------------------------------------
    } catch (loadError: any) {
      console.error(
        "Error loading template or fonts for PDFME (path attempted with '../_shared'):",
        loadError
      );
      return new Response(
        JSON.stringify({
          error: `Failed to load PDF resources: ${loadError.message}`,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    let productDataFromSource: any = {};

    if (!isPreview && productId) {
      console.log(`Fetching product data for ID: ${productId}`);
      const { data: dbProduct, error } = await supabaseAdmin
        .from("products")
        .select("*, organization_id")
        .eq("id", productId)
        .single();
      if (error) {
        console.error("DB Error fetching product:", error);
        return new Response(
          JSON.stringify({ error: `DB Error: ${error.message}` }),
          { status: 500, headers: corsHeaders }
        );
      }
      if (!dbProduct) {
        return new Response(
          JSON.stringify({ error: `Product with ID ${productId} not found.` }),
          { status: 404, headers: corsHeaders }
        );
      }
      productDataFromSource = dbProduct;
      console.log("Fetched product data from DB:", productDataFromSource);
    } else if (isPreview) {
      productDataFromSource = {
        product_title: previewProductTitle,
        product_code: previewProductCode,
        description: previewDescription,
        key_features: previewKeyFeatures,
        tech_specs: previewTechSpecs,
        weight: previewWeight,
        warranty: previewWarranty,
        shipping_info: previewShippingInfo,
        image_path: previewImagePath,
        optional_logos: previewOptionalLogos || {},
        id: "preview-id",
        organization_id: userId ? `user-${userId}-org` : "preview-org-id",
      };
      console.log("Using preview data directly:", productDataFromSource);
    } else {
      return new Response(
        JSON.stringify({
          error: "Missing productId for generation or not in preview mode.",
        }),
        { status: 400, headers: corsHeaders }
      );
    }

    console.log("Preparing inputs for PDFME...");

    let productImageBase64 = DEFAULT_PRODUCT_IMAGE_BASE64;
    if (productDataFromSource.image_path) {
      try {
        console.log(
          `Fetching product image from: ${productDataFromSource.image_path}`
        );
        const { data: blobData, error: downloadError } =
          await supabaseAdmin.storage
            .from("datasheet-assets")
            .download(productDataFromSource.image_path);

        if (downloadError) throw downloadError;
        if (!blobData) throw new Error("Product image blob data is null.");

        const imageBytes = await blobData.arrayBuffer();
        const base64String = base64Encode(imageBytes);
        const mimeType = productDataFromSource.image_path
          .toLowerCase()
          .endsWith(".png")
          ? "image/png"
          : "image/jpeg";
        productImageBase64 = `data:${mimeType};base64,${base64String}`;
        console.log("Product image fetched and converted to base64.");
      } catch (imgError: any) {
        console.error(
          "Error fetching/converting product image:",
          imgError.message
        );
      }
    }

    const keyFeaturesArray = (productDataFromSource.key_features || "")
      .split("\n")
      .map((f: string) => f.trim())
      .filter((f: string) => f)
      .map((f: string) => `• ${f}`);
    const keyFeaturesString = keyFeaturesArray.join("\n");

    // --- Build specifications table from tech_specs JSON or fallback ---
    let specsForTable: string[][] = [];
    try {
      const rawSpecs = productDataFromSource.tech_specs;
      if (rawSpecs) {
        const parsedSpecs =
          typeof rawSpecs === "string" ? JSON.parse(rawSpecs) : rawSpecs;
        if (Array.isArray(parsedSpecs)) {
          specsForTable = parsedSpecs
            .filter((item: any) => item && (item.label || item.value))
            .map((item: any) => [
              (item.label ?? "").toString(),
              (item.value ?? "").toString(),
            ]);
        }
      }
    } catch (specParseErr) {
      console.error("Failed to parse tech_specs JSON:", specParseErr);
    }

    // Fallback to placeholder specs if none parsed
    if (specsForTable.length === 0) {
      specsForTable = [["Specification", "Value"]];
    }
    // --------------------------------------------------------------------------

    const logos = productDataFromSource.optional_logos || {};
    const displayPedLogo = logos.origin === true ? pedLogoBase64Data : "";
    const displayCeLogo = logos.ceMark === true ? ceLogoBase64Data : "";
    const displayIrelandLogo =
      logos.includeIrelandLogo === true ? irelandLogoBase64Data : "";

    // Construct the single input object for pdfme, matching template (4).json
    const pdfInputs = [
      {
        appliedLogo: appliedLogoBase64Data,
        productTitle: productDataFromSource.product_title || "N/A",
        productSubtitle: `Product Code ${
          productDataFromSource.product_code || "N/A"
        }${
          productDataFromSource.weight
            ? ` | Weight ${productDataFromSource.weight}`
            : ""
        }`,
        introParagraph:
          productDataFromSource.description || "No description available.",
        keyFeaturesHeading: "Key Features",
        keyFeaturesList: keyFeaturesString,
        productimage: productImageBase64,
        specificationsHeading: "Specifications",
        specificationsTable: specsForTable,

        // Re-enable these inputs as their schemas are now in the template
        warrantyText: getWarrantyText(productDataFromSource.warranty),
        shippingText: getShippingText(productDataFromSource.shipping_info),
        shippingHeading: "Shipping Information",
        pedLogo: displayPedLogo,
        ceLogo: displayCeLogo,
        irelandLogo: displayIrelandLogo,
      },
    ];
    console.log("PDFME Inputs with MINIMAL table data:", pdfInputs);

    console.log("Generating PDF with pdfme...");
    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await generate({
        template,
        inputs: pdfInputs,
        options: { font: fonts },
        plugins: {
          text,
          image,
          line,
          Table: table,
          rectangle,
        },
      });
      console.log("PDF generated with pdfme (Size:", pdfBytes.length, "bytes)");
    } catch (pdfGenError: any) {
      console.error(
        "Error during PDFME generation:",
        pdfGenError,
        pdfGenError.stack
      );
      return new Response(
        JSON.stringify({
          error: `PDF Generation Failed: ${pdfGenError.message}`,
          stack: pdfGenError.stack,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    if (isPreview) {
      console.log("Returning Base64 PDF for preview.");
      const pdfBase64 = base64Encode(pdfBytes);
      return new Response(JSON.stringify({ pdfData: pdfBase64 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    } else {
      console.log("Saving PDF to storage and updating database...");
      if (!productId || !productDataFromSource.organization_id) {
        console.error(
          "Missing productId or organization_id for final storage."
        );
        return new Response(
          JSON.stringify({
            error: "Product or Organization ID is missing for final storage.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          }
        );
      }
      const orgId = productDataFromSource.organization_id;
      const safeTitle = (
        productDataFromSource.product_title || "product"
      ).replace(/[^a-zA-Z0-9_\\-\\.]/g, "_");
      const safeCode = (productDataFromSource.product_code || "code").replace(
        /[^a-zA-Z0-9_\\-\\.]/g,
        "_"
      );
      const pdfFileName = `${safeTitle}-${safeCode}.pdf`;
      const storagePath = `${orgId}/${productId}/generated_pdfs/${pdfFileName}`;

      try {
        console.log(`Uploading PDF to storage at: ${storagePath}`);
        const { error: uploadError } = await supabaseAdmin.storage
          .from("datasheet-assets")
          .upload(storagePath, pdfBytes, {
            contentType: "application/pdf",
            upsert: true,
          });
        if (uploadError)
          throw new Error(
            `Failed to upload PDF to storage: ${uploadError.message}`
          );

        console.log("Updating product table with PDF storage path...");
        const { error: updateError } = await supabaseAdmin
          .from("products")
          .update({
            pdf_storage_path: storagePath,
            updated_at: new Date().toISOString(),
          })
          .eq("id", productId);
        if (updateError)
          throw new Error(
            `Failed to update product with PDF path: ${updateError.message}`
          );

        return new Response(
          JSON.stringify({
            message: "PDF generated and saved successfully.",
            pdfStoragePath: storagePath,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          }
        );
      } catch (saveError: any) {
        console.error(
          "Error during PDF save/update process:",
          saveError,
          saveError.stack
        );
        return new Response(
          JSON.stringify({
            error: `Failed to save/update PDF: ${saveError.message}`,
            stack: saveError.stack,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          }
        );
      }
    }
  } catch (error: any) {
    console.error(
      "--- Error in generate-datasheet function (pdfme) ---",
      error,
      error.stack
    );
    return new Response(
      JSON.stringify({ error: error.message, stack: error.stack }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
