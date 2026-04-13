import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { buildKanbanPdf } from "@/lib/pdf/kanban/buildKanbanPdf";
import {
  normalizeProductionKanbanBackRows,
  type ProductionKanbanBackRow,
} from "@/lib/production-kanban/back-rows";
import {
  DEFAULT_PRODUCTION_KANBAN_PDF_FORMAT,
  type ProductionKanbanPdfFormat,
} from "@/lib/production-kanban/pdf-format";

interface ProductionKanbanPdfCard {
  id: string;
  organization_id: string;
  part_no: string;
  description: string;
  location: string;
  order_quantity: number;
  preferred_supplier: string;
  lead_time: string;
  image_path?: string | null;
  footer_code: string;
  back_rows: ProductionKanbanBackRow[];
}

function mmToPoints(value: number) {
  return (value * 72) / 25.4;
}

function clampText(value: string, maxChars: number) {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxChars - 3))}...`;
}

function drawCellText(options: {
  page: PDFPage;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  align?: "left" | "center";
  font: PDFFont;
  size: number;
}) {
  const { page, text, x, y, width, height, align = "center", font, size } =
    options;
  const cleanedText = text.trim();
  if (!cleanedText) {
    return;
  }

  const displayText = clampText(
    cleanedText,
    Math.max(4, Math.floor(width / Math.max(size * 0.58, 1)))
  );
  const textWidth = font.widthOfTextAtSize(displayText, size);
  const textX = align === "center" ? x + (width - textWidth) / 2 : x + 4;
  const textY = y + (height - size) / 2 + 2;

  page.drawText(displayText, {
    x: Math.max(textX, x + 2),
    y: textY,
    size,
    font,
    color: rgb(0, 0, 0),
  });
}

async function buildBackPagePdf(card: ProductionKanbanPdfCard) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([mmToPoints(105), mmToPoints(148)]);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const contentWidth = mmToPoints(80);
  const contentHeight = mmToPoints(130);
  const contentX = (pageWidth - contentWidth) / 2;
  const contentY = (pageHeight - contentHeight) / 2;

  const headerHeight = mmToPoints(10);
  const footerHeight = mmToPoints(8);
  const bodyHeight = contentHeight - headerHeight - footerHeight;
  const rowHeight = bodyHeight / 18;
  const leftLocationWidth = mmToPoints(28);
  const leftQtyWidth = mmToPoints(12);
  const rightLocationWidth = mmToPoints(28);
  const rightQtyWidth = mmToPoints(12);

  const x1 = contentX + leftLocationWidth;
  const x2 = x1 + leftQtyWidth;
  const x3 = x2 + rightLocationWidth;
  const top = contentY + contentHeight;
  const headerBottom = top - headerHeight;
  const footerTop = contentY + footerHeight;

  page.drawRectangle({
    x: contentX,
    y: contentY,
    width: contentWidth,
    height: contentHeight,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1.3,
  });

  page.drawLine({
    start: { x: contentX, y: headerBottom },
    end: { x: contentX + contentWidth, y: headerBottom },
    thickness: 1,
    color: rgb(0, 0, 0),
  });

  page.drawLine({
    start: { x: contentX, y: footerTop },
    end: { x: contentX + contentWidth, y: footerTop },
    thickness: 1.3,
    color: rgb(0, 0, 0),
  });

  for (let index = 1; index < 18; index += 1) {
    const y = headerBottom - rowHeight * index;
    page.drawLine({
      start: { x: contentX, y },
      end: { x: contentX + contentWidth, y },
      thickness: 0.6,
      color: rgb(0, 0, 0),
    });
  }

  [x1, x3].forEach((x) => {
    page.drawLine({
      start: { x, y: footerTop },
      end: { x, y: top },
      thickness: 0.6,
      color: rgb(0, 0, 0),
    });
  });

  page.drawLine({
    start: { x: x2, y: footerTop },
    end: { x: x2, y: top },
    thickness: 1.5,
    color: rgb(0, 0, 0),
  });

  drawCellText({
    page,
    text: "Location",
    x: contentX,
    y: headerBottom,
    width: leftLocationWidth,
    height: headerHeight,
    font: boldFont,
    size: 11,
  });
  drawCellText({
    page,
    text: "Qty",
    x: x1,
    y: headerBottom,
    width: leftQtyWidth,
    height: headerHeight,
    font: boldFont,
    size: 11,
  });
  drawCellText({
    page,
    text: "Location",
    x: x2,
    y: headerBottom,
    width: rightLocationWidth,
    height: headerHeight,
    font: boldFont,
    size: 11,
  });
  drawCellText({
    page,
    text: "Qty",
    x: x3,
    y: headerBottom,
    width: rightQtyWidth,
    height: headerHeight,
    font: boldFont,
    size: 11,
  });

  const rows = normalizeProductionKanbanBackRows(card.back_rows);
  rows.forEach((row, index) => {
    const cellBottom = headerBottom - rowHeight * (index + 1);

    drawCellText({
      page,
      text: row.leftLocation,
      x: contentX,
      y: cellBottom,
      width: leftLocationWidth,
      height: rowHeight,
      align: "left",
      font: regularFont,
      size: 8.5,
    });
    drawCellText({
      page,
      text: row.leftQty,
      x: x1,
      y: cellBottom,
      width: leftQtyWidth,
      height: rowHeight,
      font: regularFont,
      size: 8.5,
    });
    drawCellText({
      page,
      text: row.rightLocation,
      x: x2,
      y: cellBottom,
      width: rightLocationWidth,
      height: rowHeight,
      align: "left",
      font: regularFont,
      size: 8.5,
    });
    drawCellText({
      page,
      text: row.rightQty,
      x: x3,
      y: cellBottom,
      width: rightQtyWidth,
      height: rowHeight,
      font: regularFont,
      size: 8.5,
    });
  });

  drawCellText({
    page,
    text: card.footer_code,
    x: contentX,
    y: contentY,
    width: contentWidth,
    height: footerHeight,
    font: regularFont,
    size: 10,
  });

  return pdfDoc;
}

async function buildA5FoldedPdf(options: {
  frontPdfBytes: Uint8Array;
  backPdfBytes: Uint8Array;
}) {
  const { frontPdfBytes, backPdfBytes } = options;
  const foldedPdf = await PDFDocument.create();
  const page = foldedPdf.addPage([mmToPoints(210), mmToPoints(148)]);
  const halfWidth = page.getWidth() / 2;
  const pageHeight = page.getHeight();

  const [embeddedFrontPage] = await foldedPdf.embedPdf(frontPdfBytes, [0]);
  const [embeddedBackPage] = await foldedPdf.embedPdf(backPdfBytes, [0]);

  page.drawPage(embeddedFrontPage, {
    x: 0,
    y: 0,
    width: halfWidth,
    height: pageHeight,
  });
  page.drawPage(embeddedBackPage, {
    x: halfWidth,
    y: 0,
    width: halfWidth,
    height: pageHeight,
  });

  return foldedPdf.save();
}

export async function buildProductionKanbanPdf(
  card: ProductionKanbanPdfCard,
  format: ProductionKanbanPdfFormat = DEFAULT_PRODUCTION_KANBAN_PDF_FORMAT
): Promise<Uint8Array> {
  const frontPdfBytes = await buildKanbanPdf(
    [
      {
        ...card,
        header_color: "brown",
      },
    ],
    { templateName: "brown" }
  );
  const backPdfBytes = await (await buildBackPagePdf(card)).save();

  if (format === "a5_folded") {
    return buildA5FoldedPdf({
      frontPdfBytes,
      backPdfBytes,
    });
  }

  const frontPdf = await PDFDocument.load(frontPdfBytes);
  const backPdf = await PDFDocument.load(backPdfBytes);
  const mergedPdf = await PDFDocument.create();

  const [frontPage] = await mergedPdf.copyPages(frontPdf, [0]);
  const [backPage] = await mergedPdf.copyPages(backPdf, [0]);

  mergedPdf.addPage(frontPage);
  mergedPdf.addPage(backPage);

  return mergedPdf.save();
}
