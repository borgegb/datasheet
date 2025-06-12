import { generate } from "@pdfme/generator";
import { text, image, line, rectangle, table } from "@pdfme/schemas";
import { getDefaultFont } from "@pdfme/common";
import type { Template, Font, Plugin } from "@pdfme/common";

// --- SVG Checkmark Definition ---
const CHECKMARK_SVG =
  '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="8" fill="#2c5234"/><path d="M11.97 5.97a.75.75 0 0 0-1.06-1.06L7.25 8.56 5.53 6.84a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.06 0l4.19-4.18z" fill="#ffffff"/></svg>';

// --- Helper function to convert hex color to RGB ---
const hexToRgb = (
  hex: string
): { red: number; green: number; blue: number } => {
  if (!hex || typeof hex !== "string") return { red: 0, green: 0, blue: 0 };
  hex = hex.replace(/^#/, "");
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  if (hex.length !== 6) {
    return { red: 0, green: 0, blue: 0 };
  }
  const bigint = parseInt(hex, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return { red: r / 255, green: g / 255, blue: b / 255 };
};

// --- Helper: mm → pt (1 mm = 72 / 25.4 pt) ---
const mm2pt = (mm: number): number => mm * 2.83464567;

// --- Fixed text wrapping function ---
const wrap = (
  text: string,
  font: any,
  fontSize: number,
  maxWidth: number
): string[] => {
  const words = text.split(/\s+/); // Fixed: single backslash
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, fontSize) <= maxWidth) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
};

// --- Custom PDFME Plugin for IconTextList with fixes ---
const iconTextList: Plugin<any> = {
  ui: async (arg: any) => {
    const { rootElement, schema, value } = arg;
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
    }
  },
  pdf: async (arg: any) => {
    const { schema, value, pdfDoc, page } = arg;
    const pageHeight = page.getHeight();
    const {
      position: { x: mmX, y: mmY } = { x: 0, y: 0 },
      width: mmWidth = 100,
      height: mmHeight = 100,
      fontName = "Inter-Regular",
      fontSize = 9,
      fontColor = "#2A2A2A",
      lineHeight = 1.4,
      iconWidth = 3.5,
      iconHeight = 3.5,
      iconTextSpacing = 2,
      itemSpacing = 2,
    } = schema;

    const blockXpt = mm2pt(mmX);
    const blockYpt = mm2pt(mmY);
    const blockWidthPt = mm2pt(mmWidth);
    const blockHeightPt = mm2pt(mmHeight);

    const items = Array.isArray(value) ? value : [];
    const FONTS = arg.options?.font || {};
    let pdfFont = FONTS[fontName];
    if (pdfFont?.data instanceof Uint8Array) {
      pdfFont = await pdfDoc.embedFont(pdfFont.data, { subset: true });
    }
    if (!pdfFont) pdfFont = await pdfDoc.embedFont("Helvetica");

    const rgbColor = hexToRgb(fontColor);
    let yOffsetPt = 0;

    for (const item of items) {
      if (!item?.text) continue;
      const maxWidth =
        blockWidthPt - (mm2pt(iconWidth) + mm2pt(iconTextSpacing));

      const linesArr = wrap(item.text, pdfFont, fontSize, maxWidth);
      const textHeight = linesArr.length * fontSize * lineHeight;
      const rowHeight = Math.max(textHeight, mm2pt(iconHeight));

      if (yOffsetPt + rowHeight > blockHeightPt) {
        // Truncate if we run out of space
        if (linesArr.length > 0) {
          const lastLine = linesArr[linesArr.length - 1];
          linesArr[linesArr.length - 1] = lastLine.replace(/\s*\S+$/, " …");
        }
        break;
      }

      // Calculate positions - improved baseline calculation
      const rowTop = pageHeight - blockYpt - yOffsetPt;
      const iconAbsX = blockXpt;
      const iconAbsY = rowTop - mm2pt(iconHeight);
      const textAbsX = blockXpt + mm2pt(iconWidth) + mm2pt(iconTextSpacing);
      const textBaselineY = rowTop - fontSize; // Align to first line baseline

      // Draw icon
      if (item.icon) {
        await page.drawSvg(item.icon, {
          x: iconAbsX,
          y: iconAbsY,
          width: mm2pt(iconWidth),
          height: mm2pt(iconHeight),
        });
      }

      // Draw text with proper line spacing
      for (let i = 0; i < linesArr.length; i++) {
        const lineY = textBaselineY - i * fontSize * lineHeight;
        await page.drawText(linesArr[i], {
          x: textAbsX,
          y: lineY,
          font: pdfFont,
          size: fontSize,
          color: {
            type: "RGB",
            red: rgbColor.red,
            green: rgbColor.green,
            blue: rgbColor.blue,
          },
        });
      }

      yOffsetPt += rowHeight + mm2pt(itemSpacing);
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
      iconWidth: { type: "number", title: "Icon Width (mm)", default: 3.5 },
      iconHeight: { type: "number", title: "Icon Height (mm)", default: 3.5 },
      iconTextSpacing: {
        type: "number",
        title: "Spacing Icon-Text (mm)",
        default: 2,
      },
      itemSpacing: {
        type: "number",
        title: "Spacing Between Items (mm)",
        default: 2,
      },
    },
    defaultSchema: {
      name: "defaultIconTextListInstance",
      type: "iconTextList",
      position: { x: 20, y: 20 },
      width: 150,
      height: 100,
      fontName: "Inter-Regular",
      fontSize: 9,
      fontColor: "#2A2A2A",
      lineHeight: 1.4,
      iconWidth: 3.5,
      iconHeight: 3.5,
      iconTextSpacing: 2,
      itemSpacing: 2,
    },
  },
};

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
  specificationsTable: string[][]; // two-column body rows
  keyFeaturesList?: Array<{ icon: string; text: string }>; // Add key features
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

  // Update all other text elements to use the default font
  const schemas = template.schemas[0];
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

  // Prepare inputs – table passes straight through without trimming
  const processedTable = input.specificationsTable;

  // Prepare inputs
  const inputs = [
    {
      // Dynamic schema inputs
      appliedLogo: input.appliedLogoBase64Data,
      productTitle: input.productTitle,
      productSubtitle: input.productSubtitle,
      introParagraph: input.introParagraph,
      productimage: input.productImageBase64 || "",
      specificationsTable: processedTable,
      keyFeaturesList: input.keyFeaturesList || [],

      // Static schema placeholder inputs (for placeholder replacement)
      warrantyText: input.warrantyText,
      shippingText: input.shippingText,
      pedLogo: input.pedLogo || "",
      ceLogo: input.ceLogo || "",
      irelandLogo: input.irelandLogo || "",
    },
  ];

  console.log("Font map keys:", Object.keys(fontMap));

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
      iconTextList,
    },
  });

  return pdfBytes;
}
