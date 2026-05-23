import { generate } from "@pdfme/generator";
import { getDefaultFont } from "@pdfme/common";
import { text, image, line, rectangle, table } from "@pdfme/schemas";
import { promises as fs } from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "mockups");

async function dataUrl(relativePath, mimeType) {
  const bytes = await fs.readFile(path.join(root, relativePath));
  return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
}

async function loadFonts() {
  const fontDir = path.join(root, "pdf/fonts");
  const [poppinsBold, interRegular, interBold] = await Promise.all([
    fs.readFile(path.join(fontDir, "Poppins-Bold.ttf")),
    fs.readFile(path.join(fontDir, "Inter-Regular.ttf")),
    fs.readFile(path.join(fontDir, "Inter-Bold.ttf")),
  ]);

  return {
    ...getDefaultFont(),
    "Poppins-Bold": { data: poppinsBold, subset: true },
    "Inter-Regular": { data: interRegular, subset: true },
    "Inter-Bold": { data: interBold, subset: true },
  };
}

const basePdf = {
  width: 210,
  height: 297,
  padding: [20, 10, 20, 22],
  staticSchema: [
    {
      type: "rectangle",
      name: "pageBackground",
      position: { x: 0, y: 0 },
      width: 210,
      height: 297,
      color: "#ffffff",
    },
    {
      type: "rectangle",
      name: "footerBackground",
      position: { x: 0, y: 280 },
      width: 210,
      height: 14,
      color: "#2c5234",
    },
    {
      type: "text",
      name: "footerWebsite1",
      content: "www.appliedpi.com",
      position: { x: 22, y: 283.5 },
      width: 80,
      height: 7,
      fontName: "Inter-Regular",
      fontSize: 9.6,
      fontColor: "#ffffff",
      alignment: "left",
      verticalAlignment: "middle",
    },
    {
      type: "text",
      name: "footerWebsite2",
      content: "www.ptocompressors.com",
      position: { x: 105, y: 283.5 },
      width: 94,
      height: 7,
      fontName: "Inter-Regular",
      fontSize: 9.6,
      fontColor: "#ffffff",
      alignment: "right",
      verticalAlignment: "middle",
    },
  ],
};

function variantTableSchema(name, y, height = 45) {
  return {
    type: "table",
    name,
    position: { x: 22, y },
    width: 178,
    height,
    content: "",
    showHead: true,
    head: ["Product Code", "Description", "Weight", "Length", "Diameter"],
    headWidthPercentages: [14, 42, 14.67, 14.67, 14.66],
    fontName: "Inter-Regular",
    tableStyles: {
      borderColor: "#CCCCCC",
      borderWidth: 0.1,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
    headStyles: {
      fontName: "Inter-Bold",
      fontSize: 8.1,
      characterSpacing: 0,
      alignment: "left",
      verticalAlignment: "middle",
      lineHeight: 1.1,
      fontColor: "#2c5234",
      backgroundColor: "#EFF2EF",
      borderColor: "#CCCCCC",
      borderWidth: { top: 0.1, right: 0.1, bottom: 0.1, left: 0.1 },
      padding: { top: 1.5, bottom: 1.5, left: 1.7, right: 1.7 },
    },
    bodyStyles: {
      fontName: "Inter-Regular",
      fontSize: 8.1,
      characterSpacing: 0,
      alignment: "left",
      verticalAlignment: "middle",
      lineHeight: 1.12,
      fontColor: "#111111",
      borderColor: "#CCCCCC",
      borderWidth: { top: 0.1, right: 0.1, bottom: 0.1, left: 0.1 },
      padding: { top: 1.35, bottom: 1.35, left: 1.7, right: 1.7 },
      backgroundColor: "",
      alternateBackgroundColor: "",
    },
    columnStyles: {
      alignment: { 0: "left", 1: "left", 2: "left", 3: "left", 4: "left" },
    },
  };
}

function specificationsTableSchema(name, y, height = 45) {
  return {
    type: "table",
    name,
    position: { x: 22, y },
    width: 178,
    height,
    content: "",
    showHead: false,
    head: ["Property", "Value"],
    headWidthPercentages: [50, 50],
    fontName: "Inter-Regular",
    tableStyles: {
      borderColor: "#CCCCCC",
      borderWidth: 0.1,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
    headStyles: {
      fontName: "Inter-Bold",
      fontSize: 9,
      characterSpacing: 0,
      alignment: "left",
      verticalAlignment: "middle",
      lineHeight: 1,
      fontColor: "#2A2A2A",
      backgroundColor: "#E0E0E0",
      borderColor: "#000000",
      borderWidth: { top: 0.1, right: 0.1, bottom: 0.1, left: 0.1 },
      padding: { top: 3, bottom: 3, left: 5, right: 5 },
    },
    bodyStyles: {
      fontName: "Inter-Regular",
      fontSize: 9,
      characterSpacing: 0,
      alignment: "left",
      verticalAlignment: "middle",
      lineHeight: 1,
      fontColor: "#2A2A2A",
      borderColor: "#CCCCCC",
      borderWidth: { top: 0.1, right: 0.1, bottom: 0.1, left: 0.1 },
      padding: { top: 2, bottom: 2, left: 3, right: 3 },
      backgroundColor: "",
      alternateBackgroundColor: "",
    },
    columnStyles: {
      alignment: { 0: "left", 1: "left" },
    },
  };
}

const sharedSchemas = [
  {
    type: "image",
    name: "appliedLogo",
    position: { x: 175, y: 18 },
    width: 25,
    height: 25,
    fit: "contain",
  },
  {
    type: "text",
    name: "productTitle",
    position: { x: 22, y: 20 },
    width: 148,
    height: 12,
    fontName: "Poppins-Bold",
    fontSize: 16,
    fontColor: "#2c5234",
    alignment: "left",
    verticalAlignment: "middle",
    lineHeight: 0.98,
  },
  {
    type: "text",
    name: "productSubtitle",
    position: { x: 22, y: 32 },
    width: 148,
    height: 7,
    fontName: "Inter-Bold",
    fontSize: 10,
    fontColor: "#868686",
    alignment: "left",
    verticalAlignment: "middle",
  },
  {
    type: "line",
    name: "titleSeparator",
    position: { x: 22, y: 45 },
    width: 178,
    height: 0.3,
    color: "#808080",
  },
  {
    type: "text",
    name: "introParagraph",
    position: { x: 22, y: 50 },
    width: 178,
    height: 20,
    fontName: "Inter-Regular",
    fontSize: 9,
    fontColor: "#111111",
    alignment: "left",
    lineHeight: 1.3,
  },
  {
    type: "text",
    name: "keyFeaturesHeading",
    position: { x: 22, y: 77 },
    width: 120,
    height: 8,
    fontName: "Poppins-Bold",
    fontSize: 12,
    fontColor: "#2c5234",
    alignment: "left",
    verticalAlignment: "middle",
  },
  {
    type: "text",
    name: "keyFeaturesText",
    position: { x: 22, y: 88 },
    width: 93,
    height: 89,
    fontName: "Inter-Regular",
    fontSize: 9,
    fontColor: "#111111",
    alignment: "left",
    lineHeight: 1.45,
  },
  {
    type: "rectangle",
    name: "productImageBackground",
    position: { x: 120, y: 73 },
    width: 80,
    height: 107,
    color: "#f5f5f5",
  },
  {
    type: "text",
    name: "productImagePlaceholder",
    position: { x: 120, y: 121 },
    width: 80,
    height: 8,
    fontName: "Inter-Bold",
    fontSize: 9,
    fontColor: "#868686",
    alignment: "center",
    verticalAlignment: "middle",
  },
  {
    type: "rectangle",
    name: "variantHeaderBg",
    position: { x: 22, y: 186 },
    width: 178,
    height: 8,
    color: "#2c5234",
  },
  {
    type: "text",
    name: "variantHeading",
    position: { x: 25, y: 186 },
    width: 175,
    height: 8,
    fontName: "Poppins-Bold",
    fontSize: 14,
    fontColor: "#ffffff",
    alignment: "left",
    verticalAlignment: "middle",
  },
  variantTableSchema("variantTable", 194),
  {
    type: "text",
    name: "warrantyText",
    position: { x: 22, y: 243 },
    width: 178,
    height: 8,
    fontName: "Inter-Bold",
    fontSize: 9,
    fontColor: "#2c5234",
    alignment: "left",
    lineHeight: 1.2,
  },
  {
    type: "text",
    name: "shippingHeading",
    position: { x: 22, y: 256 },
    width: 120,
    height: 7,
    fontName: "Poppins-Bold",
    fontSize: 12,
    fontColor: "#2c5234",
    alignment: "left",
    verticalAlignment: "middle",
  },
  {
    type: "text",
    name: "shippingText",
    position: { x: 22, y: 264 },
    width: 112,
    height: 16,
    fontName: "Inter-Regular",
    fontSize: 9,
    fontColor: "#111111",
    alignment: "left",
    lineHeight: 1.28,
  },
  {
    type: "image",
    name: "partsLogo",
    position: { x: 165, y: 244 },
    width: 35,
    height: 35,
    fit: "contain",
  },
];

const continuationSchemas = [
  {
    type: "image",
    name: "appliedLogo",
    position: { x: 175, y: 18 },
    width: 25,
    height: 25,
    fit: "contain",
  },
  {
    type: "text",
    name: "continuationTitle",
    position: { x: 22, y: 20 },
    width: 148,
    height: 12,
    fontName: "Poppins-Bold",
    fontSize: 16,
    fontColor: "#2c5234",
    alignment: "left",
    verticalAlignment: "middle",
  },
  {
    type: "text",
    name: "continuationSubtitle",
    position: { x: 22, y: 32 },
    width: 148,
    height: 7,
    fontName: "Inter-Bold",
    fontSize: 10,
    fontColor: "#868686",
    alignment: "left",
    verticalAlignment: "middle",
  },
  {
    type: "line",
    name: "continuationSeparator",
    position: { x: 22, y: 45 },
    width: 178,
    height: 0.3,
    color: "#808080",
  },
  {
    type: "rectangle",
    name: "continuationHeaderBg",
    position: { x: 22, y: 50 },
    width: 178,
    height: 8,
    color: "#2c5234",
  },
  {
    type: "text",
    name: "continuationHeading",
    position: { x: 25, y: 50 },
    width: 175,
    height: 8,
    fontName: "Poppins-Bold",
    fontSize: 14,
    fontColor: "#ffffff",
    alignment: "left",
    verticalAlignment: "middle",
  },
  variantTableSchema("variantContinuationTable", 58, 200),
];

const combinedFirstPageSchemas = sharedSchemas.map((schema) => {
  if (schema.name === "variantHeaderBg") {
    return { ...schema, name: "specificationsHeaderBg" };
  }

  if (schema.name === "variantHeading") {
    return { ...schema, name: "specificationsHeading" };
  }

  if (schema.name === "variantTable") {
    return specificationsTableSchema("specificationsTable", 194);
  }

  return schema;
});

const compactRows = [
  ["AL-A-0001", "Standard Airforce blow gun with long lance assembly", "3.5 kg", "1470 mm", "70 mm"],
  ["AL-A-0002", "Short lance version for compact cleaning areas", "3.1 kg", "1170 mm", "70 mm"],
  ["AL-A-0003", "Heavy-duty nozzle version for aggressive debris removal", "3.8 kg", "1510 mm", "75 mm"],
  ["AL-A-0004", "Extended reach version for large machinery access", "4.2 kg", "1740 mm", "70 mm"],
  ["AL-A-0005", "Compact trigger assembly with standard air lance", "3.3 kg", "1360 mm", "68 mm"],
];

const overflowRows = [
  ["AL-A-0001", "Standard Airforce blow gun with long lance assembly for general-purpose site cleaning and blast-room blow-down.", "3.5 kg", "1470 mm", "70 mm"],
  ["AL-A-0002", "Short lance version for compact cleaning areas where operators need a smaller working radius.", "3.1 kg", "1170 mm", "70 mm"],
  ["AL-A-0003", "Heavy-duty nozzle version for aggressive debris removal after blasting, sanding or preparation work.", "3.8 kg", "1510 mm", "75 mm"],
  ["AL-A-0004", "Extended reach version for clearing large machinery and equipment without requiring close operator access.", "4.2 kg", "1740 mm", "70 mm"],
  ["AL-A-0005", "Compact trigger assembly with standard air lance, designed for repeated cleaning tasks across workshops.", "3.3 kg", "1360 mm", "68 mm"],
  ["AL-A-0006", "Optional large-diameter configuration for applications where increased air movement is required.", "4.6 kg", "1650 mm", "90 mm"],
];

const specificationRows = [
  ["Body construction", "Die-cast aluminium, machined brass and stainless steel"],
  ["Recommended inlet pressure", "At least 90 psi"],
  ["Recommended hose ID", "At least 1/2 inch"],
  ["Air consumption", "135 CFM at 100 psi"],
  ["Trigger", "Extreme Ease power-assisted trigger requiring minimal force to operate"],
];

async function buildProof(rows, filename, schemas = [sharedSchemas], extraInput = {}) {
  const [font, appliedLogo, partsLogo] = await Promise.all([
    loadFonts(),
    dataUrl("pdf/assets/Appliedlogo.jpg", "image/jpeg"),
    dataUrl("pdf/assets/applied-genuine-parts-logo-512px.png", "image/png"),
  ]);

  const template = {
    basePdf,
    schemas,
  };

  const inputs = [
    {
      appliedLogo,
      productTitle: "Applied Airforce - An Extreme High Volume Air Blow Gun",
      productSubtitle: "Variant Datasheet",
      introParagraph:
        "The Applied Airforce is an extreme high-volume air blow-down gun for fast, effective cleaning of machinery and equipment. Connected to an Applied Varimount, portable diesel air compressor, or other large-output air compressor, it delivers powerful air to clear dust, debris and stubborn material. Ideal for blowing down blast rooms and blowing off items after blasting, it is faster than sweeping and safer than improvised pipe-and-valve systems.",
      keyFeaturesHeading: "Key Features",
      keyFeaturesText:
        "• Extreme high-volume air blow-down gun for heavy-duty cleaning tasks.\n\n• Clears dust, debris, rubble and stubborn material quickly and efficiently.\n\n• Ideal for cleaning and drying heavy machinery and equipment safely.\n\n• Works with tow-behind, portable diesel and large-output air compressors.\n\n• Faster than sweeping and safer than using a pipe and ball valve.\n\n• Power-assisted trigger requires minimal force, making it easy to operate.",
      productImagePlaceholder: "Product image area",
      variantHeading: "Variant Information",
      variantTable: rows,
      specificationsHeading: "Specifications",
      specificationsTable: specificationRows,
      warrantyText:
        "This product is covered by a 12-month warranty against defects in materials and workmanship.",
      shippingHeading: "Shipping Information",
      shippingText:
        "The Applied Airforce variant range is shipped as individual packages. Packaging dimensions and weights are listed in the variant information table where applicable.",
      partsLogo,
      ...extraInput,
    },
  ];

  const bytes = await generate({
    template,
    inputs,
    options: { font },
    plugins: { text, image, line, rectangle, Table: table },
  });

  const outPath = path.join(outDir, filename);
  await fs.writeFile(outPath, bytes);
  return outPath;
}

await fs.mkdir(outDir, { recursive: true });
const compact = await buildProof(compactRows, "variant-datasheet-proof.pdf");
const overflow = await buildProof(
  overflowRows.slice(0, 3),
  "variant-datasheet-overflow-proof.pdf",
  [sharedSchemas, continuationSchemas],
  {
    continuationTitle: "Variant Information",
    continuationSubtitle: "Continued from page 1",
    continuationHeading: "Variant Information Continued",
    variantContinuationTable: overflowRows.slice(3),
  }
);
const combined = await buildProof(
  [],
  "datasheet-combined-specs-variants-proof.pdf",
  [combinedFirstPageSchemas, continuationSchemas],
  {
    continuationTitle: "Variant Information",
    continuationSubtitle: "Variant table for selected product options",
    continuationHeading: "Variant Information",
    variantContinuationTable: overflowRows,
  }
);

console.log(`Wrote ${compact}`);
console.log(`Wrote ${overflow}`);
console.log(`Wrote ${combined}`);
