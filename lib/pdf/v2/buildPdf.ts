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

        // Truncate if needed - shorter to ensure single line
        const maxLength = 30;
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
      // Ensure compact styling for uniform small rows
      tableSchema.bodyStyles.fontSize = 7; // Even smaller font
      tableSchema.bodyStyles.lineHeight = 0.9; // Tighter line height
      tableSchema.bodyStyles.padding = {
        top: 0.5,
        right: 1,
        bottom: 0.5,
        left: 1,
      };
      // Try different height properties
      tableSchema.bodyStyles.height = 5; // Fixed height
      tableSchema.bodyStyles.cellHeight = 5; // Alternative property
      tableSchema.bodyStyles.rowHeight = 5; // Another alternative
    }

    // Update column styles - handle the legacy format
    if (tableSchema.columnStyles && tableSchema.columnStyles.fontName) {
      // First column uses Inter-Bold, but with default font
      tableSchema.columnStyles.fontName["0"] = defaultFontName;
    }

    // Update column padding to be more compact
    if (tableSchema.columnStyles && tableSchema.columnStyles.padding) {
      tableSchema.columnStyles.padding["0"] = {
        top: 0.5,
        bottom: 0.5,
        left: 1,
        right: 1,
      };
      tableSchema.columnStyles.padding["1"] = {
        top: 0.5,
        bottom: 0.5,
        left: 1,
        right: 1,
      };
    }

    // Try to override the table's internal height calculation mechanism
    tableSchema.autoHeight = false; // Disable auto height calculation
    tableSchema.dynamicHeight = false; // Disable dynamic height
    tableSchema.fixedRowHeight = 5; // Set fixed row height

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

      // FORCE uniform row heights by overriding pdfme's calculation
      const UNIFORM_ROW_HEIGHT = 5; // 5mm per row
      const uniformHeights = dynamicHeights.map((height, index) => {
        if (index === 0) return 0; // Keep header at 0 (showHead is false)
        return UNIFORM_ROW_HEIGHT;
      });

      console.log("🎯 Forced uniform heights:", uniformHeights);

      // Override the table height calculation
      const totalUniformHeight = uniformHeights.reduce(
        (sum: number, h: number) => sum + h,
        0
      );
      tableSchema.height = Math.min(totalUniformHeight, 45); // Don't exceed template limit

      // Try to force pdfme to use our uniform heights by setting row-specific properties
      tableSchema.rowHeights = uniformHeights; // Custom property
      tableSchema.fixedRowHeights = uniformHeights; // Alternative property
      tableSchema.uniformRowHeight = UNIFORM_ROW_HEIGHT; // Single value property

      // Also try setting it in bodyStyles
      tableSchema.bodyStyles.fixedHeight = UNIFORM_ROW_HEIGHT;
      tableSchema.bodyStyles.uniformHeight = UNIFORM_ROW_HEIGHT;

      console.log("🎯 Final table height:", tableSchema.height);
      console.log("🎯 Applied uniform row height properties");
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
