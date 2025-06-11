import { generate } from "@pdfme/generator";
import { text, image, line, rectangle, table } from "@pdfme/schemas";
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

  // Process table data - clean and truncate
  const processedTable = input.specificationsTable.map((row) =>
    row.map((cell) => {
      // Clean up the cell content
      const cleaned = String(cell ?? "")
        .replace(/\r?\n|\r/g, " ")
        .trim();

      // Truncate if needed
      const maxLength = 50; // Increased from 20 to allow more text
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
      // Set reasonable line height and padding
      tableSchema.bodyStyles.lineHeight = 1.2;
      tableSchema.bodyStyles.padding = {
        top: 2,
        right: 3,
        bottom: 2,
        left: 3,
      };
    }

    // Update column styles
    if (tableSchema.columnStyles) {
      Object.keys(tableSchema.columnStyles).forEach((key) => {
        tableSchema.columnStyles[key].fontName = defaultFontName;
      });
    }

    // Calculate table height based on content
    // Base height per row (considering padding and font size)
    const fontSize = tableSchema.bodyStyles?.fontSize || 9;
    const paddingTop = tableSchema.bodyStyles?.padding?.top || 2;
    const paddingBottom = tableSchema.bodyStyles?.padding?.bottom || 2;
    const lineHeight = tableSchema.bodyStyles?.lineHeight || 1.2;

    // Calculate row height: fontSize * lineHeight + padding
    const rowHeight =
      fontSize * lineHeight * 0.3527 + paddingTop + paddingBottom; // 0.3527 converts pt to mm
    const totalRows = processedTable.length;
    const calculatedHeight = Math.ceil(totalRows * rowHeight);

    // Set a reasonable height
    tableSchema.height = Math.max(calculatedHeight, 30); // Minimum 30mm

    console.log("Table configuration:", {
      fontName: defaultFontName,
      fontSize,
      rowHeight,
      totalRows,
      calculatedHeight: tableSchema.height,
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
