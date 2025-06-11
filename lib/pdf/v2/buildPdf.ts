export async function buildPdfV2(): Promise<Uint8Array> {
  // Minimal scaffolding: just embed the base template with no dynamic fields
  const { generate } = await import("@pdfme/generator");
  const { text, image, line, rectangle, table } = await import(
    "@pdfme/schemas"
  );
  const { promises: fs } = await import("node:fs");
  const path = await import("node:path");
  const templatePath = path.resolve(
    process.cwd(),
    "pdf/template/datasheet-template.json"
  );
  const template = JSON.parse(await fs.readFile(templatePath, "utf8"));

  // For a skeleton generation we just supply empty values for schema names
  const inputs = [
    {
      appliedLogo: "",
      productTitle: "",
      productSubtitle: "",
      introParagraph: "",
      keyFeaturesHeading: "",
      keyFeaturesList: [],
      productimage: "",
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
