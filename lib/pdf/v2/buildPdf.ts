interface BuildPdfInput {
  appliedLogoBase64Data: string;
  productTitle: string;
  productSubtitle: string;
  introParagraph: string;
  productImageBase64?: string;
}

export async function buildPdfV2(input: BuildPdfInput): Promise<Uint8Array> {
  // Initial rebuild step: fill header & intro only, leave other fields empty
  const { generate } = await import("@pdfme/generator");
  const { text, image, line, rectangle, table } = await import(
    "@pdfme/schemas"
  );
  // Importing JSON at build time ensures template is bundled with the lambda
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - allow json import
  import datasheetTemplate from "../../../pdf/template/datasheet-template.json";

  const template = datasheetTemplate as any;

  const inputs = [
    {
      appliedLogo: input.appliedLogoBase64Data,
      productTitle: input.productTitle,
      productSubtitle: input.productSubtitle,
      introParagraph: input.introParagraph,

      keyFeaturesHeading: "",
      keyFeaturesList: [],

      productimage: input.productImageBase64 || "",

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
    inputs,
    plugins: { text, image, line, rectangle, Table: table },
  });
  return pdfBytes;
}
