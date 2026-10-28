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
import type { HydrostaticProfile } from "@/lib/certifications/hydrostatic";
import { documentRevisionSchema } from "@/lib/certifications/revision";
import { allowsBlankDeclarationCertificate } from "@/lib/certifications/release";
import { declarationReference, fixedManualMetadata, referenceIdentity, referenceConfigurationError, compressorSerialSchema, CAT_III_CERTIFICATE, RECEIVER_CERTIFICATE, NOTIFIED_BODY } from "@/lib/certifications/reference";
import { DECLARATION_TYPES, isSerialisedDeclaration, supplementalDeclarationProfile, type EuDocProductType, type EuDocPedCategory } from "@/lib/certifications/declarations";
export type { EuDocProductType, EuDocPedCategory } from "@/lib/certifications/declarations";

// Includes SEP declarations, which share issuance controls but are not EU DoCs.
export const EU_DECLARATION_CERTIFICATION_TYPES = DECLARATION_TYPES;

export type EuDeclarationCertificationType =
  (typeof EU_DECLARATION_CERTIFICATION_TYPES)[number];

type EuDeclarationInput = Record<string, unknown>;

export type EuDeclarationProductCertification = {
  id?: string;
  productTitle?: string | null;
  productCode?: string | null;
  productType: EuDocProductType;
  pedCategory: EuDocPedCategory;
  certificateNo: string;
  modelType?: string;
  equipmentProfile?: HydrostaticProfile | null;
  issueEnabled?: boolean | null;
};

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
  data: EuDeclarationInput,
  productCertification?: EuDeclarationProductCertification | null
) {
  const declarationNumber = stringValue(data.declarationNumber);
  const productName =
    productCertification?.productTitle || productCertification?.productCode;
  const supplemental = supplementalDeclarationProfile(type);
  if (supplemental) {
    return [supplemental.kind === "sep" ? "Air Filter SEP Declaration" : "20L EU DoC",
      isSerialisedDeclaration(type) ? "Serialised" : "Owner's Manual", productName,
      declarationNumber].filter(Boolean).join(" - ");
  }

  const manual = fixedManualMetadata(type, productCertification);
  if (manual) {
    const reference = declarationReference(productCertification)!;
    return ["Owner's Manual DoC", reference.kind === "receiver" ? "32L Air Receiver"
      : reference.category === "cat-ii" ? "Cat. II Blast Machines" : "Cat. III Blast Machines", manual.declarationNumber].join(" - ");
  }

  if (type === "eu-doc-owner-manual-blasting") {
    return [
      "Owner's Manual DoC - Blasting Machines",
      productName,
      declarationNumber,
    ]
      .filter(Boolean)
      .join(" - ");
  }

  if (type === "eu-doc-owner-manual-pto-compressors") {
    return [
      "Owner's Manual DoC - PTO Compressors",
      productName,
      declarationNumber,
    ]
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

function resolvePed(productCertification: EuDeclarationProductCertification) {
  const certificateNo = productCertification.certificateNo ||
    (allowsBlankDeclarationCertificate(productCertification) ? "" : "Pending certification (test only)");
  if (productCertification.pedCategory === "cat-iii") {
    return {
      pedCategory: "Cat. III",
      modules: "Module B + C2",
      certificateNo,
    };
  }

  return {
    pedCategory: "Cat. II",
    modules: "Module A2",
    certificateNo,
  };
}

function productTitleOrFallback(
  productCertification: EuDeclarationProductCertification,
  fallback: string
) {
  return (
    productCertification.productTitle?.trim() ||
    productCertification.productCode?.trim() ||
    fallback
  );
}

function productCodeOrFallback(
  productCertification: EuDeclarationProductCertification,
  fallback: string
) {
  return (
    productCertification.modelType?.trim() || productCertification.productCode?.trim() ||
    productCertification.productTitle?.trim() ||
    fallback
  );
}

function resolveDeclaration(
  type: EuDeclarationCertificationType,
  data: EuDeclarationInput,
  settings: CertificationSettings,
  productCertification: EuDeclarationProductCertification | null
): ResolvedDeclaration {
  if (!productCertification) {
    throw new Error("EU DoC product certification data is required.");
  }

  const common = {
    declarationNumber: stringValue(data.declarationNumber),
    issueDate: formatIssueDate(data.issueDate),
    revision: data.revision === undefined ? settings.templateRevision : documentRevisionSchema.parse(data.revision),
    ceNote:
      "Marking affixed to the product data plate. The Notified Body number (2810) accompanies the CE marking by virtue of the PED production-phase conformity assessment (Module A2 for Category II, Module B+C2 for Category III). For machines covered solely by self-assessment under Directive 2006/42/EC, the CE marking is affixed without a Notified Body number.",
  };

  if (type === "eu-doc-owner-manual-blasting") {
    const ped = resolvePed(productCertification);
    return {
      ...common,
      documentLabel: "Owner's Manual DoC - Blasting Machines",
      equipmentRows: [
        {
          label: "Description / function",
          value: productCertification.equipmentProfile?.equipmentDescription || "Mobile abrasive blast machine",
        },
        {
          label: "Commercial name",
          value: productTitleOrFallback(
            productCertification,
            "Blasting Machine BPXY0L"
          ),
        },
        {
          label: "Model / type",
          value: productCodeOrFallback(productCertification, "XY0L, BP-A-Z000"),
        },
      ],
      ...ped,
      includeCompressorStandard: false,
      compressorStandardPosition: "after-pneumatic",
    };
  }

  if (type === "eu-doc-owner-manual-pto-compressors") {
    const ped = resolvePed(productCertification);
    return {
      ...common,
      documentLabel: "Owner's Manual DoC - PTO Compressors",
      equipmentRows: [
        { label: "Description / function", value: "PTO-driven air compressor" },
        {
          label: "Commercial name",
          value: productTitleOrFallback(productCertification, "VariMount 350"),
        },
        {
          label: "Model / type",
          value: productCodeOrFallback(
            productCertification,
            "VM350 / VM-A-0001"
          ),
        },
      ],
      ...ped,
      includeCompressorStandard: true,
      compressorStandardPosition: "after-pneumatic",
    };
  }

  const isCompressor = productCertification.productType === "pto-compressor";
  const ped = resolvePed(productCertification);

  return {
    ...common,
    documentLabel: "Serialised DoC",
    equipmentRows: [
      {
        label: "Description / function",
        value: productCertification.equipmentProfile?.equipmentDescription || (isCompressor
          ? "PTO-driven air compressor"
          : "Mobile abrasive blast machine"),
      },
      {
        label: "Commercial name",
        value:
          stringValue(data.commercialName) ||
          productTitleOrFallback(
            productCertification,
            isCompressor ? "VariMount 350" : "Blast Machine BP200L"
          ),
      },
      {
        label: "Model / type",
        value:
          stringValue(data.modelType) ||
          productCodeOrFallback(
            productCertification,
            isCompressor ? "VM-A-0001" : "BP-A-5000"
          ),
      },
      { label: "Serial number", value: stringValue(data.serialNumber) },
      {
        label: "Year of manufacture",
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
      current = "";
      // Identifiers have no spaces; split them instead of crossing cell borders.
      for (const character of word) {
        if (current && font.widthOfTextAtSize(current + character, size) > maxWidth) {
          lines.push(current);
          current = "";
        }
        current += character;
      }
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
  fonts: FontSet,
  titleGap = 18
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
  return y - titleGap;
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
  compact?: boolean;
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
    compact = false,
  } = options;
  const valueWidth = width - labelWidth - 14;
  let cursorY = y;

  for (const row of rows) {
    const labelLines = wrapText(row.label, fonts.bold, size, labelWidth - 10);
    const valueLines = wrapText(row.value, fonts.regular, size, valueWidth);
    const lineCount = Math.max(labelLines.length, valueLines.length, 1);
    const rowHeight = Math.max(compact ? 20 : 22, lineCount * (size + 3) + (compact ? 8 : 10));

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
  declaration: Pick<ResolvedDeclaration, "declarationNumber" | "revision" | "issueDate">,
  fonts: FontSet,
  y: number
) {
  const width = CONTENT_WIDTH;
  const colWidth = width / 3;
  const cells = [
    ["Declaration No.", declaration.declarationNumber],
    ["Revision", declaration.revision],
    ["Date of issue", declaration.issueDate],
  ];
  const valueLines = cells.map(([, value]) => wrapText(value || "-", fonts.regular, 9, colWidth - 16));
  const height = 38 + (Math.max(...valueLines.map((lines) => lines.length)) - 1) * 12;

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

  cells.forEach(([label], index) => {
    const x = MARGIN_X + colWidth * index + 8;
    page.drawText(label, {
      x,
      y: y - 14,
      font: fonts.bold,
      size: 8,
      color: MUTED_COLOR,
    });
    valueLines[index].forEach((line, lineIndex) => page.drawText(line, {
      x,
      y: y - 29 - lineIndex * 12,
      font: fonts.regular,
      size: 9,
      color: TEXT_COLOR,
    }));
  });

  return y - height - 18;
}

function drawHeader(
  page: PDFPage,
  fonts: FontSet,
  pageNumber: number,
  logo: PDFImage | null,
  titles?: [string, string]
) {
  const title = "EC / EU DECLARATION OF CONFORMITY";
  page.drawText(titles?.[0] || title, {
    x: MARGIN_X,
    y: HEADER_TITLE_Y + (titles ? 9 : 0),
    font: fonts.display,
    size: titles ? 12.5 : 16,
    color: BRAND_GREEN,
  });
  if (titles) page.drawText(titles[1], {
    x: MARGIN_X, y: HEADER_TITLE_Y - 7, font: fonts.display, size: 11, color: BRAND_GREEN,
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

function drawFooter(page: PDFPage, fonts: FontSet, pageNumber: number, showPtoWebsite: boolean) {
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

  if (showPtoWebsite) {
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
}

function drawLegislation(page: PDFPage, y: number, fonts: FontSet, compact = false) {
  let cursorY = drawSectionTitle(
    page,
    "Applicable Union Harmonisation Legislation",
    y,
    fonts,
    compact ? 12 : 18
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

function drawSignatureBlock(page: PDFPage, y: number, fonts: FontSet, signature: PDFImage | null) {
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

  if (signature) {
    const scale = Math.min(140 / signature.width, 38 / signature.height);
    page.drawImage(signature, {
      x: MARGIN_X,
      y: cursorY + 4,
      width: signature.width * scale,
      height: signature.height * scale,
    });
  }

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
  includeNotifiedBody?: boolean;
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
    if (options.includeNotifiedBody !== false) page.drawText("2810", {
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
    if (options.includeNotifiedBody !== false) page.drawText("2810", {
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

async function buildSupplementalDeclarationPdf(
  type: EuDeclarationCertificationType,
  data: EuDeclarationInput,
  product: EuDeclarationProductCertification | null,
  signaturePng: Uint8Array | undefined,
  options: { isTest?: boolean }
) {
  const profile = supplementalDeclarationProfile(type)!;
  if (!product || product.productCode?.trim() !== profile.productCode ||
      product.productType !== profile.productType || product.pedCategory !== profile.pedCategory || product.certificateNo.trim()) {
    throw new Error(`This declaration requires the approved ${profile.productCode} product mapping.`);
  }
  const sep = profile.kind === "sep";
  const serialised = isSerialisedDeclaration(type);
  const values = { ...data, ...(fixedManualMetadata(type, product) || {}) };
  const declarationNumber = `${options.isTest && !stringValue(values.declarationNumber).startsWith("TEST-") ? "TEST-" : ""}${stringValue(values.declarationNumber)}`;
  const specs = product.equipmentProfile;
  const ps = specs?.maxPressureBar || "8.6";
  const volume = specs?.volumeLitres || (sep ? "5" : "20");
  const minTemperature = specs?.minTemperatureC || "-10";
  const maxTemperature = specs?.maxTemperatureC || "80";
  const pt = specs?.testPressureBar || (sep ? "15" : "20");
  const psVolume = String(Math.round(Number(ps) * Number(volume) * 100) / 100);
  const pdfDoc = await PDFDocument.create();
  const fonts = await loadFontSet(pdfDoc);
  const logo = await embedOptionalJpg(pdfDoc, "pdf/assets/Appliedlogo.jpg");
  const ceLogo = sep ? null : await embedOptionalPng(pdfDoc, "pdf/assets/ce-logo.png");
  const signature = !options.isTest && signaturePng ? await pdfDoc.embedPng(signaturePng) : null;
  const titles: [string, string] = sep
    ? ["MANUFACTURER'S DECLARATION - PED ARTICLE 4(3)", "RESPIRATOR AIR FILTER"]
    : ["EC / EU DECLARATION OF CONFORMITY", "BLASTING MACHINE 20L"];
  const address = "Roscrea Rd., Birr, Co. Offaly, R42 XW08, Republic of Ireland";
  const exclusion = "This declaration relates exclusively to the equipment in the state in which it was placed on the market and excludes components added or operations carried out subsequently by the user.";
  const page1 = pdfDoc.addPage(PAGE_SIZE);
  drawHeader(page1, fonts, 1, logo, titles);
  drawFooter(page1, fonts, 1, false);
  let y = drawInfoBar(page1, {
    declarationNumber,
    issueDate: formatIssueDate(values.issueDate),
    revision: values.revision === undefined ? profile.revision : documentRevisionSchema.parse(values.revision),
  }, fonts, TOP_Y);
  y = drawWrappedText({ page: page1, x: MARGIN_X, y, maxWidth: CONTENT_WIDTH, font: fonts.regular, size: 8.7, lineHeight: 11.5,
    text: sep
      ? `Applied Concepts Ltd., ${address}, hereby declares under its sole responsibility that the pressure equipment identified below has been designed and manufactured in accordance with the sound engineering practice of a Member State, in order to ensure safe use, as required by Article 4(3) of Directive 2014/68/EU. This is not an EU Declaration of Conformity: Article 4(3) equipment is not subject to a PED conformity assessment and shall not bear the CE marking under that Directive. ${exclusion}`
      : `Applied Concepts Ltd., ${address}, hereby declares under its sole responsibility that the equipment identified below is in conformity with all the relevant provisions of the Union harmonisation legislation listed in this declaration. ${exclusion}`,
  });

  // Keep whole table rows and the signature together. Reject excessive user text
  // instead of allowing a third page or overlap with the fixed brand footer.
  function rows(page: PDFPage, title: string, values: EquipmentRow[], size = 8.3, labelColor = TEXT_COLOR) {
    y = drawSectionTitle(page, title, y - 20, fonts, 14);
    y = drawKeyValueRows({ page, rows: values, x: MARGIN_X, y, width: CONTENT_WIDTH,
      labelWidth: 138, fonts, size, compact: true, labelColor });
  }
  function paragraph(page: PDFPage, title: string, text: string) {
    y = drawSectionTitle(page, title, y - 20, fonts, 16);
    y = drawWrappedText({ page, text, x: MARGIN_X, y, maxWidth: CONTENT_WIDTH,
      font: fonts.regular, size: 8.4, lineHeight: 11.2 });
  }
  rows(page1, "Manufacturer", [
    { label: "Company", value: "Applied Concepts Ltd." }, { label: "Address", value: address },
  ]);
  rows(page1, "Object of the Declaration - Equipment Identification", [
    { label: "Description / function", value: specs?.equipmentDescription || (sep
      ? "In-line compressed-air filter housing for the supply of breathing air to airline respirators (e.g. blast helmets)"
      : "Mobile abrasive blast machine") },
    { label: "Commercial name", value: sep ? product.productTitle || (serialised ? stringValue(data.commercialName) : profile.commercialName) : profile.commercialName },
    { label: "Model / type", value: product.modelType || (serialised ? stringValue(data.modelType) : profile.modelType) },
    { label: "Serial number", value: serialised ? stringValue(data.serialNumber) : "As stated on the product data plate" },
    { label: "Year of manufacture", value: serialised ? stringValue(data.yearOfConstruction) : "As stated on the product data plate" },
  ]);
  if (sep) {
    paragraph(page1, "Applicable Legislation",
      "Directive 2014/68/EU (Pressure Equipment Directive) - Article 4(3), Sound Engineering Practice. The equipment is below the Category I threshold and no conformity assessment module applies.\nOther Union legislation: no other Union harmonisation legislation providing for the CE marking has been identified by Applied Concepts Ltd. as applicable to this product as supplied.");
    rows(page1, "PED Classification and Basis of Design", [{
      label: "Pressure Equipment Directive 2014/68/EU",
      value: `Classification: below Category I - PS = ${ps} bar g; V = ${volume} L; Group 2 gas; PS x V = ${psVolume} bar L <= 50 bar L (Annex II, Table 2).\nApplicable provision: Article 4(3) - Sound Engineering Practice (SEP).\nModule / Notified Body: none - no PED module, Notified Body assessment or certificate applies; CE marking under the PED is not permitted.`,
    }], 8.1);
  } else {
    y = drawLegislation(page1, y - 22, fonts, true);
    rows(page1, "Conformity Assessment Procedure", [
      { label: "Machinery Directive 2006/42/EC", value: "Internal checks on the manufacture of machinery - Annex VIII (manufacturer's self-assessment). The equipment is not listed in Annex IV of the Directive; no Notified Body is required for the machinery conformity assessment." },
      { label: "Pressure Equipment Directive 2014/68/EU", value: `PED category: Cat. I (PS = ${ps} bar g; V = ${volume} L; Group 2 gas; PS x V = ${psVolume} bar L).\nModule(s): Module A - Internal production control (Annex III).\nNotified Body: Not applicable - Module A involves no Notified Body.\nCertificate No(s).: Not applicable - manufacturer self-assessment; no certificate is issued (EU Declaration of Conformity only).` },
    ], 8.1);
  }
  if (y < BOTTOM_Y) throw new Error("The equipment details are too long to fit on page one. Shorten the declaration number, commercial name or model.");

  const page2 = pdfDoc.addPage(PAGE_SIZE);
  drawHeader(page2, fonts, 2, logo, titles);
  drawFooter(page2, fonts, 2, false);
  y = TOP_Y;
  if (sep) {
    rows(page2, "Sound Engineering Practice - Basis", [{
      label: "Design, materials and testing",
      value: `Design: EN 13445-3:2014 used as reference code (Design by Formula).\nMaterials: pressure-retaining parts supplied with EN 10204 Type 3.1 inspection certificates and cast traceability.\nWelding: WPS 36083.01.001 / WPQR 36083.01; welders to EN ISO 9606-1.\nHydrostatic certificate optional: PT ${pt} bar, Water, holding time at least 15 minutes when performed.\nTechnical file: TSF-RAF-01.`,
    }], 8.1);
    paragraph(page2, "Marking - No CE",
      `No CE marking is affixed under Directive 2014/68/EU (Article 4(3)). Each unit is permanently marked with the manufacturer's name and address, model, serial/batch number, year of manufacture, PS, TS (${minTemperature} °C to +${maxTemperature} °C), V and the fluid (compressed air), and is supplied with instructions for use.`);
  } else {
    y = drawCeMarking({ page: page2, y, fonts, ceLogo, includeNotifiedBody: false,
      note: "Marking affixed to the product data plate without a Notified Body number: the PED conformity assessment for Category I (Module A - internal production control) and the Machinery Directive self-assessment (Annex VIII) involve no Notified Body in the production phase." });
  }
  rows(page2, "Applicable Standards", sep ? [
    { label: "EN 13445-3:2014", value: "Unfired pressure vessels - Part 3: Design (reference design code for the pressure envelope)." },
    { label: "EN ISO 9606-1", value: "Qualification testing of welders - Fusion welding - Part 1: Steels." },
    { label: "EN 12021:2014", value: "Respiratory equipment - Compressed gases for breathing apparatus (reference only: air quality of the complete supply system is outside the scope of this declaration)." },
  ] : [
    { label: "EN ISO 12100:2010", value: "Safety of machinery - General principles for design, risk assessment and risk reduction." },
    { label: "EN ISO 4414:2010", value: "Pneumatic fluid power - General rules and safety requirements (as applicable)." },
    { label: "EN 13445-3:2014", value: "Unfired pressure vessels - Part 3: Design (reference design code for the pressure envelope)." },
    { label: "EN ISO 4126-1:2013+A1:2016", value: "Safety devices for protection against excessive pressure - Safety valves (PRV)." },
  ]);
  rows(page2, sep ? "Person Responsible for the Technical Documentation" : "Person Authorised to Compile the Technical File", [
    { label: "Name", value: "Mark Clendennen" },
    { label: "Position", value: "Managing Director" },
    { label: "Address", value: `${address} (established in the European Union).` },
  ], 8.3, BRAND_GREEN);
  y -= 18;
  if (y < BOTTOM_Y + 126) throw new Error("The signature section does not fit on page two.");
  drawSignatureBlock(page2, y, fonts, signature);
  if (options.isTest) {
    for (const page of pdfDoc.getPages()) page.drawText("TEST / NOT FOR ISSUE - UNSIGNED", {
      x: MARGIN_X, y: TOP_Y + 15, font: fonts.bold, size: 10, color: MUTED_COLOR,
    });
  }
  return pdfDoc.save();
}

// The October references have denser tables and explicit, document-specific page breaks.
// Keep this layout isolated from the approved 20L and SEP documents.
async function buildReferenceDeclarationPdf(
  type: EuDeclarationCertificationType, data: EuDeclarationInput,
  product: EuDeclarationProductCertification, signaturePng: Uint8Array | undefined, isTest: boolean
) {
  const reference = declarationReference(product)!;
  if (!isTest && !signaturePng) throw new Error("A signature is required for issued declarations.");
  const receiver = reference.kind === "receiver";
  const catIII = reference.category === "cat-iii";
  const manual = fixedManualMetadata(type, product);
  const identity = referenceIdentity(product)!;
  const values: EuDeclarationInput = { ...data, ...identity, ...(manual || {}) };
  const issueDate = formatIssueDate(values.issueDate);
  const number = `${isTest && !stringValue(values.declarationNumber).startsWith("TEST-") ? "TEST-" : ""}${stringValue(values.declarationNumber)}`;
  const revision = documentRevisionSchema.parse(values.revision);
  const compressorSerial = receiver && !manual ? compressorSerialSchema.parse(values.compressorSerialNumber) : "";
  const pdf = await PDFDocument.create();
  const fonts = await loadFontSet(pdf);
  const logo = await embedOptionalJpg(pdf, "pdf/assets/Appliedlogo.jpg");
  const ce = await embedOptionalPng(pdf, "pdf/assets/ce-logo.png");
  if (!logo || !ce) throw new Error("The required Applied logo or CE mark could not be loaded.");
  const signature = !isTest && signaturePng ? await pdf.embedPng(signaturePng) : null;
  const x = 50.8, width = 493.68, size = 8.3, leading = 11.2;
  const address = "Roscrea Rd., Birr, Co. Offaly, R42 XW08, Republic of Ireland";
  const pages = [pdf.addPage(PAGE_SIZE), pdf.addPage(PAGE_SIZE)];
  let page = pages[0], y = 725;
  const text = (value: string, tx: number, ty: number, bold = false, fontSize = size, color = TEXT_COLOR) =>
    page.drawText(value, { x: tx, y: ty, font: bold ? fonts.bold : fonts.regular, size: fontSize, color });
  const paragraph = (value: string) => {
    y = drawWrappedText({ page, text: value, x, y, maxWidth: width, font: fonts.regular, size, lineHeight: leading });
  };
  const heading = (value: string) => {
    page.drawText(value, { x, y, font: fonts.display, size: 10.2, color: BRAND_GREEN });
    y -= 5;
  };
  const rows = (items: EquipmentRow[], labelWidth = 131) => {
    for (const row of items) {
      const labels = wrapText(row.label, fonts.bold, size, labelWidth - 10);
      const lines = wrapText(row.value, fonts.regular, size, width - labelWidth - 10);
      const height = Math.max(labels.length, lines.length) * leading + 5;
      page.drawRectangle({ x, y: y - height, width: labelWidth, height, color: TABLE_LABEL_FILL });
      page.drawRectangle({ x, y: y - height, width, height, borderColor: BORDER_COLOR, borderWidth: 0.5 });
      page.drawLine({ start: { x: x + labelWidth, y }, end: { x: x + labelWidth, y: y - height }, thickness: 0.5, color: BORDER_COLOR });
      labels.forEach((line, i) => text(line, x + 5, y - (height - labels.length * leading) / 2 - size - i * leading, true));
      lines.forEach((line, i) => text(line, x + labelWidth + 5, y - size - 2.5 - i * leading));
      y -= height;
    }
    y -= 15;
  };
  const columns = (items: [string, string][], height: number, withDividers = true) => {
    const columnWidth = width / items.length;
    page.drawRectangle({ x, y: y - height, width, height, borderColor: BORDER_COLOR, borderWidth: 0.5 });
    items.forEach(([label, value], index) => {
      if (withDividers && index) page.drawLine({ start: { x: x + index * columnWidth, y }, end: { x: x + index * columnWidth, y: y - height }, thickness: 0.5, color: BORDER_COLOR });
      text(label, x + index * columnWidth + 6, y - 10, false, 7.3, MUTED_COLOR);
      const lines = wrapText(value, fonts.regular, size, columnWidth - 12);
      if (lines.length > 1) throw new Error("The declaration metadata is too long for the reference layout.");
      text(value, x + index * columnWidth + 6, y - height + 6);
    });
    y -= height;
  };
  const standards = () => {
    heading("Applicable Standards");
    rows([
      { label: "EN ISO 12100:2010", value: "Safety of machinery - General principles for design, risk assessment and risk reduction." },
      { label: "EN ISO 4414:2010", value: "Pneumatic fluid power - General rules and safety requirements (as applicable)." },
      { label: "EN ISO 4126-1", value: "Safety devices for protection against excessive pressure - Safety valves (PRV)." },
    ], 112);
  };
  const marking = () => {
    heading("CE Marking");
    const scale = Math.min(54 / ce.width, 38 / ce.height);
    page.drawImage(ce, { x: x + 14, y: y - 42, width: ce.width * scale, height: ce.height * scale });
    text("2810", x + 2, y - 51, true, 9.2);
    drawWrappedText({ page, text: receiver
      ? "The CE marking followed by Notified Body number 2810 is affixed to the air receiver data plate."
      : `Marking affixed to the product data plate. The Notified Body number (2810) accompanies the CE marking by virtue of the PED production-phase conformity assessment (${catIII ? "Module C2" : "Module A2"}).`,
      x: x + 87, y: y - 11, maxWidth: width - 87, font: fonts.regular, size, lineHeight: leading });
    y -= 68;
  };
  const valve = (highPressure: boolean) => `Pressure relief valve Goetze GOE ${highPressure ? "812" : "810"} DN15, set pressure ${highPressure ? "12" : "8.6"} bar (ACL part no. ${highPressure ? "SP000784" : "SP000780"}) - CE marked by its manufacturer, Goetze KG Armaturen, Ludwigsburg, Germany, under Directive 2014/68/EU, Category IV, Module B + D; EU-type examination ${highPressure ? "01 202 642/B-15 2003.07" : "as stated in the manufacturer's EU Declaration of Conformity (series 810/410)"}, Notified Body TÜV Rheinland Industrie Service GmbH (0035). Covered by the manufacturer's own EU Declaration of Conformity.`;

  page.drawText(receiver ? "EU DECLARATION OF CONFORMITY" : "EC / EU DECLARATION OF CONFORMITY", { x, y: 782, font: fonts.display, size: 16, color: BRAND_GREEN });
  text(`Applied Concepts Ltd. | ${address}`, x, 767, true, 7.5, MUTED_COLOR);
  const logoScale = Math.min(63 / logo.width, 63 / logo.height);
  page.drawImage(logo, { x: x + width - 63, y: 740, width: logo.width * logoScale, height: logo.height * logoScale });
  page.drawLine({ start: { x, y: 733 }, end: { x: x + width, y: 733 }, thickness: 0.5, color: MUTED_COLOR });
  if (receiver) {
    text(`Pressure Equipment Directive 2014/68/EU - Annex IV${manual ? " · Owner's Manual copy" : ""}`, x, y - 1, true, 7.5, MUTED_COLOR);
    y -= 10;
  }
  columns([["Declaration No.", number], ["Revision", revision], ["Date of issue", issueDate]], 32);
  y -= 14;
  paragraph(receiver
    ? "This declaration of conformity is issued under the sole responsibility of the manufacturer. The pressure equipment described below is in conformity with the relevant Union harmonisation legislation: Directive 2014/68/EU of the European Parliament and of the Council of 15 May 2014 on the harmonisation of the laws of the Member States relating to the making available on the market of pressure equipment." + (manual ? " This declaration applies to each 32 L air receiver identified by the serial number on its data plate." : "")
    : `Applied Concepts Ltd., ${address}, hereby declares under its sole responsibility that the equipment identified below is in conformity with all the relevant provisions of the Union harmonisation legislation listed in this declaration. This declaration relates exclusively to the equipment in the state in which it was placed on the market and excludes components added or operations carried out subsequently by the user.` + (manual ? " This declaration applies to each unit identified by the serial number on its data plate." : ""));
  y -= 6;
  heading("Manufacturer");
  rows([{ label: "Company", value: "Applied Concepts Ltd." }, { label: "Address", value: address }]);
  heading(receiver ? "Object of the Declaration - Pressure Equipment" : "Object of the Declaration - Equipment Identification");
  if (receiver) {
    rows([
      { label: "Description", value: "Compressed-air receiver (welded steel pressure vessel)" },
      { label: "Model / type", value: identity.modelType },
      { label: "Serial number", value: manual ? "As stated on the air receiver data plate" : stringValue(data.serialNumber) },
      { label: "Year of manufacture", value: manual ? "As stated on the air receiver data plate" : stringValue(data.yearOfConstruction) },
      { label: "Fitted to", value: manual ? "PTO Compressor VM350 (VM-A-0001)" : `PTO Compressor VM350, serial no. ${compressorSerial}` },
    ]);
    heading("Pressure Equipment Data");
    rows([
      { label: "Maximum allowable pressure PS", value: "12 bar" },
      { label: "Allowable temperature TS", value: "-10 °C / +80 °C" },
      { label: "Volume V", value: "32 L" }, { label: "Test pressure PT", value: "20 bar" },
      { label: "Fluid", value: "Compressed air - Group 2" }, { label: "PED category", value: "II (Annex II, Table 2)" },
    ], 147);
    heading("Conformity Assessment Procedure");
    rows([
      { label: "Module", value: "Module A2 - Internal production control plus supervised pressure equipment checks at random intervals (Annex III)." },
      { label: "Notified Body", value: NOTIFIED_BODY },
      { label: "Intervention", value: "Supervision of the final assessment (Module A2)." },
      { label: "Certificate No.", value: `${RECEIVER_CERTIFICATE} (issued 16 October 2026)` },
    ]);
    heading("Harmonised Standards / Technical Specifications");
    y -= 8;
    paragraph("No harmonised standard has been applied in full. Conformity with the Essential Safety Requirements of Annex I of Directive 2014/68/EU has been demonstrated by the manufacturer's design and production documentation.");
    y -= 6;
    marking();
  } else {
    rows(manual ? [
      { label: "Description / function", value: "Mobile abrasive blast machine" },
      { label: "Models / type", value: catIII ? "140 L (BP-A-4000) and 200 L (BP-A-5000) - PS 8.6 bar; BP200LX (BP-A-5200) - PS 12 bar" : "BP40L (BP-A-2000), BP100L (BP-A-3000), BP-A-6000" },
      { label: "Maximum allowable pressure PS", value: catIII ? "8.6 bar (BP-A-4000, BP-A-5000); 12 bar (BP-A-5200)" : "8.6 bar" },
      { label: "Serial number", value: "As stated on the product data plate" },
      { label: "Year of manufacture", value: "As stated on the product data plate" },
    ] : [
      { label: "Description / function", value: "Blast Machine" },
      { label: "Commercial name", value: identity.commercialName },
      { label: "Model / type", value: identity.modelType },
      { label: "Serial number", value: stringValue(data.serialNumber) },
      { label: "Year of manufacture", value: stringValue(data.yearOfConstruction) },
    ]);
    heading("Applicable Union Harmonisation Legislation");
    y -= 8;
    paragraph("- Directive 2006/42/EC of the European Parliament and of the Council of 17 May 2006 on machinery (Machinery Directive).\n- Directive 2014/68/EU of the European Parliament and of the Council of 15 May 2014 on the harmonisation of the laws of the Member States relating to the making available on the market of pressure equipment (PED).");
    y -= 6;
    heading("Conformity Assessment Procedure");
    rows([
      { label: "Machinery Directive 2006/42/EC", value: "Internal checks on the manufacture of machinery - Annex VIII (manufacturer's self-assessment). The equipment is not listed in Annex IV of the Directive; no Notified Body is required for the machinery conformity assessment." },
      { label: "Pressure Equipment Directive 2014/68/EU", value: `PED category: Cat. ${catIII ? "III" : "II"}\nModule(s): ${catIII ? "Module B (production type) + Module C2" : "Module A2"}\nNotified Body: ${NOTIFIED_BODY}${catIII ? `\nEU-type examination certificate (Module B): ${CAT_III_CERTIFICATE}` : ""}` },
    ]);
    heading("Constituent Pressure Equipment of the Assembly (PED Annex IV)");
    rows([
      { label: "Pressure vessel (pot body)", value: catIII
        ? `${manual ? "Pot body (drawings BP-A-4000 / BP-A-5000 / BP-W-5200)" : product.productCode === "BP-A-5200" ? "BP-W-5200" : product.productCode} - PED Cat. III, Module B (production type) + Module C2, Notified Body 2810, EU-type examination certificate ${CAT_III_CERTIFICATE}.`
        : "Pot body - PED Cat. II, Module A2, Notified Body 2810." },
      ...(manual && catIII ? [
        { label: "Safety accessory - BP-A-4000, BP-A-5000", value: valve(false) },
        { label: "Safety accessory - BP-A-5200", value: valve(true) },
      ] : [{ label: "Safety accessory", value: valve(reference.pressure === "12") }]),
    ]);
    if (!(manual && catIII)) marking();
    if (!manual) standards();
  }
  if (y < 40) throw new Error("The equipment details are too long for the approved two-page layout.");
  page = pages[1]; y = 800;
  if (!receiver) {
    if (manual && catIII) marking();
    if (manual) standards();
    heading("Person Authorised to Compile the Technical File");
    rows([{ label: "Name", value: "Mark Clendennen" }, { label: "Position", value: "Managing Director" },
      { label: "Address", value: `${address} (established in the European Union).` }]);
  }
  heading("Signed for and on Behalf of Applied Concepts Ltd.");
  columns([["Place of issue", "Birr, Co. Offaly, Ireland"], ["Name", "Mark Clendennen"], ["Position", "Managing Director"]], 32, false);
  page.drawRectangle({ x, y: y - 60, width, height: 60, borderColor: BORDER_COLOR, borderWidth: 0.5 });
  text("Date", x + 6, y - 12, false, 7.3, MUTED_COLOR);
  text("Signature", x + width / 3 + 6, y - 12, false, 7.3, MUTED_COLOR);
  text(issueDate, x + 6, y - 54);
  if (signature) {
    const scale = Math.min(140 / signature.width, 36 / signature.height);
    page.drawImage(signature, { x: x + width / 3 + 6, y: y - 52, width: signature.width * scale, height: signature.height * scale });
  }
  for (const [index, target] of pages.entries()) {
    page = target;
    page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: 42, color: BRAND_GREEN });
    text("www.appliedpi.com", x, 17, false, 8, WHITE);
    const pageText = `Page ${index + 1} of 2`;
    text(pageText, (PAGE_WIDTH - fonts.regular.widthOfTextAtSize(pageText, 8)) / 2, 17, false, 8, WHITE);
    if (receiver) {
      const website = "www.ptocompressors.com";
      text(website, x + width - fonts.regular.widthOfTextAtSize(website, 8), 17, false, 8, WHITE);
    }
    if (isTest) text("TEST / NOT FOR ISSUE - UNSIGNED", x, index === 0 ? 744 : 820, true, 9, MUTED_COLOR);
  }
  return pdf.save();
}

export async function buildEuDeclarationOfConformityPdf(
  type: EuDeclarationCertificationType,
  data: EuDeclarationInput,
  settings: CertificationSettings,
  productCertification: EuDeclarationProductCertification | null,
  signaturePng?: Uint8Array,
  options: { isTest?: boolean } = {}
): Promise<Uint8Array> {
  if (!options.isTest && productCertification?.issueEnabled === false) {
    throw new Error("Signed issuance is blocked for this product pending certification.");
  }
  if (!options.isTest && productCertification && ["cat-ii", "cat-iii"].includes(productCertification.pedCategory) && !productCertification.certificateNo.trim() && !allowsBlankDeclarationCertificate(productCertification)) {
    throw new Error("An approved PED certificate number is required for signed issuance.");
  }
  if (supplementalDeclarationProfile(type)) {
    return buildSupplementalDeclarationPdf(type, data, productCertification, signaturePng, options);
  }
  if (productCertification && declarationReference(productCertification)) {
    const error = !options.isTest && referenceConfigurationError(productCertification);
    if (error) throw new Error(error);
    return buildReferenceDeclarationPdf(type, data, productCertification, signaturePng, Boolean(options.isTest));
  }
  const declaration = resolveDeclaration(
    type,
    data,
    settings,
    productCertification
  );
  const pdfDoc = await PDFDocument.create();
  const fonts = await loadFontSet(pdfDoc);
  const logo = await embedOptionalJpg(pdfDoc, "pdf/assets/Appliedlogo.jpg");
  const ceLogo = await embedOptionalPng(pdfDoc, "pdf/assets/ce-logo.png");
  const signature = !options.isTest && signaturePng ? await pdfDoc.embedPng(signaturePng) : null;
  const showPtoWebsite = productCertification?.productType === "pto-compressor" || productCertification?.productType === "air-receiver";

  let page1: PDFPage;
  let y = TOP_Y;
  // Preserve the approved spacing when it fits; reclaim section gaps for longer
  // identities. Never shrink text or move the CE block into the footer/page two.
  for (const compact of [false, true]) {
    page1 = pdfDoc.addPage(PAGE_SIZE);
    drawHeader(page1, fonts, 1, logo);
    drawFooter(page1, fonts, 1, showPtoWebsite);
    y = TOP_Y;
    y = drawInfoBar(page1, declaration, fonts, y);
    if (compact) y += 4;

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

    y = drawSectionTitle(page1, "Manufacturer", y, fonts, compact ? 12 : 18);
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
      compact,
    });
    y -= compact ? 14 : 16;

    y = drawSectionTitle(
      page1,
      "Object of the Declaration - Equipment Identification",
      y,
      fonts,
      compact ? 12 : 18
    );
    y = drawKeyValueRows({
      page: page1,
      rows: declaration.equipmentRows,
      x: MARGIN_X,
      y,
      width: CONTENT_WIDTH,
      labelWidth: 128,
      fonts,
      compact,
    });
    y -= compact ? 14 : 16;

    y = drawLegislation(page1, y, fonts, compact);

    y = drawSectionTitle(page1, "Conformity Assessment Procedure", y, fonts, compact ? 12 : 18);
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
      compact,
    });
    y -= 14;

    const ceBottom = drawCeMarking({
      page: page1,
      y,
      fonts,
      ceLogo,
      note: declaration.ceNote,
    });
    if (ceBottom >= BOTTOM_Y) break;
    if (compact) {
      throw new Error("The equipment details are too long to fit above the page-one CE/footer area. Shorten the declaration number, name, model or certificate number.");
    }
    pdfDoc.removePage(0);
  }

  const page2 = pdfDoc.addPage(PAGE_SIZE);
  drawHeader(page2, fonts, 2, logo);
  drawFooter(page2, fonts, 2, showPtoWebsite);
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

  if (y <= BOTTOM_Y + 120) {
    throw new Error("The signature section does not fit on page two.");
  }
  drawSignatureBlock(page2, y, fonts, signature);

  if (options.isTest) {
    for (const page of pdfDoc.getPages()) {
      page.drawText("TEST / NOT FOR ISSUE - UNSIGNED", {
        x: MARGIN_X, y: TOP_Y + 15, font: fonts.bold, size: 10, color: MUTED_COLOR,
      });
    }
  }

  return pdfDoc.save();
}
