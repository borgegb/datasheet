import { promises as fs } from "node:fs";
import path from "node:path";
import { generate } from "@pdfme/generator";
import { text, image, line, table, rectangle } from "@pdfme/schemas";
import type { Template, Font } from "@pdfme/common";

// Helpers from the same directory (lib/pdf/helpers.ts)
import {
  hexToRgb,
  mm2pt,
  iconTextList,
  CHECKMARK_SVG,
  getWarrantyText,
  getShippingText,
  DEFAULT_PRODUCT_IMAGE_BASE64,
  anchorShippingGroupToFooter,
} from "./helpers";

// @ts-nocheck

interface BuildPdfInput {
  productDataFromSource: any; // The fully resolved product data object
  productImageBase64: string;
  appliedLogoBase64Data: string;
  irelandLogoBase64Data: string;
  pedLogoBase64Data: string;
  ceLogoBase64Data: string;
  // Add any other dynamic data that needs to be passed from the route handler
}

export async function buildPdf(input: BuildPdfInput): Promise<Buffer> {
  console.log("--- buildPdf function entered (lib/pdf/buildPdf.ts) ---");

  const {
    productDataFromSource,
    productImageBase64,
    appliedLogoBase64Data,
    irelandLogoBase64Data,
    pedLogoBase64Data,
    ceLogoBase64Data,
  } = input;

  // 1. Load template JSON and fonts from the filesystem (relative to project root, in `pdf/` directory)
  // Choose template based on image orientation
  const isLandscape = productDataFromSource.image_orientation === "landscape";
  const templateFileName = isLandscape
    ? "datasheet-template-landscape.json"
    : "datasheet-template.json";
  const templatePath = path.resolve(
    process.cwd(),
    `pdf/template/${templateFileName}`
  );

  console.log(
    `Loading ${isLandscape ? "landscape" : "portrait"} template from:`,
    templatePath
  );
  const fontDir = path.resolve(process.cwd(), "pdf/fonts");

  let template: Template;
  let fonts: Font = {};

  try {
    template = JSON.parse(await fs.readFile(templatePath, "utf8"));
    anchorShippingGroupToFooter(template);
    console.log("PDFME template loaded from:", templatePath);

    const poppinsBoldPath = path.join(fontDir, "Poppins-Bold.ttf");
    const interRegularPath = path.join(fontDir, "Inter-Regular.ttf");
    const interBoldPath = path.join(fontDir, "Inter-Bold.ttf");

    const [poppinsBoldFontBytes, interRegularFontBytes, interBoldFontBytes] =
      await Promise.all([
        fs.readFile(poppinsBoldPath),
        fs.readFile(interRegularPath),
        fs.readFile(interBoldPath),
      ]);

    fonts = {
      "Poppins-Bold": { data: poppinsBoldFontBytes, subset: true },
      "Inter-Regular": {
        data: interRegularFontBytes,
        subset: true,
        fallback: true,
      },
      "Inter-Bold": { data: interBoldFontBytes, subset: true },
    };
    console.log("Custom fonts loaded from:", fontDir);
  } catch (loadError: any) {
    console.error(
      "Error loading template or fonts for PDFME in buildPdf:",
      loadError
    );
    throw new Error(
      `Failed to load PDF static resources: ${loadError.message}`
    );
  }

  // 2. Prepare inputs for PDFME (using data passed into this function)
  const keyFeaturesRaw = productDataFromSource.key_features || "";
  const keyFeaturesArray = keyFeaturesRaw
    .split("\n")
    .map((f: string) => f.trim().replace(/\r$/, "").trim())
    .filter((f: string) => f);
  const keyFeaturesForPdfme = keyFeaturesArray.map((featureText: string) => ({
    icon: CHECKMARK_SVG, // From helpers.ts
    text: featureText,
  }));

  let specsForTable: string[][] = [];
  try {
    const rawSpecs = productDataFromSource.tech_specs;
    if (rawSpecs) {
      const parsedSpecs =
        typeof rawSpecs === "string" ? JSON.parse(rawSpecs) : rawSpecs;
      if (Array.isArray(parsedSpecs)) {
        const filtered = parsedSpecs.filter(
          (item: any) => item && (item.label || item.value)
        );

        // Each table row is ~8-9 mm tall in this template, and the reserved box
        // in the schema is 45 mm high → max ≈ 5 rows.  Clip to first 5 so we
        // never overflow into the Shipping area.
        const MAX_ROWS = 5;

        specsForTable = filtered
          .slice(0, MAX_ROWS)
          .map((item: any) => [
            (item.label ?? "").toString(),
            (item.value ?? "").toString(),
          ]);
      }
    }
  } catch (specParseErr: any) {
    console.error(
      "Failed to parse tech_specs JSON in buildPdf:",
      specParseErr.message
    );
    // Do not throw, allow PDF to generate with default/empty specs
  }
  if (specsForTable.length === 0) specsForTable = [["Specification", "Value"]];

  const logos = productDataFromSource.optional_logos || {};
  const displayPedLogo = logos.origin === true ? pedLogoBase64Data : "";
  const displayCeLogo = logos.ceMark === true ? ceLogoBase64Data : "";
  const displayIrelandLogo =
    logos.includeIrelandLogo === true ? irelandLogoBase64Data : "";

  const pdfInputs = [
    {
      appliedLogo: appliedLogoBase64Data, // Passed in
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
      keyFeaturesHeading: "Key Features", // This could be part of the template schema if static
      keyFeaturesList: keyFeaturesForPdfme,
      productimage: productImageBase64, // Passed in
      specificationsHeading: "Specifications", // Also could be static in template
      specificationsTable: specsForTable,
      warrantyText: getWarrantyText(productDataFromSource.warranty), // From helpers.ts
      shippingText: getShippingText(
        productDataFromSource.shipping_info,
        productDataFromSource.product_title
      ), // From helpers.ts
      shippingHeading: "Shipping Information", // Also could be static in template
      pedLogo: displayPedLogo,
      ceLogo: displayCeLogo,
      irelandLogo: displayIrelandLogo,
    },
  ];

  // 3. Generate the PDF – identical call signature as before
  console.log("Generating PDF with pdfme (buildPdf)...");
  try {
    const pdfBytes = await generate({
      template,
      inputs: pdfInputs,
      options: { font: fonts },
      plugins: { text, image, line, Table: table, rectangle, iconTextList }, // iconTextList from helpers.ts
    });
    console.log(
      "PDF generated with pdfme in buildPdf (Size:",
      pdfBytes.length,
      "bytes)"
    );
    return Buffer.from(pdfBytes); // Vercel upload expects Buffer | Uint8Array
  } catch (genError: any) {
    console.error("Error generating PDF with pdfme in buildPdf:", genError);
    throw new Error(`PDF generation failed: ${genError.message}`);
  }
}
