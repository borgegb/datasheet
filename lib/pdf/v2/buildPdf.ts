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

  let fontMap: any = {};
  let fallbackName = "";

  const specsTableNode = (template as any).schemas?.[0]?.find(
    (n: any) => n.name === "specificationsTable"
  );
  if (specsTableNode) {
    // ---- Embed and apply built-in fallback font BEFORE height calculation ----
    const builtIn = getDefaultFont();
    fallbackName = Object.keys(builtIn)[0];
    const data = builtIn[fallbackName].data;

    console.log("🔤 Built-in font name:", fallbackName);
    console.log(
      "🔤 Font data size:",
      data instanceof Uint8Array ? data.length : "not Uint8Array"
    );

    specsTableNode.headStyles.fontName = fallbackName;
    specsTableNode.bodyStyles.fontName = fallbackName;

    console.log("font chosen head =", specsTableNode.headStyles.fontName);
    console.log("font chosen body =", specsTableNode.bodyStyles.fontName);
    console.log("colWidths before calc =", [
      specsTableNode.columnStyles?.["0"]?.cellWidth,
      specsTableNode.columnStyles?.["1"]?.cellWidth,
    ]);

    // ---- build fontMap first (before height calculation) ----
    fontMap = {
      [fallbackName]: builtIn[fallbackName],
      "Poppins-Bold": { data, fallback: false },
      "Poppins-Regular": { data, fallback: false },
      "Inter-Bold": { data, fallback: false },
      "Inter-Regular": { data, fallback: false },
    };
    console.log(
      "🚀 FONT MAP BUILT BEFORE HEIGHT CALC - should fix step-ladder effect"
    );
    console.log("🗂️ Font map keys:", Object.keys(fontMap));

    try {
      const dynamicHeights = await getDynamicHeightsForTable(
        JSON.stringify(truncatedTable),
        {
          schema: specsTableNode as any,
          basePdf: template.basePdf as any,
          options: { font: fontMap },
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
  // no fs needed now

  const pdfBytes = await generate({
    template,
    inputs: pdfInputs,
    options: { font: fontMap },
    plugins: { text, image, line, rectangle, Table: table },
  });

  return pdfBytes;
}
