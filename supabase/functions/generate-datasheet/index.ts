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
import { rgb } from "https://esm.sh/pdf-lib@^1.17.1"; // Import rgb from pdf-lib
// Import the schemas you will use as plugins
import {
  text,
  image,
  line,
  table,
  rectangle,
} from "https://esm.sh/@pdfme/schemas@^5.3.0";
//

// --- SVG Checkmark Definition ---
const CHECKMARK_SVG =
  '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="8" fill="#2c5234"/><path d="M11.97 5.97a.75.75 0 0 0-1.06-1.06L7.25 8.56 5.53 6.84a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.06 0l4.19-4.18z" fill="#ffffff"/></svg>';
// --- END SVG Checkmark ---

// --- Helper function to convert hex color to pdf-lib RGB format ---
const hexToRgb = (
  hex: string
): { red: number; green: number; blue: number } => {
  if (!hex || typeof hex !== "string") return { red: 0, green: 0, blue: 0 }; // Default to black for invalid input
  hex = hex.replace(/^#/, "");
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  if (hex.length !== 6) {
    return { red: 0, green: 0, blue: 0 }; // Default to black if not 3 or 6 chars (after #)
  }
  const bigint = parseInt(hex, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return { red: r / 255, green: g / 255, blue: b / 255 };
};
// --- END Helper ---

// --- Helper: mm → pt (1 mm = 72 / 25.4 pt) ---
const mm2pt = (mm: number): number => mm * 2.83464567;
// --- END Helper ---

// --- Custom PDFME Plugin for IconTextList ---
const iconTextList = {
  ui: async (arg: any) => {
    // Minimal UI renderer for server-side Deno: displays simple text fallback.
    const { rootElement, schema, value } = arg;
    // Check if rootElement and ownerDocument are available (they won't be in Deno)
    if (
      rootElement &&
      typeof rootElement.ownerDocument !== "undefined" &&
      rootElement.ownerDocument
    ) {
      const container = rootElement.ownerDocument.createElement("div");
      container.style.width = "100%";
      container.style.height = "100%";
      container.style.overflow = "hidden";
      container.style.fontFamily = schema.fontName || "Helvetica";
      container.style.fontSize = `${schema.fontSize || 10}pt`;
      container.style.color = schema.fontColor || "#000000";
      if (Array.isArray(value)) {
        value.forEach((item: any) => {
          const p = rootElement.ownerDocument.createElement("p");
          p.textContent = `[ICON] ${item.text || ""}`;
          container.appendChild(p);
        });
      }
      rootElement.appendChild(container);
    } else {
      // Fallback for environments without DOM (like Deno server-side)
      // console.log("iconTextList UI rendering skipped in non-DOM environment.");
    }
  },
  pdf: async (arg: any) => {
    const { schema, value, pdfDoc, page } = arg;

    /* ------------------------------------------------------------------
     * 1) Values coming from the template are in millimetres (because the
     *    template declares the page as 210 × 297 mm).  pdf-lib works in
     *    points, origin bottom-left.  Therefore we convert the template
     *    mm values once and then draw everything in absolute page space.
     * ----------------------------------------------------------------*/
    const pageHeight = page.getHeight();
    const {
      position: { x: mmX, y: mmY } = { x: 0, y: 0 },
      width: mmWidth = 100,
      height: mmHeight = 100,
      fontName = "Inter-Regular",
      fontSize = 9,
      fontColor = "#2A2A2A",
      lineHeight = 1.4,
      iconWidth = 9,
      iconHeight = 9,
      iconTextSpacing = 3,
      itemSpacing = 3,
    } = schema;

    // convert block metrics to points
    const blockXpt = mm2pt(mmX);
    const blockYpt = mm2pt(mmY); // distance from page top
    const blockWidthPt = mm2pt(mmWidth);
    const blockHeightPt = mm2pt(mmHeight);

    const items = Array.isArray(value) ? value : [];

    /* ------------------------------------------------------------------
     * 2) Prepare font – same logic as before (kept unchanged).
     * ----------------------------------------------------------------*/
    const FONTS = arg.options?.font || {};
    let pdfFont = FONTS[fontName];
    if (pdfFont?.data instanceof Uint8Array) {
      pdfFont = await pdfDoc.embedFont(pdfFont.data, { subset: true });
    }
    if (!pdfFont) pdfFont = await pdfDoc.embedFont("Helvetica");

    const rgbColor = hexToRgb(fontColor);

    const fontHeight = pdfFont.heightAtSize(fontSize); // ascender+descender
    const ascent = pdfFont.ascentAtSize
      ? pdfFont.ascentAtSize(fontSize) // newer pdf-lib
      : fontHeight * 0.8; // fallback ≈80 %

    /* ------------------------------------------------------------------
     * 3) Walk through every item and draw using ABSOLUTE PAGE COORDS
     * ----------------------------------------------------------------*/
    let yOffsetPt = 0; // distance from top of block to current item start

    for (const item of items) {
      if (!item?.text) continue;

      // words per line ≈ widthOfTextAtSize / maxWidth
      const maxWidth = blockWidthPt - (iconWidth + iconTextSpacing);
      const textWidth = pdfFont.widthOfTextAtSize(item.text, fontSize);
      const lines = Math.ceil(textWidth / maxWidth);

      // TRUE text block height: first line = fontSize,
      // every following line adds fontSize*lineHeight
      const textHeight = lines * fontSize * lineHeight;

      // row height must cover either text or icon
      const rowHeight = Math.max(textHeight, iconHeight);

      if (yOffsetPt + rowHeight > blockHeightPt) break; // no more space

      // 1) master "row" top for this item (no fontSize subtraction)
      const rowTop = pageHeight - blockYpt - yOffsetPt - rowHeight;

      // 2) icon: put its TOP exactly at rowTop (experiment)
      const iconAbsX = blockXpt;
      const iconAbsY = rowTop; // icon now sits one full line higher

      // 3) text:
      const textAbsX = blockXpt + iconWidth + iconTextSpacing;
      const textBaselineY = rowTop - iconHeight * 0.8; // baseline further down so mis-alignment is obvious

      console.log(
        `iconTextList ► "${item.text.slice(0, 25)}…"  ` +
          `iconXY=(${iconAbsX.toFixed(1)},${iconAbsY.toFixed(1)}), ` +
          `textXY=(${textAbsX.toFixed(1)},${textBaselineY.toFixed(1)})`
      );

      // draw icon
      if (item.icon) {
        await page.drawSvg(item.icon, {
          x: iconAbsX,
          y: iconAbsY,
          width: iconWidth,
          height: iconHeight,
        });
      }

      // draw text
      await page.drawText(item.text, {
        x: textAbsX,
        y: textBaselineY,
        font: pdfFont,
        size: fontSize,
        color: rgb(rgbColor.red, rgbColor.green, rgbColor.blue),
        maxWidth: maxWidth,
        lineHeight: fontSize * lineHeight,
      });

      yOffsetPt += rowHeight + itemSpacing;
    }
  },
  propPanel: {
    schema: {
      fontName: {
        type: "string",
        title: "Font Name",
        default: "Inter-Regular",
      },
      fontSize: { type: "number", title: "Font Size", default: 9 },
      fontColor: {
        type: "string",
        title: "Font Color (hex)",
        default: "#2A2A2A",
      },
      lineHeight: {
        type: "number",
        title: "Line Height (multiplier)",
        default: 1.4,
      },
      iconWidth: { type: "number", title: "Icon Width (pt)", default: 9 },
      iconHeight: { type: "number", title: "Icon Height (pt)", default: 9 },
      iconTextSpacing: {
        type: "number",
        title: "Spacing Icon-Text (pt)",
        default: 3,
      },
      itemSpacing: {
        type: "number",
        title: "Spacing Between Items (pt)",
        default: 3,
      },
      iconColor: {
        type: "string",
        title: "Icon Color (hex)",
        default: "#2c5234",
      },
    },
    defaultSchema: {
      name: "iconTextListDefault", // Added name and made it unique
      type: "iconTextList",
      position: { x: 20, y: 20 }, // Sensible default position
      width: 150, // Sensible default width
      height: 100, // Sensible default height
      fontName: "Inter-Regular",
      fontSize: 9,
      fontColor: "#2A2A2A",
      lineHeight: 1.4,
      iconWidth: 9,
      iconHeight: 9,
      iconTextSpacing: 3,
      itemSpacing: 3,
      iconColor: "#2c5234",
    },
  },
};
// --- END Custom PDFME Plugin ---

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
const getShippingText = (
  codeOrUnits: string | null,
  productTitle?: string
): string => {
  const units = parseInt(codeOrUnits || "4");
  const match = (codeOrUnits || "").match(/(\d+)\s+(\w+)/);
  if (match && productTitle) {
    const qty = parseInt(match[1]);
    const label = match[2];
    const plural =
      qty === 1
        ? label
        : label === "box"
        ? "boxes"
        : label.endsWith("s")
        ? label
        : `${label}s`;
    return `The ${productTitle} is shipped securely mounted on a wooden pallet measuring 1200mm×1000mm. Up to ${qty} ${plural} can be shipped on a single pallet, and it is recommended to ship the full quantity per pallet to maximize value and efficiency.`;
  }

  if (!isNaN(units) && productTitle) {
    return `The ${productTitle} is shipped securely mounted on a wooden pallet measuring 1200mm×1000mm. Up to ${units} units can be shipped on a single pallet, and it is recommended to ship the full quantity per pallet to maximize value and efficiency.`;
  }

  // Fallback to existing code-based logic
  switch (codeOrUnits) {
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

const DEFAULT_PRODUCT_IMAGE_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

// --- Global diagnostics for uncaught errors (helps with "Uncaught null") ---
if (!(globalThis as any).__diagnosticsInstalled) {
  (globalThis as any).addEventListener(
    "unhandledrejection",
    (event: PromiseRejectionEvent) => {
      console.error("[unhandledrejection]", event.reason);
    }
  );
  (globalThis as any).addEventListener("error", (event: ErrorEvent) => {
    console.error("[error]", (event as any).error || event.message);
  });
  // flag so not added twice on hot-reload
  (globalThis as any).__diagnosticsInstalled = true;
}
// --- END diagnostics ---

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
    let appliedLogoBase64Data = DEFAULT_PRODUCT_IMAGE_BASE64;
    let irelandLogoBase64Data = DEFAULT_PRODUCT_IMAGE_BASE64;
    let pedLogoBase64Data = DEFAULT_PRODUCT_IMAGE_BASE64;
    let ceLogoBase64Data = DEFAULT_PRODUCT_IMAGE_BASE64;

    try {
      const templateFilePath = new URL(
        "../_shared/templates/datasheet-template.json",
        import.meta.url
      );
      const templateJsonString = await Deno.readTextFile(templateFilePath);
      template = JSON.parse(templateJsonString) as Template; // Keep simple cast
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

      /**
       * Dynamically move the warranty + shipping block so its bottom edge
       * always sits a small distance above the footer, regardless of how many
       * rows the specs table or key-features list renders.
       */
      try {
        // @ts-ignore – runtime template JSON isn't strongly typed
        const pageSchema = Array.isArray((template as any).schemas)
          ? (template as any).schemas[0]
          : undefined;

        if (pageSchema) {
          const byName = (n: string) =>
            pageSchema.find((x: any) => x.name === n);

          const shippingHeading = byName("shippingHeading");
          const shippingText = byName("shippingText");
          const warrantyTextNode = byName("warrantyText");
          const pedLogo = byName("pedLogo");
          const ceLogo = byName("ceLogo");
          const irelandLogo = byName("irelandLogo");

          const footerBg = (template as any).basePdf.staticSchema?.find(
            (x: any) => x.name === "footerBackground"
          );

          if (
            shippingHeading &&
            shippingText &&
            warrantyTextNode &&
            pedLogo &&
            ceLogo &&
            irelandLogo &&
            footerBg
          ) {
            const footerTop = footerBg.position.y; // ~283 mm

            const oWarranty =
              warrantyTextNode.position.y - shippingHeading.position.y;
            const oShipText =
              shippingText.position.y - shippingHeading.position.y;
            const oPed = pedLogo.position.y - shippingHeading.position.y;
            const oCe = ceLogo.position.y - shippingHeading.position.y;
            const oIe = irelandLogo.position.y - shippingHeading.position.y;

            const bottomRel = Math.max(
              oPed + (pedLogo.height || 0),
              oCe + (ceLogo.height || 0),
              oIe + (irelandLogo.height || 0)
            );

            const bottomPad = 3;
            const newShipY = footerTop - bottomPad - bottomRel;

            shippingHeading.position.y = newShipY;
            shippingText.position.y = newShipY + oShipText;
            warrantyTextNode.position.y = newShipY + oWarranty;
            pedLogo.position.y = newShipY + oPed;
            ceLogo.position.y = newShipY + oCe;
            irelandLogo.position.y = newShipY + oIe;
          }
        }
      } catch (e) {
        console.warn("Dynamic bottom-anchor adjustment failed", e);
      }

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
        console.error("Error loading Applied Main Logo:", e);
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
        console.error("Error loading Ireland Logo:", e);
      }

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
      console.log(
        "Fetched product data from DB:",
        /*productDataFromSource*/ "(data logged, omitted for brevity)"
      );
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
      console.log(
        "Using preview data directly:",
        /*productDataFromSource*/ "(data logged, omitted for brevity)"
      );
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

    const keyFeaturesRaw = productDataFromSource.key_features || "";
    const keyFeaturesArray = keyFeaturesRaw
      .split("\n")
      .map((f: string) => f.trim().replace(/\r$/, "").trim()) // Added more robust trimming for \r
      .filter((f: string) => f);

    const keyFeaturesForPdfme = keyFeaturesArray.map((featureText: string) => ({
      icon: CHECKMARK_SVG,
      text: featureText,
    }));

    let specsForTable: string[][] = [];
    try {
      const rawSpecs = productDataFromSource.tech_specs;
      const specs = Array.isArray(rawSpecs)
        ? rawSpecs
        : typeof rawSpecs === "string"
        ? JSON.parse(rawSpecs)
        : [];

      const MAX_ROWS = 5; // match template reserved height (≈45 mm)

      specsForTable = specs
        .filter((item: any) => item && (item.label || item.value))
        .slice(0, MAX_ROWS)
        .map((item: any) => [
          (item.label ?? "").toString(),
          (item.value ?? "").toString(),
        ]);
    } catch (specParseErr) {
      console.error("Failed to parse tech_specs JSON:", specParseErr);
    }

    if (specsForTable.length === 0) {
      specsForTable = [["Specification", "Value"]];
    }

    const logos = productDataFromSource.optional_logos || {};
    const displayPedLogo = logos.origin === true ? pedLogoBase64Data : "";
    const displayCeLogo = logos.ceMark === true ? ceLogoBase64Data : "";
    const displayIrelandLogo =
      logos.includeIrelandLogo === true ? irelandLogoBase64Data : "";

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
        keyFeaturesList: keyFeaturesForPdfme,
        productimage: productImageBase64,
        specificationsHeading: "Specifications",
        specificationsTable: specsForTable,
        warrantyText: getWarrantyText(productDataFromSource.warranty),
        shippingText: getShippingText(
          productDataFromSource.shipping_info,
          productDataFromSource.product_title
        ),
        shippingHeading: "Shipping Information",
        pedLogo: displayPedLogo,
        ceLogo: displayCeLogo,
        irelandLogo: displayIrelandLogo,
      },
    ];
    // console.log("PDFME Inputs prepared:", JSON.stringify(pdfInputs).substring(0, 500) + "..."); // Log snippet

    console.log("Generating PDF with pdfme...");
    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await generate({
        // Type for template is just Template, should be fine.
        template,
        inputs: pdfInputs,
        options: { font: fonts },
        plugins: {
          text,
          image,
          line,
          Table: table, // Ensure 'Table' matches type if casing matters.
          rectangle,
          iconTextList: iconTextList, // Register the new plugin
        },
      });
      console.log("PDF generated with pdfme (Size:", pdfBytes.length, "bytes)");
    } catch (error) {
      console.error("Error generating PDF (raw):", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : error !== null &&
            typeof error === "object" &&
            "message" in error &&
            typeof error.message === "string"
          ? error.message
          : error === null
          ? "Unknown error (null thrown)"
          : typeof error === "string"
          ? error
          : "An unknown error occurred during PDF generation.";
      console.error("Error generating PDF (processed message):", errorMessage);

      return new Response(JSON.stringify({ error: errorMessage }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
        status: 500,
      });
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
      ).replace(/[^a-zA-Z0-9_\-\.]/g, "_");
      const safeCode = (productDataFromSource.product_code || "code").replace(
        /[^a-zA-Z0-9_\-\.]/g,
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
      error?.stack
    );
    const errorMessage =
      error instanceof Error
        ? error.message
        : error !== null &&
          typeof error === "object" &&
          "message" in error &&
          typeof (error as any).message === "string"
        ? (error as any).message
        : error === null
        ? "Unknown error (null thrown)"
        : typeof error === "string"
        ? error
        : "An unknown error occurred during PDF generation.";

    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
