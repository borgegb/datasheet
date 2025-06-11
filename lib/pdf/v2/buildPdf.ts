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
  const fs = await import("fs/promises");
  const { fileURLToPath } = await import("url");

  const templateUrl = new URL(
    "../../../pdf/template/datasheet-template.json",
    import.meta.url
  );
  const templatePath = fileURLToPath(templateUrl);
  const templateJson = await fs.readFile(templatePath, "utf8");
  const template = JSON.parse(templateJson);

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
