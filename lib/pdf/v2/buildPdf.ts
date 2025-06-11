import { generate } from "@pdfme/generator";
import {
  text,
  image,
  line,
  rectangle,
  table,
  getDynamicHeightsForTable,
} from "@pdfme/schemas";
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

  // --- Dynamically resize the Specs table so it never bleeds into the blocks underneath ----
  const specsTableNode = (template as any).schemas?.[0]?.find(
    (n: any) => n.name === "specificationsTable"
  );
  if (specsTableNode) {
    try {
      const dynamicHeights = await getDynamicHeightsForTable(
        JSON.stringify(input.specificationsTable),
        {
          // cast since templates aren't strongly typed here
          schema: specsTableNode as any,
          basePdf: template.basePdf as any,
          options: {},
          _cache: new Map(),
        }
      );
      const accurateHeightMm = dynamicHeights.reduce((sum, h) => sum + h, 0);
      specsTableNode.height = accurateHeightMm;
    } catch (_) {
      // fallback: stick with original height if calc fails
    }
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
      specificationsTable: input.specificationsTable,
      specificationsHeading: "",
    },
  ];

  const pdfBytes = await generate({
    template,
    inputs: pdfInputs,
    plugins: { text, image, line, rectangle, Table: table },
  });

  return pdfBytes;
}
