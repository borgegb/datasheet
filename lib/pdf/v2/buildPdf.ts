import { generate } from "@pdfme/generator";
import { text, image, line, rectangle, table } from "@pdfme/schemas";
import type { Template } from "@pdfme/common";

interface BuildPdfInput {
  appliedLogoBase64Data: string;
  productTitle: string;
  productSubtitle: string;
  introParagraph: string;
  productImageBase64?: string;
}

export async function buildPdfV2(input: BuildPdfInput): Promise<Uint8Array> {
  // ---- Load template (bundled via webpack import) ----
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const template: Template = (
    await import("../../../pdf/template/v2/datasheet-template.json")
  ).default;

  // ---- Build minimal inputs (header, intro, image) ----
  const pdfInputs = [
    {
      appliedLogo: input.appliedLogoBase64Data,
      productTitle: input.productTitle,
      productSubtitle: input.productSubtitle,
      introParagraph: input.introParagraph,

      productimage: input.productImageBase64 || "",

      // Empty placeholders for remaining schema names so pdfme doesn't complain
      keyFeaturesHeading: "",
      keyFeaturesList: [],
      specificationsHeading: "",
      specificationsTable: [],
      warrantyText: "",
      shippingText: "",
      shippingHeading: "",
      pedLogo: "",
      ceLogo: "",
      irelandLogo: "",
    },
  ];

  const pdfBytes = await generate({
    template,
    inputs: pdfInputs,
    plugins: { text, image, line, rectangle, Table: table },
  });

  return pdfBytes;
}
