// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

console.log("--- generate-datasheet script loaded ---");

// Setup type definitions for built-in Supabase Runtime APIs
// import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// import "jsr:@supabase/functions-js/edge-runtime.d.ts" // Removed for now
import { corsHeaders } from "../_shared/cors.ts";

// --- REMOVE pdfmake ---
// import pdfMake from "https://esm.sh/pdfmake@0.2.7";

// --- ADD pdf-lib ---
import {
  PDFDocument,
  StandardFonts,
  rgb,
  PageSizes,
  degrees,
  PDFFont,
  PDFImage,
  PDFPage,
} from "https://esm.sh/pdf-lib@1.17.1"; // Use esm.sh for compatibility

// --- ADD fontkit import ---
import fontkit from "https://esm.sh/@pdf-lib/fontkit@1.1.1";
// ------------------------

// Remove unused imports
// import * as path from "https://deno.land/std@0.177.0/path/mod.ts";
// import Docx, { Paragraph, TextRun, HeadingLevel } from "https://deno.land/x/docxml@5.15.3/mod.ts";
import { encode as base64Encode } from "https://deno.land/std@0.177.0/encoding/base64.ts";
// import { concat } from "https://deno.land/std@0.177.0/bytes/concat.ts";
// import { readableStreamFromReader } from "https://deno.land/std@0.177.0/streams/readable_stream_from_reader.ts";

// Import Supabase client (use Admin client for server-side access)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- Helper: mm to points ---
function mmToPoints(mm: number): number {
  return mm * (72 / 25.4);
}
// ---------------------------

console.log(
  `Function "generate-datasheet" v2 up and running! (Uses Design Guidelines)`
);

// --- Design Guideline Constants ---
const COLOR_PRIMARY_GREEN = rgb(44 / 255, 82 / 255, 52 / 255); // #2c5234
const COLOR_BODY_TEXT = rgb(42 / 255, 42 / 255, 42 / 255); // #2A2A2A
const COLOR_DIVIDER_GREY = rgb(128 / 255, 128 / 255, 128 / 255); // #808080
const COLOR_TABLE_BACKGROUND = rgb(239 / 255, 242 / 255, 239 / 255); // #EFF2EF
const COLOR_WHITE = rgb(1, 1, 1);

// Convert mm to points (A4 is 210 x 297 mm)
const MARGIN_LEFT = mmToPoints(22); // 22mm
const MARGIN_RIGHT = mmToPoints(11); // 11mm
const MARGIN_TOP = mmToPoints(15); // Use midpoint 11-22mm -> 16.5mm ~ 15mm for calculation convenience
const MARGIN_BOTTOM = mmToPoints(15); // Generic bottom margin for content area before footer
const FOOTER_HEIGHT = mmToPoints(15); // Height for the footer bar, adjust as needed

const FONT_SIZE_TITLE = 16; // Recommended 12-20pt
const FONT_SIZE_H2 = 12; // Adjust H2 size
const FONT_SIZE_BODY = 9; // Recommended 9pt
const FONT_SIZE_SMALL = 8; // Smaller size for specs table/bullets
const FONT_SIZE_FOOTER = 9.6; // Specific footer size

const LINE_HEIGHT_BODY = FONT_SIZE_BODY * 1.4; // Adjust line height multiplier
const LINE_HEIGHT_SMALL = FONT_SIZE_SMALL * 1.4;
// ---                     ---

// Create a single Supabase client instance (initialized with service_role key for admin access)
// IMPORTANT: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Edge Function settings
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } } // Prevent storing session cookies on server
);

serve(async (req: Request) => {
  console.log("--- generate-datasheet request handler entered ---");

  // --- CORS Preflight ---
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // --- Parse Request Body ---
    const {
      productId, // Expect productId
      productTitle = "N/A",
      productCode = "N/A",
      description = "",
      keyFeatures = "",
      techSpecs = "",
      weight = "",
      warranty = "",
      shippingInfo = "",
      imagePath = null, // Expect full image path from frontend
      imageOrientation = "portrait",
      optionalLogos = {},
      catalogCategory = "",
      userId, // Expect userId
      isPreview = false,
    } = await req.json();

    console.log("Received request:", { productId, userId, isPreview });

    if (!userId) {
      throw new Error("User ID is missing in the request."); // Needed for storage path
    }
    // Product ID is only strictly required if NOT in preview mode
    if (!isPreview && !productId) {
      throw new Error("Product ID is missing for final generation.");
    }

    // --- Fetch Product Data from DB (unless preview mode) ---
    let dbProductData: any = {}; // Use 'any' or define a proper type
    if (!isPreview && productId) {
      console.log(`Fetching product data for ID: ${productId}`);
      const { data, error } = await supabaseAdmin
        .from("products")
        .select("*") // Select all fields needed
        .eq("id", productId)
        .single();

      if (error) {
        console.error("Error fetching product data:", error);
        throw new Error(`Failed to fetch product data: ${error.message}`);
      }
      if (!data) {
        throw new Error(`Product with ID ${productId} not found.`);
      }
      dbProductData = data;
      console.log("Fetched product data:", dbProductData);
    } else {
      // For preview, use the data passed directly in the request body
      dbProductData = {
        product_title: productTitle,
        product_code: productCode,
        description: description,
        key_features: keyFeatures,
        tech_specs: techSpecs,
        weight: weight,
        warranty: warranty,
        shipping_info: shippingInfo,
        image_path: imagePath,
        image_orientation: imageOrientation,
        optional_logos: optionalLogos,
        catalog_category: catalogCategory,
        // Add other fields as needed for preview
      };
      console.log("Using preview data:", dbProductData);
    }
    // ---                                             ---

    // --- Extract Specific flags from Product Data ---
    // Use DB data if available, otherwise fallback to request body data for preview
    const currentImageOrientation = isPreview
      ? imageOrientation
      : dbProductData.image_orientation || "portrait";
    const currentOptionalLogos = isPreview
      ? optionalLogos
      : dbProductData.optional_logos || {};
    const includeIrelandLogo = currentOptionalLogos.includeIrelandLogo === true; // Explicitly check boolean
    // Add flags for CE/Origin logos here when available
    // const includeCeLogo = currentOptionalLogos.includeCeLogo === true;
    // const includeOriginLogo = currentOptionalLogos.includeOriginLogo === true;

    console.log("Processing flags:", {
      currentImageOrientation,
      includeIrelandLogo /*, includeCeLogo, includeOriginLogo*/,
    });
    // ---                                          ---

    // --- Load Custom Fonts ---
    let poppinsBoldFontBytes: Uint8Array | null = null;
    let interRegularFontBytes: Uint8Array | null = null;
    try {
      // --- Add these lines for debugging ---
      // console.log("Base URL for relative paths:", import.meta.url); // REMOVE
      // const poppinsPath = new URL("../_shared/fonts/Poppins-Bold.ttf", import.meta.url).pathname; // REMOVE
      // console.log("Resolved Poppins Path:", poppinsPath); // REMOVE
      // --------------------------------------

      // Adjust path relative to the function location
      // Use new URL(...) directly with Deno.readFile
      // --- Attempt using absolute container paths ---
      poppinsBoldFontBytes = await Deno.readFile(
        new URL("../_shared/fonts/Poppins-Bold.ttf", import.meta.url)
      );
      interRegularFontBytes = await Deno.readFile(
        new URL("../_shared/fonts/Inter-Regular.ttf", import.meta.url)
      );

      console.log("Custom fonts loaded successfully.");
    } catch (fontError: any) {
      console.error("Error loading custom fonts:", fontError);
      // Decide whether to throw or fall back to standard fonts
      throw new Error(`Failed to load required fonts: ${fontError.message}`);
    }
    // ---                   ---

    // --- Load Logo ---
    let logoImageBytes: Uint8Array | null = null;
    let logoImage: PDFImage | null = null;
    let logoDims = { width: 0, height: 0 };
    try {
      // Path relative to function location
      // Use new URL(...) directly with Deno.readFile
      // --- Attempt using absolute container paths ---
      logoImageBytes = await Deno.readFile(
        new URL("../_shared/assets/Appliedlogo.jpg", import.meta.url)
      );

      console.log("Logo image file read.");
    } catch (logoError: any) {
      console.error("Error loading logo image:", logoError);
      // Continue without logo
    }
    // ---           ---

    // --- PDF Generation (pdf-lib) ---
    const pdfDoc = await PDFDocument.create();

    // --- ADD fontkit registration ---
    pdfDoc.registerFontkit(fontkit);
    // ------------------------------

    // --- Embed Fonts ---
    const poppinsBoldFont = await pdfDoc.embedFont(poppinsBoldFontBytes!); // Use non-null assertion as we throw if loading fails
    const interRegularFont = await pdfDoc.embedFont(interRegularFontBytes!);
    // -----------------

    // --- Embed Logo ---
    if (logoImageBytes) {
      try {
        logoImage = await pdfDoc.embedJpg(logoImageBytes); // Assuming JPG
        const logoScale = 40 / logoImage.height; // Scale logo to ~40 points height
        logoDims = logoImage.scale(logoScale);
        console.log("Logo embedded successfully.");
      } catch (embedError) {
        console.error("Failed to embed logo:", embedError);
        logoImage = null; // Ensure logo is null if embedding failed
      }
    }
    // ----------------

    let page = pdfDoc.addPage(PageSizes.A4); // Use A4 size
    const { width, height } = page.getSize();

    let currentY = height - MARGIN_TOP; // Track current Y position
    const contentWidth = width - MARGIN_LEFT - MARGIN_RIGHT;

    // --- Draw Header (Logo Top Right) ---
    if (logoImage) {
      page.drawImage(logoImage, {
        x: width - MARGIN_RIGHT - logoDims.width,
        y: height - MARGIN_TOP - logoDims.height, // Adjust Y based on logo height and top margin
        width: logoDims.width,
        height: logoDims.height,
      });
      // Adjust starting Y position if logo is tall
      currentY = height - MARGIN_TOP - logoDims.height - 15; // Add some padding below logo
    } else {
      // Fallback if no logo - maybe draw placeholder text?
      currentY -= 15; // Standard padding from top
    }
    // -----------------------------------

    // --- Draw Product Title ---
    page.drawText(dbProductData.product_title || "Product Title", {
      x: MARGIN_LEFT,
      y: currentY,
      font: poppinsBoldFont,
      size: FONT_SIZE_TITLE,
      color: COLOR_PRIMARY_GREEN,
      maxWidth: contentWidth * 0.7, // Allow space for logo potentially
      lineHeight: FONT_SIZE_TITLE * 1.2,
    });
    // Calculate title height approximately (very basic)
    const titleLines = Math.ceil(
      poppinsBoldFont.widthOfTextAtSize(
        dbProductData.product_title || "Product Title",
        FONT_SIZE_TITLE
      ) /
        (contentWidth * 0.7)
    );
    currentY -= FONT_SIZE_TITLE * 1.2 * titleLines + 5; // Add spacing below title

    // --- Draw Product Code ---
    page.drawText(dbProductData.product_code || "Product Code", {
      x: MARGIN_LEFT,
      y: currentY,
      font: interRegularFont,
      size: FONT_SIZE_BODY, // Use body size for code
      color: COLOR_DIVIDER_GREY, // Use grey for code
    });
    currentY -= LINE_HEIGHT_BODY * 1.5; // More spacing

    // --- Divider Line ---
    page.drawLine({
      start: { x: MARGIN_LEFT, y: currentY },
      end: { x: width - MARGIN_RIGHT, y: currentY },
      thickness: 0.5,
      color: COLOR_DIVIDER_GREY,
    });
    currentY -= 15; // Space below divider

    // --- Embed Product Image (if path provided AND NOT preview) --- //
    let embeddedProductImage: PDFImage | null = null;
    let productImageDims = { width: 0, height: 0 };
    if (!isPreview) {
      const productImagePath = dbProductData.image_path; // Use path from DB data
      if (productImagePath) {
        try {
          console.log(
            `Downloading product image from storage: ${productImagePath}`
          );

          const { data: blobData, error: downloadError } =
            await supabaseAdmin.storage
              .from("datasheet-assets") // Bucket name
              .download(productImagePath); // Use the direct path

          if (downloadError) {
            throw new Error(`Storage download error: ${downloadError.message}`);
          }
          if (!blobData) {
            throw new Error("Downloaded product image data (Blob) is null.");
          }

          const imageBytes = await blobData.arrayBuffer(); // Get ArrayBuffer from Blob
          console.log(
            `Fetched product image successfully (${imageBytes.byteLength} bytes)`
          );

          // Infer image type or use fallback
          if (productImagePath.toLowerCase().endsWith(".png")) {
            embeddedProductImage = await pdfDoc.embedPng(imageBytes);
          } else if (
            productImagePath.toLowerCase().endsWith(".jpg") ||
            productImagePath.toLowerCase().endsWith(".jpeg")
          ) {
            embeddedProductImage = await pdfDoc.embedJpg(imageBytes);
          } else {
            // Try embedding as PNG then JPG as fallback
            try {
              embeddedProductImage = await pdfDoc.embedPng(imageBytes);
            } catch {
              try {
                embeddedProductImage = await pdfDoc.embedJpg(imageBytes);
              } catch (embedError: any) {
                console.error(
                  "Failed to embed product image as PNG or JPG:",
                  embedError.message
                );
              }
            }
          }

          if (embeddedProductImage) {
            console.log("Product image embedded, calculating scale...");
            // Determine max width/height based on orientation and layout
            const maxImageWidth =
              contentWidth *
              (currentImageOrientation === "landscape" ? 0.5 : 0.4); // Use the flag
            const maxImageHeight = height * 0.3; // Limit vertical space
            const scale = Math.min(
              maxImageWidth / embeddedProductImage.width,
              maxImageHeight / embeddedProductImage.height,
              1 // Don't scale up
            );
            productImageDims = embeddedProductImage.scale(scale);
            console.log(
              "Product image dimensions for drawing:",
              productImageDims
            );
          } else {
            console.log("Product image could not be embedded.");
          }
        } catch (imgError: any) {
          console.error("Error processing product image:", imgError.message);
          // Continue PDF generation without the image
        }
      } else {
        console.log("No product image to draw.");
      }
    } else {
      console.log("Skipping product image embedding for preview.");
    }
    // ---------------------------------------------------------

    // --- Load Ireland Logo Conditionally ---
    let irelandLogoBytes: Uint8Array | null = null;
    let irelandLogoImage: PDFImage | null = null;
    let irelandLogoDims = { width: 0, height: 0 };
    if (includeIrelandLogo && !isPreview) {
      // Only load if flag is true and not preview
      try {
        irelandLogoBytes = await Deno.readFile(
          new URL(
            "../_shared/assets/transparent-DESIGNED   & MANUFACTURED  IN IRELAND-512px.png",
            import.meta.url
          )
        );
        console.log("Ireland logo loaded.");
      } catch (logoError: any) {
        console.error("Error loading Ireland logo:", logoError.message);
      }

      if (irelandLogoBytes) {
        try {
          irelandLogoImage = await pdfDoc.embedPng(irelandLogoBytes);
          const logoScale = 30 / irelandLogoImage.height; // Scale to ~30 points height
          irelandLogoDims = irelandLogoImage.scale(logoScale);
          console.log("Ireland logo embedded.");
        } catch (embedError: any) {
          console.error("Error embedding Ireland logo:", embedError.message);
          irelandLogoImage = null;
        }
      }
    }
    // ---                                ---

    // --- Layout columns (Description/Features on Left, Image/Specs on Right) ---
    const leftColumnX = MARGIN_LEFT;
    const leftColumnWidth = contentWidth * 0.55 - 10; // 55% width with padding
    const rightColumnX = MARGIN_LEFT + contentWidth * 0.55 + 10;
    const rightColumnWidth = contentWidth * 0.45 - 10; // 45% width with padding

    const columnStartY = currentY; // Remember starting Y for columns

    // --- Left Column: Description ---
    page.drawText("Description", {
      x: leftColumnX,
      y: currentY,
      font: poppinsBoldFont,
      size: FONT_SIZE_H2,
      color: COLOR_PRIMARY_GREEN,
    });
    currentY -= FONT_SIZE_H2 * 1.2 + 4; // Spacing

    const descriptionText = dbProductData.description || "";
    const descLines = descriptionText.split("\n");
    descLines.forEach((line: string) => {
      if (currentY < MARGIN_BOTTOM + FOOTER_HEIGHT + 20) return; // Check space before drawing
      // TODO: Implement text wrapping for long lines if needed
      page.drawText(line, {
        x: leftColumnX,
        y: currentY,
        font: interRegularFont,
        size: FONT_SIZE_BODY,
        color: COLOR_BODY_TEXT,
        maxWidth: leftColumnWidth,
        lineHeight: LINE_HEIGHT_BODY,
      });
      currentY -= LINE_HEIGHT_BODY;
    });
    const leftColumnEndY_Desc = currentY; // Y position after description

    // --- Left Column: Key Features ---
    currentY -= 15; // Space before Key Features
    page.drawText("Key Features", {
      x: leftColumnX,
      y: currentY,
      font: poppinsBoldFont,
      size: FONT_SIZE_H2,
      color: COLOR_PRIMARY_GREEN,
    });
    currentY -= FONT_SIZE_H2 * 1.2 + 4; // Spacing

    const featuresText = dbProductData.key_features || "";
    const featureLines = featuresText
      .split("\n")
      .map((l: string) => l.trim())
      .filter((l: string) => l); // Split, trim, remove empty lines
    const bulletIndent = 10;
    featureLines.forEach((line: string) => {
      if (currentY < MARGIN_BOTTOM + FOOTER_HEIGHT + 20) return;
      page.drawCircle({
        x: leftColumnX + bulletIndent / 2,
        y: currentY + FONT_SIZE_SMALL * 0.3, // Align bullet vertically
        size: 1.5, // Bullet size
        color: COLOR_BODY_TEXT,
      });
      page.drawText(line, {
        x: leftColumnX + bulletIndent + 5, // Indent text past bullet
        y: currentY,
        font: interRegularFont,
        size: FONT_SIZE_SMALL, // Use smaller font for features/specs
        color: COLOR_BODY_TEXT,
        maxWidth: leftColumnWidth - (bulletIndent + 5),
        lineHeight: LINE_HEIGHT_SMALL,
      });
      currentY -= LINE_HEIGHT_SMALL; // Use small line height
    });
    const leftColumnEndY_Features = currentY; // Y position after features

    // --- Left Column: Add Ireland Logo if applicable ---
    let leftColumnEndY_IrelandLogo = leftColumnEndY_Features;
    if (irelandLogoImage) {
      currentY -= 15; // Space before logo
      if (currentY < MARGIN_BOTTOM + FOOTER_HEIGHT + irelandLogoDims.height) {
        console.log("Not enough space for Ireland logo on this page.");
        // TODO: Add logic for new page if needed
      } else {
        page.drawImage(irelandLogoImage, {
          x: leftColumnX,
          y: currentY - irelandLogoDims.height, // Draw from bottom up
          width: irelandLogoDims.width,
          height: irelandLogoDims.height,
        });
        currentY -= irelandLogoDims.height + 5; // Space after logo
        leftColumnEndY_IrelandLogo = currentY;
        console.log("Ireland logo drawn.");
      }
    }
    // ---                                           ---

    // --- Right Column: Product Image ---
    currentY = columnStartY; // Reset Y to top of column area for the right side
    if (embeddedProductImage) {
      const imageDrawX =
        rightColumnX + (rightColumnWidth - productImageDims.width) / 2; // Center image in right column
      const imageDrawY = currentY - productImageDims.height; // Place below column start
      page.drawImage(embeddedProductImage, {
        x: imageDrawX,
        y: imageDrawY,
        width: productImageDims.width,
        height: productImageDims.height,
      });
      currentY = imageDrawY - 15; // Update Y below the image with padding
      console.log("Product image drawn.");
    } else {
      console.log("No product image to draw.");
      // Optionally draw a placeholder box
      currentY -= 30; // Add some space if no image
    }
    const rightColumnEndY_Image = currentY; // Y after image

    // --- Right Column: Specifications Table ---
    currentY -= 5; // Add little space before specs header
    page.drawText("Specifications", {
      x: rightColumnX,
      y: currentY,
      font: poppinsBoldFont,
      size: FONT_SIZE_H2,
      color: COLOR_PRIMARY_GREEN,
    });
    currentY -= FONT_SIZE_H2 * 1.2 + 4; // Spacing

    const specsText = dbProductData.tech_specs || "";
    const specPairs = specsText
      .split("\n")
      .map((l: string) => {
        const parts = l.split(":");
        if (parts.length >= 2) {
          return {
            label: parts[0].trim(),
            value: parts.slice(1).join(":").trim(),
          };
        }
        return null; // Ignore lines without a colon
      })
      .filter(
        (
          p: { label: string; value: string } | null
        ): p is { label: string; value: string } => p !== null
      ); // Type guard + Explicit Type

    // Draw specs table (simplified)
    let tableY = currentY;
    const rowHeight = LINE_HEIGHT_SMALL * 1.5; // Add padding between rows
    const labelWidth = rightColumnWidth * 0.4;
    const valueWidth = rightColumnWidth * 0.6 - 5;

    // Background for the table (optional)
    // page.drawRectangle({
    //   x: rightColumnX,
    //   y: tableY - (specPairs.length * rowHeight), // Estimate background height
    //   width: rightColumnWidth,
    //   height: specPairs.length * rowHeight, // Estimate background height
    //   color: COLOR_TABLE_BACKGROUND,
    // });

    specPairs.forEach((pair: any) => {
      if (!pair) return;
      if (tableY < MARGIN_BOTTOM + FOOTER_HEIGHT + 20) return; // Check space

      // Draw Label
      page.drawText(pair.label, {
        x: rightColumnX,
        y: tableY,
        font: poppinsBoldFont, // Bold label
        size: FONT_SIZE_SMALL,
        color: COLOR_BODY_TEXT,
        maxWidth: labelWidth,
        lineHeight: LINE_HEIGHT_SMALL,
      });

      // Draw Value
      page.drawText(pair.value, {
        x: rightColumnX + labelWidth + 5,
        y: tableY,
        font: interRegularFont, // Regular value
        size: FONT_SIZE_SMALL,
        color: COLOR_BODY_TEXT,
        maxWidth: valueWidth,
        lineHeight: LINE_HEIGHT_SMALL,
      });

      tableY -= rowHeight; // Move to next row
    });
    currentY = tableY; // Update main Y tracker
    const rightColumnEndY_Specs = currentY; // Y after specs

    // --- Determine Lowest Y Position ---
    // Compare the final Y positions of the left and right columns
    const finalContentY = Math.min(
      leftColumnEndY_IrelandLogo, // Use the Y after the last element in left column
      rightColumnEndY_Specs
    );
    // -----------------------------------

    // --- Add Other Fields (Weight, Warranty, Shipping) below columns ---
    // Position below the lowest point reached by either column
    currentY = Math.min(leftColumnEndY_Features, rightColumnEndY_Specs) - 20;

    // Check for page break before adding more content
    if (currentY < MARGIN_BOTTOM + FOOTER_HEIGHT + 50) {
      page = pdfDoc.addPage(); // Add a new page
      currentY = height - MARGIN_TOP; // Reset Y for new page (leave space for potential header elements if needed)
      // Optionally redraw header/logo on new page? For now, just reset content Y.
    }

    // Draw Weight, Warranty, Shipping Info (simple key-value pairs)
    const otherInfo = [
      { label: "Weight", value: dbProductData.weight },
      { label: "Warranty", value: dbProductData.warranty },
      { label: "Shipping Info", value: dbProductData.shipping_info },
      // Add optional logos text if needed
    ].filter((info) => info.value); // Filter out items with no value

    otherInfo.forEach((info) => {
      if (currentY < MARGIN_BOTTOM + FOOTER_HEIGHT + 20) return;
      page.drawText(`${info.label}: ${info.value}`, {
        x: MARGIN_LEFT,
        y: currentY,
        font: interRegularFont,
        size: FONT_SIZE_BODY,
        color: COLOR_BODY_TEXT,
        maxWidth: contentWidth,
        lineHeight: LINE_HEIGHT_BODY,
      });
      currentY -= LINE_HEIGHT_BODY * 1.2; // Add spacing
    });

    // --- Footer ---
    // Draw footer on *every* page
    pdfDoc.getPages().forEach((footerPage: PDFPage) => {
      const { width: footerPageWidth, height: footerPageHeight } =
        footerPage.getSize();
      // Green Background Bar
      footerPage.drawRectangle({
        x: 0,
        y: 0,
        width: footerPageWidth,
        height: FOOTER_HEIGHT,
        color: COLOR_PRIMARY_GREEN,
      });

      // Centered White Text
      const footerText = "www.appliedpi.com  |  www.ptocompressors.com"; // Add separator
      const textWidth = interRegularFont.widthOfTextAtSize(
        footerText,
        FONT_SIZE_FOOTER
      );
      footerPage.drawText(footerText, {
        x: (footerPageWidth - textWidth) / 2,
        y: (FOOTER_HEIGHT - FONT_SIZE_FOOTER) / 2 + 2, // Center vertically within the bar (adjust offset as needed)
        font: interRegularFont,
        size: FONT_SIZE_FOOTER,
        color: COLOR_WHITE,
      });
    });
    // ------------

    // --- Serialize PDF ---
    const pdfBytes = await pdfDoc.save();
    console.log(
      "PDF generated successfully using Design Guidelines (Size:",
      pdfBytes.length,
      "bytes)"
    );
    // --------------------

    // --- Handle Response (Preview vs. Final) ---
    if (isPreview) {
      // Preview Mode: Return Base64 PDF
      console.log("Returning Base64 PDF for preview.");
      const pdfBase64 = base64Encode(pdfBytes);
      return new Response(JSON.stringify({ pdfData: pdfBase64 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    } else {
      // Final Mode: Save to Storage and Update DB
      console.log("Saving PDF to storage and updating database...");
      if (!productId) {
        // This should have been caught earlier, but double-check
        throw new Error("Product ID is missing for final generation.");
      }

      // Define storage path
      // Example: orgId/productId/ProductTitle-ProductCode.pdf
      const orgId = dbProductData.organization_id; // Assuming orgId is fetched
      if (!orgId) {
        throw new Error(
          "Organization ID not found in product data, cannot determine storage path."
        );
      }
      const safeTitle = (dbProductData.product_title || "product").replace(
        /[^a-zA-Z0-9_\-\.]/g,
        "_"
      ); // Sanitize title for filename
      const safeCode = (dbProductData.product_code || "code").replace(
        /[^a-zA-Z0-9_\-\.]/g,
        "_"
      ); // Sanitize code for filename (Single line)
      const pdfFileName = `${safeTitle}-${safeCode}.pdf`;
      const storagePath = `${orgId}/${productId}/generated_pdfs/${pdfFileName}`; // Path construction (Single line)
      // -----------------------------------

      try {
        // 1. Upload PDF to Storage
        console.log(`Uploading PDF to storage at: ${storagePath}`);
        const { data: uploadData, error: uploadError } =
          await supabaseAdmin.storage
            .from("datasheet-assets") // Ensure this is your bucket name
            .upload(storagePath, pdfBytes, {
              contentType: "application/pdf",
              upsert: true, // Overwrite if exists
            });

        if (uploadError) {
          throw new Error(
            `Failed to upload PDF to storage: ${uploadError.message}`
          );
        }
        console.log("PDF uploaded successfully:", uploadData);

        // Get the public URL (or handle signed URLs later if needed)
        // const { data: urlData } = supabaseAdmin.storage
        //   .from("datasheet-assets")
        //   .getPublicUrl(storagePath);
        // const publicUrl = urlData?.publicUrl;
        // console.log("Public URL:", publicUrl);

        // 2. Update Product Table with Storage Path
        console.log("Updating product table with PDF storage path...");
        const { data: updateData, error: updateError } = await supabaseAdmin
          .from("products")
          .update({
            pdf_storage_path: storagePath,
            updated_at: new Date().toISOString(),
          })
          .eq("id", productId);

        if (updateError) {
          throw new Error(
            `Failed to update product with PDF path: ${updateError.message}`
          );
        }
        console.log("Product table updated successfully:", updateData);

        // Return success response with storage path
        return new Response(
          JSON.stringify({
            message: "PDF generated and saved successfully.",
            pdfStoragePath: storagePath,
            // pdfPublicUrl: publicUrl,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          }
        );
      } catch (saveError: any) {
        console.error("Error during PDF save/update process:", saveError);
        // Attempt to return a structured error
        return new Response(
          JSON.stringify({
            error: `Failed to save/update PDF: ${saveError.message}`,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          }
        );
      }
    }
    // -----------------------------------------
  } catch (error: any) {
    console.error("--- Error in generate-datasheet function ---", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: error instanceof Deno.errors.NotFound ? 404 : 500,
    });
  }
});

/* 
  Example Invocation (POST request):

  For Final Generation:
  {
    "productId": "your-product-uuid", 
    "userId": "user-uuid" 
    // Other fields are now fetched from DB based on productId
  }

  For Preview Generation:
  {
    "isPreview": true,
    "productTitle": "Preview Widget",
    "productCode": "PREV-001",
    "description": "This is a preview description.",
    "keyFeatures": "- Feature A
- Feature B",
    "techSpecs": "Voltage: 5V
Current: 1A",
    "weight": "100g",
    "warranty": "1y",
    "shippingInfo": "std",
    "imagePath": "user-uuid/images/preview-image.jpg", // Optional path for preview image
    "imageOrientation": "portrait",
    "optionalLogos": { "ceMark": true },
    "catalogCategory": "Preview Category",
    "userId": "user-uuid" // Still needed for potential image fetching
  }

*/
