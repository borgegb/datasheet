import { generate } from "@pdfme/generator";
import { text, image, line, rectangle } from "@pdfme/schemas";
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
  ).default as Template;

  // Deep clone to avoid mutating cached module across calls
  const tmpl: Template = JSON.parse(JSON.stringify(template));

  // Inject specification rows as simple text + separator lines instead of a dynamic table
  const firstPageSchemas = (tmpl.schemas as any)[0] as any[];

  // Remove placeholder table if present
  const withoutTable = firstPageSchemas.filter(
    (n) => n.name !== "specificationsTable"
  );
  (tmpl.schemas as any)[0] = withoutTable;

  const startY = 188; // mm – align with original table top
  const rowHeight = 7; // mm per spec row
  const col1X = 22; // mm
  const col2X = 110; // mm (approx half page width)
  const col1Width = 75; // mm
  const col2Width = 85; // mm

  input.specificationsTable.slice(0, 10).forEach((row, idx) => {
    const y = startY + idx * rowHeight;
    const label = (row[0] ?? "").toString();
    const value = (row[1] ?? "").toString();

    withoutTable.push(
      {
        type: "text",
        name: `specLabel${idx}`,
        content: label,
        position: { x: col1X, y },
        width: col1Width,
        height: rowHeight,
        fontName: "Inter-Regular",
        fontSize: 9,
        fontColor: "#2A2A2A",
        alignment: "left",
        verticalAlignment: "middle",
      },
      {
        type: "text",
        name: `specValue${idx}`,
        content: value,
        position: { x: col2X, y },
        width: col2Width,
        height: rowHeight,
        fontName: "Inter-Regular",
        fontSize: 9,
        fontColor: "#2A2A2A",
        alignment: "left",
        verticalAlignment: "middle",
      }
    );
  });

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

      // Unused placeholders now
      keyFeaturesHeading: "",
      keyFeaturesList: [],
    },
  ];

  const pdfBytes = await generate({
    template: tmpl,
    inputs: pdfInputs,
    plugins: { text, image, line, rectangle },
  });

  return pdfBytes;
}
