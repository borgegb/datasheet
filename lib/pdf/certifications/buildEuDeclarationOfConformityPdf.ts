import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  StandardFonts,
  rgb,
  type RGB,
} from "pdf-lib";
import { promises as fs } from "node:fs";
import path from "node:path";
// @ts-expect-error fontkit does not ship local TypeScript declarations.
import * as fontkit from "fontkit";
import type { CertificationSettings } from "@/lib/certifications/settings";

export const EU_DECLARATION_CERTIFICATION_TYPES = [
  "eu-doc-owner-manual-blasting",
  "eu-doc-owner-manual-pto-compressors",
  "eu-doc-serialised",
] as const;

export type EuDeclarationCertificationType =
  (typeof EU_DECLARATION_CERTIFICATION_TYPES)[number];

type EuDeclarationInput = Record<string, unknown>;

type FontSet = {
  regular: PDFFont;
  bold: PDFFont;
  display: PDFFont;
};

type EquipmentRow = {
  label: string;
  value: string;
};

type ResolvedDeclaration = {
  documentLabel: string;
  declarationNumber: string;
  issueDate: string;
  revision: string;
  equipmentRows: EquipmentRow[];
  pedCategory: string;
  modules: string;
  certificateNo: string;
  includeCompressorStandard: boolean;
  compressorStandardPosition: "after-machinery" | "after-pneumatic";
  ceNote: string;
};

const PAGE_SIZE: [number, number] = [595.28, 841.89];
const PAGE_WIDTH = PAGE_SIZE[0];
const PAGE_HEIGHT = PAGE_SIZE[1];
const mmToPoints = (mm: number) => mm * 2.83464567;
const MARGIN_X = mmToPoints(22);
const CONTENT_RIGHT = mmToPoints(200);
const CONTENT_WIDTH = CONTENT_RIGHT - MARGIN_X;
const TOP_Y = PAGE_HEIGHT - mmToPoints(57);
const FOOTER_Y = PAGE_HEIGHT - mmToPoints(294);
const FOOTER_HEIGHT = mmToPoints(14);
const FOOTER_TOP = FOOTER_Y + FOOTER_HEIGHT;
const BOTTOM_Y = FOOTER_TOP + 18;
const TEXT_COLOR = rgb(0.08, 0.09, 0.1);
const MUTED_COLOR = rgb(0.34, 0.36, 0.38);
const BORDER_COLOR = rgb(0.81, 0.84, 0.82);
const BRAND_GREEN = rgb(0.17, 0.32, 0.21);
const TABLE_LABEL_FILL = rgb(0.94, 0.95, 0.94);
const WHITE = rgb(1, 1, 1);
const HEADER_LOGO_SIZE = mmToPoints(25);
const HEADER_LOGO_X = mmToPoints(175);
const HEADER_LOGO_Y = PAGE_HEIGHT - mmToPoints(18) - HEADER_LOGO_SIZE;
const HEADER_TITLE_Y = PAGE_HEIGHT - mmToPoints(28);
const HEADER_SUBTITLE_Y = PAGE_HEIGHT - mmToPoints(38);
const HEADER_SEPARATOR_Y = PAGE_HEIGHT - mmToPoints(45);

export function isEuDeclarationOfConformityType(
  type: string
): type is EuDeclarationCertificationType {
  return EU_DECLARATION_CERTIFICATION_TYPES.includes(
    type as EuDeclarationCertificationType
  );
}

export function buildEuDeclarationTitle(
  type: EuDeclarationCertificationType,
  data: EuDeclarationInput
) {
  const declarationNumber = stringValue(data.declarationNumber);
  if (type === "eu-doc-owner-manual-blasting") {
    return ["Owner's Manual DoC - Blasting Machines", declarationNumber]
      .filter(Boolean)
      .join(" - ");
  }

  if (type === "eu-doc-owner-manual-pto-compressors") {
    return ["Owner's Manual DoC - PTO Compressors", declarationNumber]
      .filter(Boolean)
      .join(" - ");
  }

  return [
    "Serialised DoC",
    stringValue(data.commercialName) || stringValue(data.modelType),
    stringValue(data.serialNumber),
  ]
    .filter(Boolean)
    .join(" - ");
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function formatIssueDate(value: unknown) {
  const raw = stringValue(value);
  if (!raw) return "";

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${day}/${months[date.getUTCMonth()]}/${date.getUTCFullYear()}`;
}

function resolvePed(
  categoryValue: string,
  settings: CertificationSettings,
  includeBothRoutes = false
) {
  if (includeBothRoutes) {
    return {
      pedCategory: "Cat. II, or Cat. III",
      modules: "Module A2 (For Cat. II), and Module B + C2 (For Cat. III)",
      certificateNo: `(For Cat. II) ${settings.catIiCertificateNo}, or\n(For Cat. III) ${settings.catIiiCertificateNo}`,
    };
  }

  if (categoryValue === "cat-iii") {
    return {
      pedCategory: "Cat. III",
      modules: "Module B + C2",
      certificateNo: settings.catIiiCertificateNo,
    };
  }

  return {
    pedCategory: "Cat. II",
    modules: "Module A2",
    certificateNo: settings.catIiCertificateNo,
  };
}

function resolveDeclaration(
  type: EuDeclarationCertificationType,
  data: EuDeclarationInput,
  settings: CertificationSettings
): ResolvedDeclaration {
  const common = {
    declarationNumber: stringValue(data.declarationNumber),
    issueDate: formatIssueDate(data.issueDate),
    revision: settings.templateRevision,
    ceNote:
      "Marking affixed to the product data plate. The Notified Body number (2810) accompanies the CE marking by virtue of the PED production-phase conformity assessment (Module A2 for Category II, Module B+C2 for Category III). For machines covered solely by self-assessment under Directive 2006/42/EC, the CE marking is affixed without a Notified Body number.",
  };

  if (type === "eu-doc-owner-manual-blasting") {
    const ped = resolvePed("", settings, true);
    return {
      ...common,
      documentLabel: "Owner's Manual DoC - Blasting Machines",
      equipmentRows: [
        {
          label: "Description / function",
          value: "Mobile abrasive blast machine",
        },
        { label: "Commercial name", value: "Blasting Machine BPXY0L" },
        { label: "Model / type", value: "XY0L, BP-A-Z000" },
      ],
      ...ped,
      includeCompressorStandard: false,
      compressorStandardPosition: "after-pneumatic",
    };
  }

  if (type === "eu-doc-owner-manual-pto-compressors") {
    const ped = resolvePed("cat-ii", settings);
    return {
      ...common,
      documentLabel: "Owner's Manual DoC - PTO Compressors",
      equipmentRows: [
        { label: "Description / function", value: "PTO-driven air compressor" },
        { label: "Commercial name", value: "VariMount 350" },
        { label: "Model / type", value: "VM350 / VM-A-0001" },
      ],
      ...ped,
      includeCompressorStandard: true,
      compressorStandardPosition: "after-pneumatic",
    };
  }

  const productType = stringValue(data.productType);
  const isCompressor = productType === "pto-compressor";
  const ped = resolvePed(stringValue(data.pedCategory), settings);

  return {
    ...common,
    documentLabel: "Serialised DoC",
    equipmentRows: [
      {
        label: "Description / function",
        value: isCompressor
          ? "PTO-driven air compressor"
          : "Mobile abrasive blast machine",
      },
      { label: "Commercial name", value: stringValue(data.commercialName) },
      { label: "Model / type", value: stringValue(data.modelType) },
      { label: "Serial number", value: stringValue(data.serialNumber) },
      {
        label: "Year of construction",
        value: stringValue(data.yearOfConstruction),
      },
    ],
    ...ped,
    includeCompressorStandard: isCompressor,
    compressorStandardPosition: "after-machinery",
  };
}

async function readAsset(assetPath: string) {
  try {
    return await fs.readFile(path.resolve(process.cwd(), assetPath));
  } catch {
    return null;
  }
}

async function embedOptionalJpg(pdfDoc: PDFDocument, assetPath: string) {
  const bytes = await readAsset(assetPath);
  if (!bytes) return null;
  try {
    return await pdfDoc.embedJpg(bytes);
  } catch {
    return null;
  }
}

async function embedOptionalPng(pdfDoc: PDFDocument, assetPath: string) {
  const bytes = await readAsset(assetPath);
  if (!bytes) return null;
  try {
    return await pdfDoc.embedPng(bytes);
  } catch {
    return null;
  }
}

async function loadFontSet(pdfDoc: PDFDocument): Promise<FontSet> {
  try {
    pdfDoc.registerFontkit(fontkit as any);
    const [interRegular, interBold, poppinsBold] = await Promise.all([
      readAsset("pdf/fonts/Inter-Regular.ttf"),
      readAsset("pdf/fonts/Inter-Bold.ttf"),
      readAsset("pdf/fonts/Poppins-Bold.ttf"),
    ]);

    if (interRegular && interBold && poppinsBold) {
      return {
        regular: await pdfDoc.embedFont(interRegular, { subset: false }),
        bold: await pdfDoc.embedFont(interBold, { subset: false }),
        display: await pdfDoc.embedFont(poppinsBold, { subset: false }),
      };
    }
  } catch {
    // Fall through to built-in PDF fonts if custom font loading is unavailable.
  }

  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  return { regular, bold, display: bold };
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  const paragraphs = String(text || "").split("\n");

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        current = next;
        continue;
      }

      if (current) {
        lines.push(current);
      }
      current = word;
    }

    if (current) {
      lines.push(current);
    }
  }

  return lines;
}

function drawWrappedText(options: {
  page: PDFPage;
  text: string;
  x: number;
  y: number;
  maxWidth: number;
  font: PDFFont;
  size: number;
  lineHeight?: number;
  color?: RGB;
}) {
  const {
    page,
    text,
    x,
    y,
    maxWidth,
    font,
    size,
    lineHeight = size + 3,
    color = TEXT_COLOR,
  } = options;
  const lines = wrapText(text, font, size, maxWidth);
  let cursorY = y;

  for (const line of lines) {
    if (line) {
      page.drawText(line, { x, y: cursorY, font, size, color });
    }
    cursorY -= lineHeight;
  }

  return cursorY;
}

function drawSectionTitle(
  page: PDFPage,
  title: string,
  y: number,
  fonts: FontSet
) {
  page.drawText(title, {
    x: MARGIN_X,
    y,
    font: fonts.display,
    size: 10.5,
    color: BRAND_GREEN,
  });
  page.drawLine({
    start: { x: MARGIN_X, y: y - 4 },
    end: { x: CONTENT_RIGHT, y: y - 4 },
    thickness: 0.6,
    color: BORDER_COLOR,
  });
  return y - 18;
}

function drawKeyValueRows(options: {
  page: PDFPage;
  rows: EquipmentRow[];
  x: number;
  y: number;
  width: number;
  labelWidth: number;
  fonts: FontSet;
  size?: number;
  labelColor?: RGB;
}) {
  const {
    page,
    rows,
    x,
    y,
    width,
    labelWidth,
    fonts,
    size = 8.6,
    labelColor = TEXT_COLOR,
  } = options;
  const valueWidth = width - labelWidth - 14;
  let cursorY = y;

  for (const row of rows) {
    const labelLines = wrapText(row.label, fonts.bold, size, labelWidth - 10);
    const valueLines = wrapText(row.value, fonts.regular, size, valueWidth);
    const lineCount = Math.max(labelLines.length, valueLines.length, 1);
    const rowHeight = Math.max(22, lineCount * (size + 3) + 10);

    page.drawRectangle({
      x,
      y: cursorY - rowHeight,
      width: labelWidth,
      height: rowHeight,
      color: TABLE_LABEL_FILL,
    });
    page.drawRectangle({
      x,
      y: cursorY - rowHeight,
      width,
      height: rowHeight,
      borderColor: BORDER_COLOR,
      borderWidth: 0.5,
    });
    page.drawLine({
      start: { x: x + labelWidth, y: cursorY },
      end: { x: x + labelWidth, y: cursorY - rowHeight },
      thickness: 0.5,
      color: BORDER_COLOR,
    });

    let textY = cursorY - size - 6;
    for (const line of labelLines) {
      if (line) {
        page.drawText(line, {
          x: x + 6,
          y: textY,
          font: fonts.bold,
          size,
          color: labelColor,
        });
      }
      textY -= size + 3;
    }

    textY = cursorY - size - 6;
    for (const line of valueLines) {
      if (line) {
        page.drawText(line, {
          x: x + labelWidth + 8,
          y: textY,
          font: fonts.regular,
          size,
          color: TEXT_COLOR,
        });
      }
      textY -= size + 3;
    }

    cursorY -= rowHeight;
  }

  return cursorY;
}

function drawInfoBar(
  page: PDFPage,
  declaration: ResolvedDeclaration,
  fonts: FontSet,
  y: number
) {
  const width = CONTENT_WIDTH;
  const height = 38;
  const colWidth = width / 3;

  page.drawRectangle({
    x: MARGIN_X,
    y: y - height,
    width,
    height,
    borderColor: BORDER_COLOR,
    borderWidth: 0.5,
  });

  [1, 2].forEach((index) => {
    const x = MARGIN_X + colWidth * index;
    page.drawLine({
      start: { x, y },
      end: { x, y: y - height },
      thickness: 0.5,
      color: BORDER_COLOR,
    });
  });

  const cells = [
    ["Declaration No.", declaration.declarationNumber],
    ["Revision", declaration.revision],
    ["Date of issue", declaration.issueDate],
  ];

  cells.forEach(([label, value], index) => {
    const x = MARGIN_X + colWidth * index + 8;
    page.drawText(label, {
      x,
      y: y - 14,
      font: fonts.bold,
      size: 8,
      color: MUTED_COLOR,
    });
    page.drawText(value || "-", {
      x,
      y: y - 29,
      font: fonts.regular,
      size: 9,
      color: TEXT_COLOR,
    });
  });

  return y - height - 18;
}

function drawHeader(
  page: PDFPage,
  fonts: FontSet,
  pageNumber: number,
  logo: PDFImage | null
) {
  const title = "EC / EU DECLARATION OF CONFORMITY";
  page.drawText(title, {
    x: MARGIN_X,
    y: HEADER_TITLE_Y,
    font: fonts.display,
    size: 16,
    color: BRAND_GREEN,
  });

  page.drawText(
    "Applied Concepts Ltd. | Roscrea Rd., Birr, Co. Offaly, R42 XW08, Republic of Ireland",
    {
      x: MARGIN_X,
      y: HEADER_SUBTITLE_Y,
      font: fonts.bold,
      size: 7.8,
      color: MUTED_COLOR,
    }
  );

  if (logo) {
    const scale = Math.min(HEADER_LOGO_SIZE / logo.width, HEADER_LOGO_SIZE / logo.height);
    page.drawImage(logo, {
      x: HEADER_LOGO_X,
      y: HEADER_LOGO_Y,
      width: logo.width * scale,
      height: logo.height * scale,
    });
  }

  page.drawLine({
    start: { x: MARGIN_X, y: HEADER_SEPARATOR_Y },
    end: { x: CONTENT_RIGHT, y: HEADER_SEPARATOR_Y },
    thickness: 0.6,
    color: MUTED_COLOR,
  });
}

function drawFooter(page: PDFPage, fonts: FontSet, pageNumber: number) {
  page.drawRectangle({
    x: 0,
    y: FOOTER_Y,
    width: PAGE_WIDTH,
    height: FOOTER_HEIGHT,
    color: BRAND_GREEN,
  });

  const footerTextY = FOOTER_Y + 15;
  page.drawText("www.appliedpi.com", {
    x: MARGIN_X,
    y: footerTextY,
    font: fonts.regular,
    size: 9.6,
    color: WHITE,
  });

  const pageText = `Page ${pageNumber} of 2`;
  const pageTextWidth = fonts.regular.widthOfTextAtSize(pageText, 8);
  page.drawText(pageText, {
    x: (PAGE_WIDTH - pageTextWidth) / 2,
    y: footerTextY + 1,
    font: fonts.regular,
    size: 8,
    color: WHITE,
  });

  const rightText = "www.ptocompressors.com";
  const rightWidth = fonts.regular.widthOfTextAtSize(rightText, 9.6);
  page.drawText(rightText, {
    x: CONTENT_RIGHT - rightWidth,
    y: footerTextY,
    font: fonts.regular,
    size: 9.6,
    color: WHITE,
  });
}

function drawLegislation(page: PDFPage, y: number, fonts: FontSet) {
  let cursorY = drawSectionTitle(
    page,
    "Applicable Union Harmonisation Legislation",
    y,
    fonts
  );
  const legislation = [
    "Directive 2006/42/EC of the European Parliament and of the Council of 17 May 2006 on machinery (Machinery Directive).",
    "Directive 2014/68/EU of the European Parliament and of the Council of 15 May 2014 on the harmonisation of the laws of the Member States relating to the making available on the market of pressure equipment (PED).",
  ];

  for (const item of legislation) {
    page.drawText("-", {
      x: MARGIN_X,
      y: cursorY,
      font: fonts.bold,
      size: 9,
      color: TEXT_COLOR,
    });
    cursorY = drawWrappedText({
      page,
      text: item,
      x: MARGIN_X + 12,
      y: cursorY,
      maxWidth: CONTENT_WIDTH - 12,
      font: fonts.regular,
      size: 8.7,
      lineHeight: 11.6,
    });
    cursorY -= 4;
  }

  return cursorY - 6;
}

function drawStandards(
  page: PDFPage,
  y: number,
  fonts: FontSet,
  includeCompressorStandard: boolean,
  compressorStandardPosition: ResolvedDeclaration["compressorStandardPosition"]
) {
  let cursorY = drawSectionTitle(page, "Applicable Standards", y, fonts);
  const machineryStandard: [string, string] = [
    "EN ISO 12100:2010",
    "Safety of machinery - General principles for design, risk assessment and risk reduction.",
  ];
  const compressorStandard: [string, string] = [
    "EN 1012-1:2010",
    "Compressors and vacuum pumps - Safety requirements - Part 1: Air compressors.",
  ];
  const pneumaticStandard: [string, string] = [
    "EN ISO 4414:2010",
    "Pneumatic fluid power - General rules and safety requirements (as applicable).",
  ];
  const pressureStandard: [string, string] = [
    "EN ISO 4126-1",
    "Safety devices for protection against excessive pressure - Safety valves (PRV).",
  ];
  const standards: [string, string][] = [
    machineryStandard,
    ...(includeCompressorStandard &&
    compressorStandardPosition === "after-machinery"
      ? [compressorStandard]
      : []),
    pneumaticStandard,
    ...(includeCompressorStandard &&
    compressorStandardPosition === "after-pneumatic"
      ? [compressorStandard]
      : []),
    pressureStandard,
  ];

  cursorY = drawKeyValueRows({
    page,
    rows: standards.map(([label, value]) => ({ label, value })),
    x: MARGIN_X,
    y: cursorY,
    width: CONTENT_WIDTH,
    labelWidth: 128,
    fonts,
    size: 8.4,
  });

  return cursorY - 18;
}

function drawSignatureBlock(page: PDFPage, y: number, fonts: FontSet) {
  let cursorY = drawSectionTitle(
    page,
    "Signed for and on Behalf of Applied Concepts Ltd.",
    y,
    fonts
  );

  const rowHeight = 36;
  const colWidth = CONTENT_WIDTH / 3;
  const cells = [
    { label: "Place of issue", value: "Birr, Co. Offaly, Ireland" },
    { label: "Name", value: "Mark Clendennen" },
    { label: "Position", value: "Managing Director" },
  ];

  page.drawRectangle({
    x: MARGIN_X,
    y: cursorY - rowHeight,
    width: CONTENT_WIDTH,
    height: rowHeight,
    borderColor: BORDER_COLOR,
    borderWidth: 0.5,
  });

  [1, 2].forEach((index) => {
    const x = MARGIN_X + colWidth * index;
    page.drawLine({
      start: { x, y: cursorY },
      end: { x, y: cursorY - rowHeight },
      thickness: 0.5,
      color: BORDER_COLOR,
    });
  });

  cells.forEach((cell, index) => {
    const x = MARGIN_X + colWidth * index + 8;
    page.drawText(cell.label, {
      x,
      y: cursorY - 12,
      font: fonts.bold,
      size: 8.5,
      color: BRAND_GREEN,
    });
    page.drawText(cell.value, {
      x,
      y: cursorY - 25,
      font: fonts.regular,
      size: 9,
      color: TEXT_COLOR,
    });
  });

  cursorY -= rowHeight + 48;

  page.drawLine({
    start: { x: MARGIN_X, y: cursorY },
    end: { x: CONTENT_RIGHT, y: cursorY },
    thickness: 0.8,
    color: TEXT_COLOR,
  });

  page.drawText("Signature", {
    x: MARGIN_X,
    y: cursorY - 13,
    font: fonts.regular,
    size: 8.5,
    color: MUTED_COLOR,
  });

  return cursorY - 24;
}

function drawCeMarking(options: {
  page: PDFPage;
  y: number;
  fonts: FontSet;
  ceLogo: PDFImage | null;
  note: string;
}) {
  const { page, y, fonts, ceLogo, note } = options;
  let cursorY = drawSectionTitle(page, "CE Marking", y, fonts);

  if (ceLogo) {
    const ceWidth = 55;
    const scale = ceWidth / ceLogo.width;
    page.drawImage(ceLogo, {
      x: MARGIN_X,
      y: cursorY - 34,
      width: ceWidth,
      height: ceLogo.height * scale,
    });
    page.drawText("2810", {
      x: MARGIN_X + 11,
      y: cursorY - 48,
      font: fonts.bold,
      size: 9.5,
      color: TEXT_COLOR,
    });
  } else {
    page.drawText("CE", {
      x: MARGIN_X,
      y: cursorY - 24,
      font: fonts.bold,
      size: 24,
      color: TEXT_COLOR,
    });
    page.drawText("2810", {
      x: MARGIN_X + 7,
      y: cursorY - 42,
      font: fonts.bold,
      size: 9.5,
      color: TEXT_COLOR,
    });
  }

  cursorY = drawWrappedText({
    page,
    text: note,
    x: MARGIN_X + 70,
    y: cursorY - 2,
    maxWidth: CONTENT_WIDTH - 70,
    font: fonts.regular,
    size: 8.3,
    lineHeight: 10.6,
  });

  return Math.min(cursorY, y - 72);
}

export async function buildEuDeclarationOfConformityPdf(
  type: EuDeclarationCertificationType,
  data: EuDeclarationInput,
  settings: CertificationSettings
): Promise<Uint8Array> {
  const declaration = resolveDeclaration(type, data, settings);
  const pdfDoc = await PDFDocument.create();
  const fonts = await loadFontSet(pdfDoc);
  const logo = await embedOptionalJpg(pdfDoc, "pdf/assets/Appliedlogo.jpg");
  const ceLogo = await embedOptionalPng(pdfDoc, "pdf/assets/ce-logo.png");

  const page1 = pdfDoc.addPage(PAGE_SIZE);
  drawHeader(page1, fonts, 1, logo);
  drawFooter(page1, fonts, 1);
  let y = TOP_Y;
  y = drawInfoBar(page1, declaration, fonts, y);

  y = drawWrappedText({
    page: page1,
    text: "Applied Concepts Ltd., Roscrea Rd., Birr, Co. Offaly, R42 XW08, Republic of Ireland, hereby declares under its sole responsibility that the equipment identified below is in conformity with all the relevant provisions of the Union harmonisation legislation listed in this declaration. This declaration relates exclusively to the equipment in the state in which it was placed on the market and excludes components added or operations carried out subsequently by the user.",
    x: MARGIN_X,
    y,
    maxWidth: CONTENT_WIDTH,
    font: fonts.regular,
    size: 8.9,
    lineHeight: 11.8,
  });
  y -= 14;

  y = drawSectionTitle(page1, "Manufacturer", y, fonts);
  y = drawKeyValueRows({
    page: page1,
    rows: [
      { label: "Company", value: "Applied Concepts Ltd." },
      {
        label: "Address",
        value:
          "Roscrea Rd., Birr, Co. Offaly, R42 XW08, Republic of Ireland",
      },
    ],
    x: MARGIN_X,
    y,
    width: CONTENT_WIDTH,
    labelWidth: 128,
    fonts,
  });
  y -= 16;

  y = drawSectionTitle(
    page1,
    "Object of the Declaration - Equipment Identification",
    y,
    fonts
  );
  y = drawKeyValueRows({
    page: page1,
    rows: declaration.equipmentRows,
    x: MARGIN_X,
    y,
    width: CONTENT_WIDTH,
    labelWidth: 128,
    fonts,
  });
  y -= 16;

  y = drawLegislation(page1, y, fonts);

  y = drawSectionTitle(page1, "Conformity Assessment Procedure", y, fonts);
  y = drawKeyValueRows({
    page: page1,
    rows: [
      {
        label: "Machinery Directive 2006/42/EC",
        value:
          "Internal checks on the manufacture of machinery - Annex VIII (manufacturer's self-assessment). The equipment is not listed in Annex IV of the Directive; no Notified Body is required for the machinery conformity assessment.",
      },
      {
        label: "Pressure Equipment Directive 2014/68/EU",
        value: `PED category: ${declaration.pedCategory}\nModule(s): ${declaration.modules}\nNotified Body: HPi Verification Services Ltd, EU Notified Body No. 2810, Office No. C5, Bracetown Business Park, Clonee, Dublin 15, D15 YDC1, Ireland.\nCertificate No(s).: ${declaration.certificateNo}`,
      },
    ],
    x: MARGIN_X,
    y,
    width: CONTENT_WIDTH,
    labelWidth: 138,
    fonts,
    size: 8.1,
  });
  y -= 14;

  drawCeMarking({
    page: page1,
    y,
    fonts,
    ceLogo,
    note: declaration.ceNote,
  });

  const page2 = pdfDoc.addPage(PAGE_SIZE);
  drawHeader(page2, fonts, 2, logo);
  drawFooter(page2, fonts, 2);
  y = TOP_Y;

  y = drawStandards(
    page2,
    y,
    fonts,
    declaration.includeCompressorStandard,
    declaration.compressorStandardPosition
  );

  y = drawSectionTitle(
    page2,
    "Person Authorised to Compile the Technical File",
    y,
    fonts
  );
  y = drawKeyValueRows({
    page: page2,
    rows: [
      { label: "Name", value: "Mark Clendennen" },
      { label: "Position", value: "Managing Director" },
      {
        label: "Address",
        value:
          "Roscrea Rd., Birr, Co. Offaly, R42 XW08, Republic of Ireland (established in the European Union).",
      },
    ],
    x: MARGIN_X,
    y,
    width: CONTENT_WIDTH,
    labelWidth: 154,
    fonts,
    size: 9,
    labelColor: BRAND_GREEN,
  });
  y -= 18;

  if (y > BOTTOM_Y + 120) {
    drawSignatureBlock(page2, y, fonts);
  }

  return pdfDoc.save();
}
