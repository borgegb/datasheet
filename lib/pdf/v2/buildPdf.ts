import { generate } from "@pdfme/generator";
import {
  text,
  image,
  line,
  rectangle,
  table,
  getDynamicHeightsForTable,
} from "@pdfme/schemas";
import { getDefaultFont } from "@pdfme/common";
import type { Template, Font } from "@pdfme/common";

interface BuildPdfInput {
  appliedLogoBase64Data: string;
  productTitle: string;
  productSubtitle: string;
  introParagraph: string;
  productImageBase64?: string;
  warrantyText: string;
  shippingHeading: string;
  shippingText: string;
  pedLogo?: string;
  ceLogo?: string;
  irelandLogo?: string;
  specificationsTable: string[][];
}

export async function buildPdfV2(input: BuildPdfInput): Promise<Uint8Array> {
  // Load template
  const templateData = (
    await import("../../../pdf/template/v2/datasheet-template.json")
  ).default;

  // Fix padding type
  const template: Template = {
    ...templateData,
    basePdf: {
      ...templateData.basePdf,
      padding: templateData.basePdf.padding as [number, number, number, number],
    },
  } as Template;

  // Process table data - clean and limit rows
  const MAX_ROWS = 8; // Maximum rows that fit in 45mm with ~5.5mm per row
  const processedTable = input.specificationsTable
    .slice(0, MAX_ROWS)
    .map((row) =>
      row.map((cell) => {
        // Clean up the cell content
        const cleaned = String(cell ?? "")
          .replace(/\r?\n|\r/g, " ")
          .trim();

        // Truncate to prevent wrapping in wider columns
        const maxLength = 25; // Increased for wider columns
        if (cleaned.length > maxLength) {
          return cleaned.substring(0, maxLength - 1) + "…";
        }
        return cleaned;
      })
    );

  // Set up fonts - use the default font for everything
  const defaultFonts = getDefaultFont();
  const defaultFontName = Object.keys(defaultFonts)[0];
  const fontData = defaultFonts[defaultFontName].data;

  // Create font map with proper structure
  const fontMap: Font = {
    [defaultFontName]: {
      data: fontData,
      fallback: true,
    },
  };

  // Find and update the specifications table in the template
  const schemas = template.schemas[0];
  const tableSchema: any = schemas.find(
    (s: any) => s.name === "specificationsTable"
  );

  if (tableSchema) {
    // Update all font references to use the default font
    tableSchema.fontName = defaultFontName;

    if (tableSchema.headStyles) {
      tableSchema.headStyles.fontName = defaultFontName;
    }

    if (tableSchema.bodyStyles) {
      tableSchema.bodyStyles.fontName = defaultFontName;
      // Don't override template styling - let template control font size and padding
    }

    // No other style overrides – let the template control column styling

    // Remove all height overrides - let pdfme calculate naturally
    // tableSchema.autoHeight = false;
    // tableSchema.dynamicHeight = false;
    // tableSchema.fixedRowHeight = 5;

    // Log actual row heights to debug the issue
    try {
      const dynamicHeights = await getDynamicHeightsForTable(
        JSON.stringify(processedTable),
        {
          schema: tableSchema as any,
          basePdf: template.basePdf as any,
          options: { font: fontMap },
          _cache: new Map(),
        }
      );
      console.log("🔍 Actual row heights (before override):", dynamicHeights);
      console.log("🔍 Row height variance:", {
        min: Math.min(...dynamicHeights.slice(1)), // Skip header
        max: Math.max(...dynamicHeights.slice(1)),
        avg:
          dynamicHeights.slice(1).reduce((a, b) => a + b, 0) /
          (dynamicHeights.length - 1),
      });

      const actualTotalHeight = dynamicHeights.reduce((sum, h) => sum + h, 0);
      console.log("🔍 Actual total height from pdfme:", actualTotalHeight);

      // Let pdfme calculate the height naturally with our compact styling
      const naturalTotalHeight = dynamicHeights.reduce((sum, h) => sum + h, 0);

      console.log("🎯 Natural calculated height:", naturalTotalHeight);
      console.log("🎯 Using natural height calculation - no overrides");
      console.log("🎯 Table position:", {
        x: tableSchema.position.x,
        y: tableSchema.position.y,
      });
      console.log("🎯 Table dimensions:", {
        width: tableSchema.width,
        height: tableSchema.height,
      });
    } catch (err) {
      console.error("Error getting dynamic heights:", err);
    }

    // Keep the fixed height from template (45mm) - this prevents overflow
    // The table will be clipped if content exceeds this height
    console.log("Table configuration:", {
      fontName: defaultFontName,
      fontSize: tableSchema.bodyStyles?.fontSize || 8,
      fixedHeight: tableSchema.height,
      totalRows: processedTable.length,
      maxRows: MAX_ROWS,
    });
  }

  // Update all other text elements to use the default font
  schemas.forEach((schema: any) => {
    if (schema.type === "text" && schema.fontName) {
      // Keep the schema's font name but ensure it's in our font map
      if (!fontMap[schema.fontName]) {
        fontMap[schema.fontName] = {
          data: fontData,
          fallback: false,
        };
      }
    }
  });

  // Also check static schemas
  if (
    typeof template.basePdf === "object" &&
    "staticSchema" in template.basePdf &&
    template.basePdf.staticSchema
  ) {
    template.basePdf.staticSchema.forEach((schema: any) => {
      if (schema.type === "text" && schema.fontName) {
        if (!fontMap[schema.fontName]) {
          fontMap[schema.fontName] = {
            data: fontData,
            fallback: false,
          };
        }
      }
    });
  }

  // Prepare inputs
  const inputs = [
    {
      appliedLogo: input.appliedLogoBase64Data,
      productTitle: input.productTitle,
      productSubtitle: input.productSubtitle,
      introParagraph: input.introParagraph,
      productimage: input.productImageBase64 || "",
      warrantyText: input.warrantyText,
      shippingHeading: input.shippingHeading,
      shippingText: input.shippingText,
      pedLogo: input.pedLogo || "",
      ceLogo: input.ceLogo || "",
      irelandLogo: input.irelandLogo || "",
      keyFeaturesHeading: "",
      keyFeaturesList: [],
      specificationsTable: processedTable,
      specificationsHeading: "",
    },
  ];

  console.log("Font map keys:", Object.keys(fontMap));
  console.log("Table data rows:", processedTable.length);

  // Generate PDF
  const pdfBytes = await generate({
    template,
    inputs,
    options: { font: fontMap },
    plugins: {
      text,
      image,
      line,
      rectangle,
      Table: table,
    },
  });

  return pdfBytes;
}
