import { rgb } from "pdf-lib"; // rgb is used by iconTextList
import type { Plugin } from "@pdfme/common"; // For iconTextList type

// --- SVG Checkmark Definition ---
export const CHECKMARK_SVG =
  '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="8" fill="#2c5234"/><path d="M11.97 5.97a.75.75 0 0 0-1.06-1.06L7.25 8.56 5.53 6.84a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.06 0l4.19-4.18z" fill="#ffffff"/></svg>';

// --- Helper function to convert hex color to pdf-lib RGB format ---
export const hexToRgb = (
  hex: string
): { red: number; green: number; blue: number } => {
  if (!hex || typeof hex !== "string") return { red: 0, green: 0, blue: 0 };
  hex = hex.replace(/^#/, "");
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  if (hex.length !== 6) {
    return { red: 0, green: 0, blue: 0 }; // Default to black
  }
  const bigint = parseInt(hex, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return { red: r / 255, green: g / 255, blue: b / 255 };
};

// --- Helper: mm → pt (1 mm = 72 / 25.4 pt) ---
export const mm2pt = (mm: number): number => mm * 2.83464567;

// --- Custom PDFME Plugin for IconTextList ---
export const iconTextList: Plugin<any> = {
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
    } else {
      // console.log("iconTextList UI rendering skipped in non-DOM environment.");
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
      iconWidth = 9,
      iconHeight = 9,
      iconTextSpacing = 3,
      itemSpacing = 3,
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
      const maxWidth = blockWidthPt - (iconWidth + iconTextSpacing);
      const textWidth = pdfFont.widthOfTextAtSize(item.text, fontSize);
      const lines = Math.ceil(textWidth / maxWidth);
      const textHeight = lines * fontSize * lineHeight;
      const rowHeight = Math.max(textHeight, iconHeight);

      if (yOffsetPt + rowHeight > blockHeightPt) break;

      const rowTop = pageHeight - blockYpt - yOffsetPt;
      const iconAbsX = blockXpt;
      const iconAbsY = rowTop;
      const textAbsX = blockXpt + iconWidth + iconTextSpacing;
      const textBaselineY = rowTop - iconHeight * 0.8;

      if (item.icon) {
        await page.drawSvg(item.icon, {
          x: iconAbsX,
          y: iconAbsY,
          width: iconWidth,
          height: iconHeight,
        });
      }
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
      name: "defaultIconTextListInstance",
      type: "iconTextList",
      position: { x: 20, y: 20 },
      width: 150,
      height: 100,
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

// --- Helper function for Warranty Text ---
export const getWarrantyText = (code: string | null): string => {
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

// --- Helper function for Shipping Text ---
export const getShippingText = (
  codeOrUnits: string | null,
  productTitle?: string
): string => {
  // Check if it's a number (our units)
  const units = parseInt(codeOrUnits || "4");
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

export const DEFAULT_PRODUCT_IMAGE_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
