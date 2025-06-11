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
import type { Template } from "@pdfme/common";
import { readFileSync } from "fs";
import { resolve } from "path";

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
  // ---- Load template (bundled via webpack import) ----
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const template: Template = (
    await import("../../../pdf/template/v2/datasheet-template.json")
  ).default;

  // ---- Dynamically resize the Specs table so it never bleeds into the blocks underneath ----
  // DEBUG: log raw specifications table input
  console.log("rawTable", JSON.stringify(input.specificationsTable));

  const truncatedTable = input.specificationsTable.map((row) =>
    row.map((cell) => {
      const clean = String(cell ?? "")
        .replace(/\r?\n|\r/g, " ")
        .trim();
      const maxLen = 20;
      return clean.length > maxLen ? `${clean.slice(0, maxLen - 1)}…` : clean;
    })
  );

  // DEBUG: log cleaned/truncated table
  console.log("cleanTable", JSON.stringify(truncatedTable));

  const specsTableNode = (template as any).schemas?.[0]?.find(
    (n: any) => n.name === "specificationsTable"
  );
  if (specsTableNode) {
    // Force a core font with real ASCII widths
    specsTableNode.headStyles.fontName = "Helvetica";
    specsTableNode.bodyStyles.fontName = "Helvetica";

    // Ensure each column has a fixed width BEFORE height calculation
    const halfWidth = (specsTableNode.width ?? 175) / 2;
    specsTableNode.columnStyles = specsTableNode.columnStyles || {};
    specsTableNode.columnStyles["0"] = {
      ...(specsTableNode.columnStyles["0"] || {}),
      cellWidth: halfWidth,
      alignment: "left",
    };
    specsTableNode.columnStyles["1"] = {
      ...(specsTableNode.columnStyles["1"] || {}),
      cellWidth: halfWidth,
      alignment: "left",
    };

    console.log("font chosen head =", specsTableNode.headStyles.fontName);
    console.log("font chosen body =", specsTableNode.bodyStyles.fontName);
    console.log("colWidths before calc =", [
      specsTableNode.columnStyles?.["0"]?.cellWidth,
      specsTableNode.columnStyles?.["1"]?.cellWidth,
    ]);

    try {
      const dynamicHeights = await getDynamicHeightsForTable(
        JSON.stringify(truncatedTable),
        {
          schema: specsTableNode as any,
          basePdf: template.basePdf as any,
          options: {},
          _cache: new Map(),
        }
      );
      const accurateHeightMm = dynamicHeights.reduce((sum, h) => sum + h, 0);
      specsTableNode.height = accurateHeightMm;

      console.log("rowHeights", dynamicHeights);
    } catch (_) {}
  }

  // ---- Build minimal inputs (header, intro, image) ----
  const pdfInputs = [
    {
      appliedLogo: input.appliedLogoBase64Data,
      productTitle: input.productTitle,
      productSubtitle: input.productSubtitle,
      introParagraph: input.introParagraph,

      productimage: input.productImageBase64 || "",

      // Fill new footer-related fields
      warrantyText: input.warrantyText,
      shippingHeading: input.shippingHeading,
      shippingText: input.shippingText,
      pedLogo: input.pedLogo || "",
      ceLogo: input.ceLogo || "",
      irelandLogo: input.irelandLogo || "",

      // Placeholders for yet-to-be-added blocks
      keyFeaturesHeading: "",
      keyFeaturesList: [],
      specificationsTable: truncatedTable,
      specificationsHeading: "",
    },
  ];

  // --- read pre-encoded Inter-Regular.b64 and convert to Uint8Array ---
  const b64 = readFileSync(
    resolve(process.cwd(), "pdf/fonts/Inter-Regular.b64"),
    "utf8"
  );
  const interData = Uint8Array.from(Buffer.from(b64, "base64"));

  // one real font for all names
  const fontMap = {
    "Inter-Regular": { data: interData, fallback: true },
    "Inter-Bold": { data: interData, fallback: false },
    "Poppins-Bold": { data: interData, fallback: false },
  };

  const pdfBytes = await generate({
    template,
    inputs: pdfInputs,
    options: { font: fontMap },
    plugins: { text, image, line, rectangle, Table: table },
  });

  return pdfBytes;
}
