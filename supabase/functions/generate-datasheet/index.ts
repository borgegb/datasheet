// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

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
  LineCapStyle,
} from "https://esm.sh/pdf-lib@1.17.1"; // Use esm.sh for compatibility

// Remove unused imports
// import * as path from "https://deno.land/std@0.177.0/path/mod.ts";
// import Docx, { Paragraph, TextRun, HeadingLevel } from "https://deno.land/x/docxml@5.15.3/mod.ts";
import { encode as base64Encode } from "https://deno.land/std@0.177.0/encoding/base64.ts";
import { concat } from "https://deno.land/std@0.177.0/bytes/concat.ts";
// import { readableStreamFromReader } from "https://deno.land/std@0.177.0/streams/readable_stream_from_reader.ts";

// Import Supabase client (use Admin client for server-side access)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

console.log(
  `Function "generate-datasheet" up and running! (Saves PDF to Storage)`
);

// --- Constants ---
const COLOR_TEXT_DARK = rgb(0.1, 0.1, 0.1);
const COLOR_TEXT_MEDIUM = rgb(0.3, 0.3, 0.3);
const COLOR_TEXT_LIGHT = rgb(0.5, 0.5, 0.5); // For subtitles like product code
const COLOR_ACCENT_BLUE = rgb(59 / 255, 130 / 255, 246 / 255); // Example blue for labels
const COLOR_FOOTER_BLUE = rgb(0 / 255, 51 / 255, 102 / 255); // Darker blue for footer
const MARGIN_LEFT = 50;
const MARGIN_RIGHT = 50;
const MARGIN_TOP = 40;
const MARGIN_BOTTOM = 40;
const FONT_SIZE_TITLE = 28;
const FONT_SIZE_SUBTITLE = 14;
const FONT_SIZE_H1 = 24;
const FONT_SIZE_H2 = 14;
const FONT_SIZE_BODY = 11;
const FONT_SIZE_SMALL = 10;
const LINE_HEIGHT_BODY = 14;
const LINE_HEIGHT_SMALL = 13;
// ---           ---

// Create a single Supabase client instance (initialized with service_role key for admin access)
// IMPORTANT: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Edge Function settings
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } } // Prevent storing session cookies on server
);

serve(async (req: Request) => {
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
      techSpecs = "",
      price = "",
      imagePath = null, // Expect full image path from frontend
      imageOrientation = "portrait",
      userId, // Expect userId
    } = await req.json();

    console.log("Received request to generate PDF for product ID:", productId);

    if (!productId) {
      throw new Error("Product ID is missing in the request.");
    }
    if (!userId) {
      throw new Error("User ID is missing in the request."); // Needed for storage path
    }

    // --- PDF Generation (pdf-lib) ---
    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage(PageSizes.A4); // Use A4 size & let for potential new pages
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let currentY = height - MARGIN_TOP; // Track current Y position
    const contentWidth = width - MARGIN_LEFT - MARGIN_RIGHT;
    const columnSplitPoint = MARGIN_LEFT + contentWidth * 0.55; // Point for second column roughly
    const column2Width = width - columnSplitPoint - MARGIN_RIGHT;

    // --- Embed Image (if path provided) --- // Re-enabled logic
    let embeddedImage = null;
    let imageDims = { width: 0, height: 0 };
    if (imagePath) {
      try {
        console.log(`Downloading image from storage: ${imagePath}`);

        // Use Supabase admin client to download the image
        const { data: blobData, error: downloadError } =
          await supabaseAdmin.storage
            .from("datasheet-assets") // Bucket name
            .download(imagePath); // Use the direct path

        if (downloadError) {
          throw new Error(`Storage download error: ${downloadError.message}`);
        }
        if (!blobData) {
          throw new Error("Downloaded image data (Blob) is null.");
        }

        const imageBytes = await blobData.arrayBuffer(); // Get ArrayBuffer from Blob
        console.log(
          `Fetched image successfully from storage (${imageBytes.byteLength} bytes)`
        );

        // Infer image type from path (basic check)
        if (imagePath.toLowerCase().endsWith(".png")) {
          console.log("Attempting to embed as PNG...");
          embeddedImage = await pdfDoc.embedPng(imageBytes);
          console.log("Embedded PNG successfully.");
        } else if (
          imagePath.toLowerCase().endsWith(".jpg") ||
          imagePath.toLowerCase().endsWith(".jpeg")
        ) {
          console.log("Attempting to embed as JPG...");
          embeddedImage = await pdfDoc.embedJpg(imageBytes);
          console.log("Embedded JPG successfully.");
        } else {
          console.warn(
            "Unsupported image type inferred from path, attempting PNG then JPG:",
            imagePath
          );
          try {
            console.log("Attempting fallback embed as PNG...");
            embeddedImage = await pdfDoc.embedPng(imageBytes);
            console.log("Fallback embed as PNG successful.");
          } catch (pngError: any) {
            console.warn("Fallback PNG failed:", pngError.message);
            try {
              console.log("Attempting fallback embed as JPG...");
              embeddedImage = await pdfDoc.embedJpg(imageBytes);
              console.log("Fallback embed as JPG successful.");
            } catch (jpgError: any) {
              console.error(
                "Failed to embed image as PNG or JPG:",
                jpgError.message
              );
            }
          }
        }

        if (embeddedImage) {
          console.log("Image embedded, calculating scale...");
          const maxWidth = 180; // Allow slightly larger image
          const scale = Math.min(maxWidth / embeddedImage.width, 1);
          imageDims = embeddedImage.scale(scale);
          console.log("Image dimensions for drawing:", imageDims);
        } else {
          console.log("Image could not be embedded.");
        }
      } catch (imgError: any) {
        console.error("Error processing image from storage:", imgError.message);
        // Continue PDF generation without the image
      }
    }
    // ------------------------------------

    // --- Draw Content ---
    // TODO: Add Logo if available
    currentY -= 30; // Space for logo/padding
    page.drawText("Product Datasheet", {
      x: MARGIN_LEFT,
      y: currentY,
      size: FONT_SIZE_H1,
      font: fontBold,
      color: COLOR_TEXT_DARK,
    });
    currentY -= FONT_SIZE_H1 * 1.5;

    const productInfoStartY = currentY; // Top of the next block

    // Product Title
    page.drawText(productTitle, {
      x: MARGIN_LEFT,
      y: currentY,
      size: FONT_SIZE_TITLE,
      font: fontBold,
      color: COLOR_TEXT_DARK,
    });
    currentY -= FONT_SIZE_TITLE * 1.2;

    // Product Code
    page.drawText(productCode, {
      x: MARGIN_LEFT,
      y: currentY,
      size: FONT_SIZE_SUBTITLE,
      font: font,
      color: COLOR_TEXT_LIGHT,
    });
    currentY -= FONT_SIZE_SUBTITLE * 1.5;

    // Description
    page.drawText("Description:", {
      x: MARGIN_LEFT,
      y: currentY,
      size: FONT_SIZE_H2,
      font: fontBold,
      color: COLOR_TEXT_DARK,
    });
    currentY -= FONT_SIZE_H2 + 6;
    const descLines = description.split("\n");
    const imageColumnWidth = embeddedImage ? imageDims.width + 20 : 0;
    const descMaxWidth = columnSplitPoint - MARGIN_LEFT - 10; // Max width for description column
    descLines.forEach((line: string) => {
      if (currentY < MARGIN_BOTTOM + 100) return;
      page.drawText(line, {
        x: MARGIN_LEFT,
        y: currentY,
        size: FONT_SIZE_BODY,
        font: font,
        color: COLOR_TEXT_MEDIUM,
        lineHeight: LINE_HEIGHT_BODY,
        maxWidth: descMaxWidth,
      });
      currentY -= LINE_HEIGHT_BODY;
    });

    const productInfoEndY = currentY; // Bottom of the description block

    // Draw Image (Right aligned, attempt vertical center with product info block)
    if (embeddedImage) {
      const imageX = width - imageDims.width - MARGIN_RIGHT;
      const imageMidPointY =
        productInfoEndY + (productInfoStartY - productInfoEndY) / 2;
      const imageDrawY = imageMidPointY - imageDims.height / 2;
      page.drawImage(embeddedImage, {
        x: imageX,
        y: Math.max(imageDrawY, MARGIN_BOTTOM + 80), // Ensure it stays above price/footer area
        width: imageDims.width,
        height: imageDims.height,
      });
      console.log("Image drawn.");
    } else {
      console.log("No embedded image to draw.");
    }

    // Move below the product info block for the next section
    currentY = productInfoEndY - 40; // Add space

    // Specifications
    const specStartY = currentY;
    if (currentY < MARGIN_BOTTOM + 80) {
      page = pdfDoc.addPage();
      currentY = height - MARGIN_TOP;
    }
    page.drawText("Specifications", {
      x: MARGIN_LEFT,
      y: currentY,
      size: FONT_SIZE_H2,
      font: fontBold,
      color: COLOR_ACCENT_BLUE,
    });
    currentY -= FONT_SIZE_H2 + 6;
    const specMaxWidth = columnSplitPoint - MARGIN_LEFT - 10;
    techSpecs.split("\n").forEach((line: string) => {
      if (currentY < MARGIN_BOTTOM + 80) return;
      const trimmedLine = line.trim();
      const isBullet =
        trimmedLine.startsWith("-") || trimmedLine.startsWith("*");
      const textToShow = isBullet
        ? trimmedLine.substring(1).trim()
        : trimmedLine;
      const xPos = isBullet ? MARGIN_LEFT + 15 : MARGIN_LEFT;
      if (isBullet)
        page.drawText("•", {
          x: MARGIN_LEFT,
          y: currentY,
          size: FONT_SIZE_SMALL,
          font: font,
        });
      page.drawText(textToShow, {
        x: xPos,
        y: currentY,
        size: FONT_SIZE_SMALL,
        font: font,
        color: COLOR_TEXT_MEDIUM,
        lineHeight: LINE_HEIGHT_SMALL,
        maxWidth: specMaxWidth,
      });
      currentY -= LINE_HEIGHT_SMALL;
    });
    const specEndY = currentY;

    // Set currentY to below the lowest of the two columns before the divider
    // Adjusted: Set below Specs column only, as Applications is removed
    // currentY = Math.min(specEndY, appEndY) - 20;
    currentY = specEndY - 20; // Position below the specs list

    // --- Divider Line ---
    if (currentY < MARGIN_BOTTOM + 60) {
      page = pdfDoc.addPage();
      currentY = height - MARGIN_TOP;
    }
    page.drawLine({
      start: { x: MARGIN_LEFT, y: currentY },
      end: { x: width - MARGIN_RIGHT, y: currentY },
      thickness: 0.5,
      color: COLOR_TEXT_LIGHT,
      opacity: 0.75,
    });
    currentY -= 20; // Space below divider

    // --- Bottom Row (Single Column Now) ---
    const priceY = currentY;
    // Price (Left)
    page.drawText("Price:", {
      x: MARGIN_LEFT,
      y: priceY,
      size: FONT_SIZE_H2,
      font: fontBold,
      color: COLOR_TEXT_DARK,
    });
    page.drawText(price || "N/A", {
      x: MARGIN_LEFT,
      y: priceY - (FONT_SIZE_H2 + 2),
      size: FONT_SIZE_BODY,
      font: font,
      color: COLOR_TEXT_MEDIUM,
    });

    // Availability (Right) - REMOVED
    // page.drawText("Availability:", { x: columnSplitPoint, y: priceY, size: FONT_SIZE_H2, font: fontBold, color: COLOR_TEXT_DARK });
    // page.drawText("In Stock", { x: columnSplitPoint, y: priceY - (FONT_SIZE_H2 + 2), size: FONT_SIZE_BODY, font: font, color: COLOR_TEXT_MEDIUM });

    // --- Footer Color Bar ---
    page.drawRectangle({
      x: 0,
      y: 0,
      width: width,
      height: MARGIN_BOTTOM - 15, // Slightly smaller bar height
      color: COLOR_FOOTER_BLUE,
    });
    // -----------------------

    // --- Serialize and Encode ---
    const pdfBytes = await pdfDoc.save();
    console.log(
      "PDF generated successfully with refined layout (Base64 length:",
      pdfBytes.length,
      ")"
    );
    // ---------------------------

    // --- Upload PDF to Storage ---
    const pdfFileName = `${productTitle.replace(/[^a-z0-9]/gi, "_")}-${
      productCode.replace(/[^a-z0-9]/gi, "_") || productId
    }.pdf`.toLowerCase();
    const pdfStoragePath = `${userId}/generated_pdfs/${pdfFileName}`;
    console.log(`Uploading PDF to: ${pdfStoragePath}`);

    const { error: uploadError } = await supabaseAdmin.storage
      .from("datasheet-assets")
      .upload(pdfStoragePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("Error uploading PDF:", uploadError);
      throw new Error(`Failed to upload generated PDF: ${uploadError.message}`);
    }
    console.log("PDF uploaded successfully.");
    // ---------------------------

    // --- Update Product Record with PDF Path ---
    const { error: updateError } = await supabaseAdmin
      .from("products")
      .update({
        pdf_storage_path: pdfStoragePath,
        updated_at: new Date().toISOString(),
      })
      .eq("id", productId);

    if (updateError) {
      console.error(
        `Failed to update product ${productId} with PDF path:`,
        updateError
      );
      // Decide if this is critical - maybe return success but log?
      // For now, let's return success even if DB update fails, but log it.
    } else {
      console.log(`Product ${productId} updated with path: ${pdfStoragePath}`);
    }
    // ---------------------------------------

    // --- Return Success Response ---
    return new Response(
      JSON.stringify({ success: true, storagePath: pdfStoragePath }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
    // -------------------------------
  } catch (error: any) {
    console.error(
      "Error processing request:",
      error instanceof Error ? error.message : error,
      error?.stack
    );
    const errorMessage =
      error instanceof Error
        ? error.message
        : "An unknown error occurred generating documents";
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/generate-datasheet' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
