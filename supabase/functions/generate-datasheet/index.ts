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

// --- Design Guideline Constants (Based on Guidelines & Image Analysis) ---
const COLOR_PRIMARY_GREEN = rgb(44 / 255, 82 / 255, 52 / 255); // #2c5234
const COLOR_BODY_TEXT = rgb(42 / 255, 42 / 255, 42 / 255); // #2A2A2A
const COLOR_GREY_TEXT = rgb(128 / 255, 128 / 255, 128 / 255); // #808080 (For subtitle, lines)
const COLOR_TABLE_BACKGROUND = rgb(239 / 255, 242 / 255, 239 / 255); // #EFF2EF
const COLOR_WHITE = rgb(1, 1, 1);

// Margins (A4: 210x297mm approx 595x842 points)
const PAGE_WIDTH = PageSizes.A4[0];
const PAGE_HEIGHT = PageSizes.A4[1];
const MARGIN_LEFT = mmToPoints(22); // 62.36 pt
const MARGIN_RIGHT = mmToPoints(11); // 31.18 pt
const MARGIN_TOP = mmToPoints(15); // 42.52 pt (Using previous midpoint)
const MARGIN_BOTTOM = mmToPoints(15); // 42.52 pt (Assume same as top for content bottom)
const FOOTER_HEIGHT = mmToPoints(15); // 42.52 pt
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

// Font Sizes (assumed where not specified)
const FONT_SIZE_TITLE = 16; // Min 12pt, max 20pt. Using 16pt.
const FONT_SIZE_SUBTITLE = 8; // Assumed smaller size for subtitle
const FONT_SIZE_H2 = 12; // Assumed size for headings like "Key Features"
const FONT_SIZE_BODY = 9; // Recommended body size
const FONT_SIZE_SPECS = 9; // Assumed same as body for specs table text
const FONT_SIZE_FOOTER = 9.6; // Specified footer size

// Spacing (example values, adjust as needed)
const SPACE_AFTER_TITLE = 5;
const SPACE_AFTER_SUBTITLE = 8;
const SPACE_AFTER_DIVIDER = 15;
const SPACE_AFTER_DESCRIPTION = 20;
const SPACE_AFTER_FEATURES_IMAGE = 20;
const SPACE_AFTER_SPECS = 20;
const SPACE_AFTER_WARRANTY = 20;
// --- Adjust space between list items ---
const SPACE_BETWEEN_LIST_ITEMS = 8; // Increased slightly from 5
// -------------------------------------
const SPACE_BETWEEN_SPECS_ROWS = 4;
// --- Adjust Max Section Heights to Reserve More Bottom Space ---
const MAX_FEATURES_HEIGHT = 260; // Reduced from 250
const MAX_SPECS_HEIGHT = 180; // Reduced from 200
// ----------------------------------------------------------
// --- End Design Constants ---

// --- Helper function for Warranty Text Mapping (Step 7) ---
const getWarrantyText = (code: string | null): string => {
  switch (code) {
    case "1y":
      return "This product is covered by a 12-month warranty against defect in materials and workmanship.";
    case "2y":
      return "This product is covered by a 24-month warranty (Placeholder Text)."; // Placeholder
    case "lifetime":
      return "This product is covered by a limited lifetime warranty (Placeholder Text)."; // Placeholder
    case "none":
      return "This product is sold without warranty (Placeholder Text)."; // Placeholder
    default:
      return "Warranty information not specified.";
  }
};
// --- End Helper Function ---

// --- Helper function for Shipping Text Mapping (Step 8) ---
const getShippingText = (code: string | null): string => {
  switch (code) {
    case "expedited":
      return "The Applied 20 Litre Classic Blast Machine will be securely mounted on a wooden pallet measuring 1200mm x 1000mm. Please note that up to four units can be shipped on a single pallet. To maximise value and efficiency, we recommend shipping the full quantity per pallet whenever possible.";
    case "std":
      return "Standard shipping information placeholder."; // Placeholder
    case "freight":
      return "Freight shipping information placeholder."; // Placeholder
    default:
      return "Shipping information not specified.";
  }
};
// --- End Helper Function ---

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

    // --- Load Logo --- // (Revert path reference BACK to new URL)
    let logoImageBytes: Uint8Array | null = null;
    let logoImage: PDFImage | null = null;
    let logoDims = { width: 0, height: 0 };
    try {
      // Revert back to new URL()
      logoImageBytes = await Deno.readFile(
        new URL("../_shared/assets/Appliedlogo.jpg", import.meta.url) // Reverted path
      );
      console.log("Logo image file read (using new URL)."); // Updated log message
    } catch (logoError: any) {
      console.error("Error loading logo image (using new URL):", logoError);
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
    // TODO: Add Inter-Bold if needed for Specs Values later
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
    // --- Remove width/height re-declaration ---
    // const { width, height } = page.getSize();

    let currentY = PAGE_HEIGHT - MARGIN_TOP; // Initialize Y position

    // --- Draw Header (Logo Top Right) ---
    let logoTopY = PAGE_HEIGHT - MARGIN_TOP; // Y coord for top of logo
    if (logoImage) {
      page.drawImage(logoImage, {
        x: PAGE_WIDTH - MARGIN_RIGHT - logoDims.width,
        y: PAGE_HEIGHT - MARGIN_TOP - logoDims.height, // Draw logo aligned to top margin
        width: logoDims.width,
        height: logoDims.height,
      });
      logoTopY = PAGE_HEIGHT - MARGIN_TOP; // Top Y remains at margin
    } else {
      // If no logo, reserve some space anyway or adjust logic
      logoDims.height = 20; // Assume some default height if no logo
      logoTopY = PAGE_HEIGHT - MARGIN_TOP;
    }
    // -----------------------------------

    // --- Draw Header Section (Step 3 - Revised Vertical Alignment) ---
    // Calculate Text Block Height
    const titleText = dbProductData.product_title || "Product Title";
    const titleWidth = poppinsBoldFont.widthOfTextAtSize(
      titleText,
      FONT_SIZE_TITLE
    );
    const titleMaxX =
      PAGE_WIDTH -
      MARGIN_RIGHT -
      (logoDims.width > 0 ? logoDims.width + 20 : 0); // Max X to avoid logo
    const titleAvailableWidth = titleMaxX - MARGIN_LEFT;
    const approxTitleLines = Math.max(
      1,
      Math.ceil(titleWidth / titleAvailableWidth)
    );
    const titleHeight = FONT_SIZE_TITLE * 1.2 * approxTitleLines;

    const productCodeText = dbProductData.product_code || "N/A";
    const weightText = dbProductData.weight
      ? ` | Weight ${dbProductData.weight}`
      : "";
    const subtitleText = `Product Code ${productCodeText}${weightText}`;
    const subtitleHeight = FONT_SIZE_SUBTITLE * 1.2; // Approx height

    const textBlockHeight = titleHeight + SPACE_AFTER_TITLE + subtitleHeight;

    // Determine Max Height and Calculate Text Start Y for Centering
    const maxHeaderElementHeight = Math.max(logoDims.height, textBlockHeight);
    // Center the text block vertically relative to the max height
    // --- Add small downward offset for visual balance ---
    const textVerticalOffset = 5; // Adjust as needed
    const textStartY =
      PAGE_HEIGHT -
      MARGIN_TOP -
      (maxHeaderElementHeight - textBlockHeight) / 2 -
      textVerticalOffset;

    let textCurrentY = textStartY; // Use a separate Y tracker for text within the header block

    // 3.1: Product Title (Aligned Top Left, Vertically Centered Block)
    page.drawText(titleText, {
      x: MARGIN_LEFT,
      y: textCurrentY - titleHeight, // Draw from the calculated start Y, adjusted for title height
      font: poppinsBoldFont,
      size: FONT_SIZE_TITLE,
      color: COLOR_PRIMARY_GREEN,
      maxWidth: titleAvailableWidth,
      lineHeight: FONT_SIZE_TITLE * 1.2,
    });
    textCurrentY -= titleHeight + SPACE_AFTER_TITLE; // Move text Y down

    // 3.2: Subtitle (Below Title)
    page.drawText(subtitleText, {
      x: MARGIN_LEFT,
      y: textCurrentY - subtitleHeight, // Draw below title pos
      font: interRegularFont,
      size: FONT_SIZE_SUBTITLE,
      color: COLOR_GREY_TEXT,
      maxWidth: titleAvailableWidth,
      lineHeight: FONT_SIZE_SUBTITLE * 1.2,
    });
    // textCurrentY already represents the bottom of the subtitle block (+ space)
    const textBlockBottomY = textCurrentY - subtitleHeight;

    // Calculate overall bottom Y for the header section
    const headerBottomY = PAGE_HEIGHT - MARGIN_TOP - maxHeaderElementHeight;

    // 3.3: Horizontal Divider Line (Positioned below the header block)
    const dividerY = headerBottomY - SPACE_AFTER_SUBTITLE; // Place divider below the max element height
    page.drawLine({
      start: { x: MARGIN_LEFT, y: dividerY },
      end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: dividerY },
      thickness: 0.5,
      color: COLOR_GREY_TEXT,
    });

    // Update main currentY to be below the divider
    currentY = dividerY - SPACE_AFTER_DIVIDER;
    // --- End Header Section ---

    // --- Draw Description Section (Step 4) ---
    const descriptionText = dbProductData.description || "";
    // Estimate height needed for description (simple approach)
    // A more accurate way involves calculating lines based on maxWidth and font
    const approxDescLines =
      descriptionText.split("\n").length +
      Math.ceil(
        interRegularFont.widthOfTextAtSize(descriptionText, FONT_SIZE_BODY) /
          CONTENT_WIDTH /
          2
      ); // Rough estimate
    const descriptionHeight = FONT_SIZE_BODY * 1.4 * approxDescLines; // Use 1.4 line height

    if (descriptionText) {
      page.drawText(descriptionText, {
        x: MARGIN_LEFT,
        y: currentY,
        font: interRegularFont,
        size: FONT_SIZE_BODY,
        color: COLOR_BODY_TEXT,
        maxWidth: CONTENT_WIDTH,
        lineHeight: FONT_SIZE_BODY * 1.4,
      });
      // TODO: Need a more accurate way to calculate text height after wrapping
      // For now, decrement by a fixed amount or estimate.
      // We'll refine height calculation later if needed for page breaks.
      currentY -= descriptionHeight + SPACE_AFTER_DESCRIPTION; // Placeholder decrement
    }
    // --- End Description Section ---

    // --- Draw Key Features & Image Section (Step 5) ---
    const featuresStartY = currentY;
    const featureColWidth = CONTENT_WIDTH * 0.6 - 10; // 60% width, minus padding
    const imageColX = MARGIN_LEFT + CONTENT_WIDTH * 0.6 + 10; // Start image column after feature col + padding
    const imageColWidth = CONTENT_WIDTH * 0.4 - 10; // 40% width, minus padding

    // 5.1: Left Column - Key Features Heading
    page.drawText("Key Features", {
      x: MARGIN_LEFT,
      y: currentY,
      font: poppinsBoldFont, // Assumed
      size: FONT_SIZE_H2, // Assumed
      color: COLOR_PRIMARY_GREEN, // Assumed
    });
    currentY -= FONT_SIZE_H2 * 1.2 + 4; // Space below heading

    // 5.2: Left Column - Features List
    const featuresText = dbProductData.key_features || "";
    const featureLines = featuresText
      .split("\n")
      .map((l: string) => l.trim())
      .filter((l: string) => l); // Split, trim, remove empty

    const checkmarkPlaceholder = "✓ "; // Simple text placeholder for now
    const checkmarkWidth = interRegularFont.widthOfTextAtSize(
      checkmarkPlaceholder,
      FONT_SIZE_BODY
    );
    const featureIndent = checkmarkWidth + 5; // Indent text past checkmark
    const featureLineHeight = FONT_SIZE_BODY * 1.4; // Use body line height

    // --- Refine Y tracking for features column ---
    let featuresCurrentY = currentY; // Use separate Y tracker for this column
    const featuresBottomBoundary = featuresStartY - MAX_FEATURES_HEIGHT; // Calculate lowest allowed Y
    // ------------------------------------

    featureLines.forEach((line: string) => {
      // --- Calculate estimated height FIRST ---
      const textWidth = interRegularFont.widthOfTextAtSize(
        line,
        FONT_SIZE_BODY
      );
      const approxLines = Math.max(
        1,
        Math.ceil(textWidth / (featureColWidth - featureIndent))
      );
      const estimatedHeight = approxLines * featureLineHeight;
      // ---------------------------------------

      // --- Check space BEFORE drawing item (using estimated height AND boundary) ---
      if (featuresCurrentY - estimatedHeight < featuresBottomBoundary) {
        console.log("Max height reached for features section, stopping.");
        return; // Stop drawing features
      }
      // ----------------------------------------------------------------------

      // --- Draw Checkmark (Circle + Text) ---
      const checkmarkY = featuresCurrentY - featureLineHeight * 0.7; // Align checkmark with first line
      const circleRadius = FONT_SIZE_BODY * 0.6;
      page.drawCircle({
        x: MARGIN_LEFT + circleRadius,
        y: checkmarkY,
        size: circleRadius,
        color: COLOR_PRIMARY_GREEN,
      });
      const checkmarkChar = "✓";
      const checkmarkCharWidth = interRegularFont.widthOfTextAtSize(
        checkmarkChar,
        FONT_SIZE_BODY * 0.8
      );
      page.drawText(checkmarkChar, {
        x: MARGIN_LEFT + circleRadius - checkmarkCharWidth / 2,
        y: checkmarkY - (FONT_SIZE_BODY * 0.8) / 2.5,
        font: interRegularFont,
        size: FONT_SIZE_BODY * 0.8,
        color: COLOR_WHITE,
      });
      // --------------------------------------

      // Draw Feature Text
      page.drawText(line, {
        x: MARGIN_LEFT + featureIndent,
        y: featuresCurrentY - featureLineHeight, // Start drawing near top of line
        font: interRegularFont,
        size: FONT_SIZE_BODY,
        color: COLOR_BODY_TEXT,
        maxWidth: featureColWidth - featureIndent,
        lineHeight: featureLineHeight,
      });

      // --- Decrement Y by CALCULATED height + SPACE_BETWEEN_LIST_ITEMS ---
      featuresCurrentY -= estimatedHeight + SPACE_BETWEEN_LIST_ITEMS;
      // -------------------------------------------------------------------
    });
    // --- Update featuresEndY (actual end) but use boundary for main currentY ---
    const featuresEndY = featuresCurrentY;
    // --------------------------------------------------------------------

    // 5.3: Right Column - Product Image
    let imageEndY = featuresStartY; // Default end Y if no image
    let embeddedProductImage: PDFImage | null = null;
    let productImageDims = { width: 0, height: 0 };

    if (!isPreview) {
      // Only load/embed for final generation
      const productImagePath = dbProductData.image_path;
      if (productImagePath) {
        try {
          console.log(
            `Downloading product image from storage: ${productImagePath}`
          );
          const { data: blobData, error: downloadError } =
            await supabaseAdmin.storage
              .from("datasheet-assets")
              .download(productImagePath);
          if (downloadError)
            throw new Error(`Storage download error: ${downloadError.message}`);
          if (!blobData)
            throw new Error("Downloaded product image data (Blob) is null.");
          const imageBytes = await blobData.arrayBuffer();
          console.log(
            `Fetched product image successfully (${imageBytes.byteLength} bytes)`
          );

          // Embed based on type
          if (productImagePath.toLowerCase().endsWith(".png")) {
            embeddedProductImage = await pdfDoc.embedPng(imageBytes);
          } else if (
            productImagePath.toLowerCase().endsWith(".jpg") ||
            productImagePath.toLowerCase().endsWith(".jpeg")
          ) {
            embeddedProductImage = await pdfDoc.embedJpg(imageBytes);
          }

          if (embeddedProductImage) {
            console.log(
              "Product image embedded. Calculating scale based on orientation:",
              currentImageOrientation
            );

            // --- Define Image Area Constraints ---
            const imageAvailableWidth = imageColWidth;
            const imageAvailableHeight = MAX_FEATURES_HEIGHT; // Use max section height as vertical constraint
            // -----------------------------------

            // --- Calculate Scaling Factor (Fit within bounds) ---
            const scaleX = imageAvailableWidth / embeddedProductImage.width;
            const scaleY = imageAvailableHeight / embeddedProductImage.height;
            const scale = Math.min(scaleX, scaleY, 1); // Fit both width & height, don't scale up (max scale 1)
            // -------------------------------------------------

            productImageDims = embeddedProductImage.scale(scale);
            console.log("Scaled product image dimensions:", productImageDims);
          } else {
            console.log(
              "Product image could not be embedded (unsupported format?)."
            );
          }
        } catch (imgError: any) {
          console.error("Error processing product image:", imgError.message);
          embeddedProductImage = null; // Ensure it's null on error
        }
      } else {
        console.log("No product image path found.");
      }
    } else {
      console.log("Skipping product image embedding for preview.");
    }

    // --- Draw the Scaled Image ---
    if (embeddedProductImage) {
      // Center horizontally within the image column
      const imageDrawX =
        imageColX + (imageColWidth - productImageDims.width) / 2;
      // Align top of image with the top of the features section (featuresStartY)
      const imageDrawY = featuresStartY - productImageDims.height;

      // Check if image fits vertically ON THE PAGE
      if (imageDrawY > MARGIN_BOTTOM + FOOTER_HEIGHT) {
        page.drawImage(embeddedProductImage, {
          x: imageDrawX,
          y: imageDrawY,
          width: productImageDims.width,
          height: productImageDims.height,
        });
        imageEndY = imageDrawY; // Update the actual bottom Y of the drawn image
        console.log("Product image drawn.");
      } else {
        console.log(
          "Not enough space for product image ON PAGE. Image skipped."
        );
        // imageEndY remains featuresStartY if not drawn
      }
    } else {
      console.log("No product image to draw.");
      // imageEndY remains featuresStartY
    }
    // --- End Draw Image ---

    // 5.4: Update main currentY below the lowest point of features OR image
    // Use the actual end Y of features list (featuresEndY) and image (imageEndY)
    currentY = Math.min(featuresEndY, imageEndY) - SPACE_AFTER_FEATURES_IMAGE;
    // --- End Key Features & Image Section ---

    // --- Draw Specifications Section (Step 6) ---
    // 6.1: Green Header Bar
    const specsHeaderHeight = FONT_SIZE_H2 * 1.5; // Example height, adjust as needed
    page.drawRectangle({
      x: MARGIN_LEFT,
      y: currentY - specsHeaderHeight,
      width: CONTENT_WIDTH,
      height: specsHeaderHeight,
      color: COLOR_PRIMARY_GREEN,
    });

    // 6.2: "Specifications" Text on Bar
    const specsHeaderText = "Specifications";
    const specsHeaderTextWidth = poppinsBoldFont.widthOfTextAtSize(
      specsHeaderText,
      FONT_SIZE_H2
    );
    page.drawText(specsHeaderText, {
      x: MARGIN_LEFT + (CONTENT_WIDTH - specsHeaderTextWidth) / 2, // Center horizontally
      y:
        currentY -
        specsHeaderHeight +
        (specsHeaderHeight - FONT_SIZE_H2) / 2 +
        1, // Center vertically (adjust offset)
      font: poppinsBoldFont, // Assumed
      size: FONT_SIZE_H2, // Assumed
      color: COLOR_WHITE, // White text on green bar
    });
    // --- Calculate Specs start Y and boundary ---
    const specsStartY = currentY;
    const specsBottomBoundary = specsStartY - MAX_SPECS_HEIGHT;
    // -------------------------------------------
    currentY -= specsHeaderHeight + SPACE_BETWEEN_SPECS_ROWS; // Move Y below header bar + padding

    // 6.3: Prepare Spec Data & Table Layout
    const specsText = dbProductData.tech_specs || "";
    let specPairs: { label: string; value: string }[] = []; // Default to empty array
    try {
      console.log("Attempting to parse tech_specs:", specsText); // Log raw input
      const parsed = JSON.parse(specsText || "[]"); // Attempt parse
      if (Array.isArray(parsed)) {
        specPairs = parsed; // Assign if valid array
        console.log("Parsed specPairs successfully:", specPairs);
      } else {
        console.warn("Parsed tech_specs is not an array, using empty.");
        specPairs = [];
      }
    } catch (e) {
      console.error(
        "!!! Failed to parse tech_specs JSON, using empty array:",
        e
      );
      specPairs = []; // Use empty array on error
    }

    const specRowHeight = FONT_SIZE_SPECS * 1.4 + SPACE_BETWEEN_SPECS_ROWS * 2; // Approx height per row with padding
    const specTableHeight = specPairs.length * specRowHeight;
    const specLabelWidth = CONTENT_WIDTH * 0.4; // Example: 40% for label
    const specValueX = MARGIN_LEFT + specLabelWidth + 10; // Start value col after label + padding
    const specValueWidth = CONTENT_WIDTH - specLabelWidth - 10; // Remaining width for value

    // 6.4: Draw Table Background (Value Column Only)
    page.drawRectangle({
      x: specValueX - 5, // Start slightly left of value text for padding
      y: currentY - specTableHeight, // Position background behind all rows
      width: PAGE_WIDTH - MARGIN_RIGHT - (specValueX - 5), // Width from value start to right margin
      height: specTableHeight,
      color: COLOR_TABLE_BACKGROUND,
    });

    // 6.5: Draw Spec Rows (Label, Value, Line)
    let actualSpecsEndY = currentY; // Track actual Y after drawing
    specPairs.forEach(
      (pair: { label: string; value: string }, index: number) => {
        // --- Check space BEFORE drawing item (using row height AND boundary) ---
        if (currentY - specRowHeight < specsBottomBoundary) {
          console.log("Max height reached for specs section, stopping.");
          return; // Stop drawing specs
        }
        // -------------------------------------------------------------------

        // --- Add Log Inside Loop ---
        console.log(
          `Drawing spec row ${index}: Label='${pair.label}', Value='${pair.value}'`
        );
        // -------------------------
        if (currentY < MARGIN_BOTTOM + FOOTER_HEIGHT + 20) return; // Basic space check
        const rowY = currentY - specRowHeight / 2; // Center text vertically in conceptual row

        // Draw Label
        page.drawText(pair.label, {
          x: MARGIN_LEFT + 5, // Add padding from left edge
          y: rowY,
          font: interRegularFont, // Assumed
          size: FONT_SIZE_SPECS, // Assumed
          color: COLOR_BODY_TEXT, // Charcoal
          maxWidth: specLabelWidth - 10, // Allow padding
          lineHeight: FONT_SIZE_SPECS * 1.2, // Adjust line height if needed
        });

        // Draw Value
        page.drawText(pair.value, {
          x: specValueX,
          y: rowY,
          font: interRegularFont, // Assumed Regular weight
          size: FONT_SIZE_SPECS, // Assumed
          color: COLOR_BODY_TEXT, // Charcoal
          maxWidth: specValueWidth - 5, // Allow padding
          lineHeight: FONT_SIZE_SPECS * 1.2,
        });

        // Move Y for next row calculation
        currentY -= specRowHeight;

        // Draw Separator Line (draw below the content, using the new currentY)
        page.drawLine({
          start: { x: MARGIN_LEFT, y: currentY },
          end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: currentY },
          thickness: 0.5,
          color: COLOR_GREY_TEXT, // Use light grey
        });
      }
    );

    // --- Set currentY to the defined boundary after drawing ---
    currentY = specsBottomBoundary - SPACE_AFTER_SPECS;
    // ------------------------------------------------------
    // --- End Specifications Section ---

    // --- Draw Warranty Section (Re-added Here - Step 7) ---
    const warrantyCode = dbProductData.warranty;
    const warrantyText = getWarrantyText(warrantyCode);
    const approxWarrantyLines = Math.max(
      1,
      Math.ceil(
        interRegularFont.widthOfTextAtSize(warrantyText, FONT_SIZE_BODY) /
          CONTENT_WIDTH /
          1.5
      )
    ); // Rough estimate
    const warrantyHeight = FONT_SIZE_BODY * 1.4 * approxWarrantyLines; // Use 1.4 line height

    // Check space for warranty before drawing
    if (currentY - warrantyHeight < MARGIN_BOTTOM + FOOTER_HEIGHT) {
      console.log("Not enough space for warranty text.");
    } else {
      page.drawText(warrantyText, {
        x: MARGIN_LEFT,
        y: currentY - warrantyHeight, // Adjust Y to draw from baseline
        font: interRegularFont,
        size: FONT_SIZE_BODY,
        color: COLOR_BODY_TEXT,
        maxWidth: CONTENT_WIDTH,
        lineHeight: FONT_SIZE_BODY * 1.4,
      });
      currentY -= warrantyHeight + SPACE_AFTER_WARRANTY; // Decrement Y
    }
    // --- End Warranty Section ---

    // --- Draw Shipping Info & Logos Section (Step 8) ---
    const shippingStartY = currentY;
    const shippingColWidth = CONTENT_WIDTH * 0.6 - 10; // 60% width, minus padding
    const logoColX = MARGIN_LEFT + CONTENT_WIDTH * 0.6 + 10; // Start logo column after shipping col + padding
    const logoColWidth = CONTENT_WIDTH * 0.4 - 10; // 40% width, minus padding

    // 8.1: Left Column - Shipping Info Heading
    page.drawText("Shipping Information", {
      x: MARGIN_LEFT,
      y: currentY,
      font: poppinsBoldFont, // Assumed
      size: FONT_SIZE_H2, // Assumed
      color: COLOR_PRIMARY_GREEN, // Assumed
    });
    currentY -= FONT_SIZE_H2 * 1.2 + 4; // Space below heading

    // 8.2: Left Column - Shipping Info Text
    const shippingCode = dbProductData.shipping_info;
    const shippingText = getShippingText(shippingCode);
    const approxShippingLines = Math.max(
      1,
      Math.ceil(
        interRegularFont.widthOfTextAtSize(shippingText, FONT_SIZE_BODY) /
          shippingColWidth /
          1.5
      )
    ); // Rough estimate
    const shippingHeight = FONT_SIZE_BODY * 1.4 * approxShippingLines; // Use 1.4 line height

    page.drawText(shippingText, {
      x: MARGIN_LEFT,
      y: currentY,
      font: interRegularFont,
      size: FONT_SIZE_BODY,
      color: COLOR_BODY_TEXT,
      maxWidth: shippingColWidth,
      lineHeight: FONT_SIZE_BODY * 1.4,
    });
    // TODO: Accurate height calculation after wrapping
    currentY -= shippingHeight; // Move Y down after text
    const shippingEndY = currentY; // Record Y after shipping info

    // 8.3: Right Column - Logos
    // Reset Y to the top of the section for this column's calculation
    let logoY = shippingStartY; // Y position for drawing logos (aligned to top of shipping info)
    const logoSectionMaxHeight = 0; // Track max height for final Y update

    // --- Load Ireland Logo --- (Keep existing loading logic)
    let irelandLogoImage: PDFImage | null = null;
    let irelandLogoDims = { width: 0, height: 0 };
    const shouldIncludeIreland =
      currentOptionalLogos.includeIrelandLogo === true;
    if (shouldIncludeIreland && !isPreview) {
      try {
        const irelandLogoBytes = await Deno.readFile(
          new URL("../_shared/assets/ireland_logo_512.png", import.meta.url)
        );
        if (irelandLogoBytes) {
          irelandLogoImage = await pdfDoc.embedPng(irelandLogoBytes);
          const desiredLogoHeight = 80;
          const logoScale = desiredLogoHeight / irelandLogoImage.height;
          irelandLogoDims = irelandLogoImage.scale(logoScale);
          console.log("Ireland logo embedded for drawing.", irelandLogoDims);
        }
      } catch (logoError: any) {
        console.error(
          "Error loading/embedding Ireland logo:",
          logoError.message
        );
        irelandLogoImage = null;
      }
    }
    // --- End Ireland Logo Load ---

    // --- Check Flags ---
    const includeCeLogo = currentOptionalLogos.ceMark === true;
    const includeOriginLogo = currentOptionalLogos.origin === true;
    console.log("Logo Flags:", {
      includeCeLogo,
      includeOriginLogo,
      includeIrelandLogo: shouldIncludeIreland,
    });

    // --- Calculate widths and total width for HORIZONTAL layout ---
    const logoSpacing = 10; // Horizontal space between logos
    let totalLogosWidth = 0;
    let maxLogoHeight = 0;

    // PED Placeholder Dimensions
    const pedPlaceholderText = "[PED]"; // Shorter text
    const pedPlaceholderWidth = includeOriginLogo
      ? interRegularFont.widthOfTextAtSize(pedPlaceholderText, FONT_SIZE_BODY)
      : 0;
    const pedPlaceholderHeight = includeOriginLogo ? FONT_SIZE_BODY * 1.2 : 0;
    if (includeOriginLogo) {
      totalLogosWidth += pedPlaceholderWidth;
      maxLogoHeight = Math.max(maxLogoHeight, pedPlaceholderHeight);
    }

    // CE Placeholder Dimensions
    const cePlaceholderText = "[CE]"; // Shorter text
    const cePlaceholderWidth = includeCeLogo
      ? interRegularFont.widthOfTextAtSize(cePlaceholderText, FONT_SIZE_BODY)
      : 0;
    const cePlaceholderHeight = includeCeLogo ? FONT_SIZE_BODY * 1.2 : 0;
    if (includeCeLogo) {
      if (totalLogosWidth > 0) totalLogosWidth += logoSpacing; // Add spacing if not first logo
      totalLogosWidth += cePlaceholderWidth;
      maxLogoHeight = Math.max(maxLogoHeight, cePlaceholderHeight);
    }

    // Ireland Logo Dimensions
    const irelandLogoWidth = irelandLogoImage ? irelandLogoDims.width : 0;
    const irelandLogoHeight = irelandLogoImage ? irelandLogoDims.height : 0;
    if (irelandLogoImage) {
      if (totalLogosWidth > 0) totalLogosWidth += logoSpacing;
      totalLogosWidth += irelandLogoWidth;
      maxLogoHeight = Math.max(maxLogoHeight, irelandLogoHeight);
    }

    // Calculate starting X to center the block of logos within the logo column
    const logoStartX = logoColX + (logoColWidth - totalLogosWidth) / 2;
    let currentLogoX = logoStartX; // X tracker for drawing logos
    const logoDrawY = logoY - maxLogoHeight; // Align bottom of logos

    // --- Draw logos horizontally ---

    // Draw PED Placeholder FIRST
    if (includeOriginLogo && !isPreview) {
      if (logoDrawY > MARGIN_BOTTOM + FOOTER_HEIGHT) {
        page.drawText(pedPlaceholderText, {
          x: currentLogoX,
          y: logoDrawY + (maxLogoHeight - pedPlaceholderHeight) / 2, // Center placeholder vertically within max height
          font: interRegularFont,
          size: FONT_SIZE_BODY,
          color: COLOR_GREY_TEXT,
        });
        currentLogoX += pedPlaceholderWidth + logoSpacing;
      } else {
        console.log("Not enough space for PED placeholder.");
      }
    }

    // Draw CE Placeholder SECOND
    if (includeCeLogo && !isPreview) {
      if (logoDrawY > MARGIN_BOTTOM + FOOTER_HEIGHT) {
        page.drawText(cePlaceholderText, {
          x: currentLogoX,
          y: logoDrawY + (maxLogoHeight - cePlaceholderHeight) / 2, // Center placeholder vertically
          font: interRegularFont,
          size: FONT_SIZE_BODY,
          color: COLOR_GREY_TEXT,
        });
        currentLogoX += cePlaceholderWidth + logoSpacing;
      } else {
        console.log("Not enough space for CE placeholder.");
      }
    }

    // Draw Ireland Logo THIRD (bottom)
    if (irelandLogoImage) {
      if (logoDrawY > MARGIN_BOTTOM + FOOTER_HEIGHT) {
        page.drawImage(irelandLogoImage, {
          x: currentLogoX,
          y: logoDrawY + (maxLogoHeight - irelandLogoHeight) / 2, // Center image vertically
          width: irelandLogoDims.width,
          height: irelandLogoDims.height,
        });
        console.log("Ireland logo drawn at X,Y:", currentLogoX, logoDrawY);
        // currentLogoX += irelandLogoWidth; // No need to increment X after last logo
      } else {
        console.log("Not enough space for Ireland logo.");
      }
    }
    // -------------------------------------------------------------

    // Calculate the Y coordinate for the bottom of the logos section
    const logosEndY = logoDrawY;

    // 8.4: Update main currentY below the lowest point of shipping text or logos
    currentY = Math.min(shippingEndY, logosEndY) - 20; // Use generic spacing for now
    // --- End Shipping Info & Logos Section ---

    // --- Update Footer Section (Step 9) ---
    pdfDoc.getPages().forEach((footerPage: PDFPage) => {
      const { width: footerPageWidth } = footerPage.getSize(); // Get width for positioning
      // Green Background Bar (reuse existing)
      footerPage.drawRectangle({
        x: 0,
        y: 0,
        width: footerPageWidth,
        height: FOOTER_HEIGHT,
        color: COLOR_PRIMARY_GREEN,
      });

      // Footer Text
      const footerTextLeft = "www.appliedpi.com";
      const footerTextRight = "www.ptocompressors.com";
      const textY = (FOOTER_HEIGHT - FONT_SIZE_FOOTER) / 2 + 1; // Vertical center (adjust offset slightly)

      // Draw Left Text (aligned with left content margin)
      footerPage.drawText(footerTextLeft, {
        x: MARGIN_LEFT, // Align with left margin
        y: textY,
        font: interRegularFont,
        size: FONT_SIZE_FOOTER,
        color: COLOR_WHITE,
      });

      // Draw Right Text (aligned with right content margin)
      const textWidthRight = interRegularFont.widthOfTextAtSize(
        footerTextRight,
        FONT_SIZE_FOOTER
      );
      footerPage.drawText(footerTextRight, {
        x: footerPageWidth - MARGIN_RIGHT - textWidthRight, // Position text end at right margin
        y: textY,
        font: interRegularFont,
        size: FONT_SIZE_FOOTER,
        color: COLOR_WHITE,
      });
    });
    // --- End Footer Section ---

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
