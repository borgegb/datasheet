import type { Font, Schema, Template } from "@pdfme/common";
import { getDynamicHeightsForTable } from "@pdfme/schemas";

type InfoTable = Schema & {
  headWidthPercentages: number[];
  bodyStyles: {
    fontName: string;
    fontSize: number;
    lineHeight: number;
    characterSpacing: number;
    fontColor: string;
    borderColor: string;
    borderWidth: { top: number; right: number; bottom: number; left: number };
    padding: { top: number; right: number; bottom: number; left: number };
  };
};

export class KanbanPdfLayoutError extends Error {
  constructor(partNo: string) {
    super(
      `Card ${partNo} has too much text for one A6 page. Shorten its description, supplier or other long fields and try again.`
    );
    this.name = "KanbanPdfLayoutError";
  }
}

/** Measure actual text insets, then render fixed cells instead of a paginating table. */
export async function fitKanbanTemplate(
  source: Template,
  productInfo: string[][],
  font: Font,
  partNo: string
): Promise<Template> {
  const template = structuredClone(source);
  if (typeof template.basePdf !== "object" || !("height" in template.basePdf)) {
    throw new Error("Kanban cards require a sized page template.");
  }
  const info = template.schemas[0].find(s => s.name === "productInfo") as InfoTable;
  const picture = template.schemas[0].find(s => s.name === "productImage");
  if (!info || !picture) throw new Error("Kanban template is missing its image or information table.");

  const originalImageHeight = picture.height;
  const originalTableY = info.position.y;
  const originalPadding = { ...info.bodyStyles.padding };
  const originalFontSize = info.bodyStyles.fontSize;
  const candidates = [
    { fontSize: originalFontSize, padding: originalPadding.top, imageHeight: originalImageHeight },
    ...Array.from({ length: 13 }, (_, i) => ({
      fontSize: originalFontSize - i * 0.5,
      padding: 1.2,
      imageHeight: originalImageHeight,
    })).filter(c => c.fontSize >= 10),
    ...[10, 9.5, 9].map(fontSize => ({ fontSize, padding: 1.2, imageHeight: 30 })),
  ];
  const cache = new Map<string | number, unknown>();
  for (const candidate of candidates) {
    picture.height = candidate.imageHeight;
    info.position.y = originalTableY - (originalImageHeight - picture.height);
    info.bodyStyles.fontSize = candidate.fontSize;
    info.bodyStyles.padding = {
      ...originalPadding,
      top: candidate.padding,
      bottom: candidate.padding,
    };
    const { padding, borderWidth } = info.bodyStyles;
    const widths = info.headWidthPercentages.map(percent => info.width * percent / 100);
    const textWidths = widths.map(width => width - padding.left - padding.right - borderWidth.left - borderWidth.right);
    // pdfme 5's table measurement ignores horizontal padding/borders when
    // wrapping. Measure narrower columns to match the actual text boxes.
    // Labels retain the template's font size on every card. Measure each
    // column separately so only right-hand values adapt to longer content.
    const columnHeights = await Promise.all(textWidths.map((width, columnIndex) =>
      getDynamicHeightsForTable(JSON.stringify(productInfo.map(row => [row[columnIndex]])), {
        schema: {
          ...info, width, head: [""], headWidthPercentages: [100],
          bodyStyles: { ...info.bodyStyles, fontSize: columnIndex === 0 ? originalFontSize : candidate.fontSize },
        },
        basePdf: template.basePdf,
        options: { font },
        _cache: cache,
      })
    ));
    const heights = productInfo.map((_, rowIndex) =>
      Math.max(...columnHeights.map(heights => heights[rowIndex + 1])) + borderWidth.top + borderWidth.bottom
    );
    const height = heights.reduce((sum, row) => sum + row, 0);
    // Keep a physical bottom margin, including space for the table border.
    const bottom = template.basePdf.height - Math.max(2, template.basePdf.padding[2]);
    if (Number.isFinite(height) && info.position.y + height <= bottom) {
      const cells: Schema[] = [];
      let y = info.position.y;
      productInfo.forEach((row, rowIndex) => {
        let x = info.position.x;
        row.forEach((content, columnIndex) => {
          const width = widths[columnIndex];
          const rowHeight = heights[rowIndex];
          cells.push({
            name: `cell-border-${rowIndex}-${columnIndex}`,
            type: "rectangle", readOnly: true, content: "",
            position: { x, y }, width, height: rowHeight,
            borderWidth: 0.2, borderColor: info.bodyStyles.borderColor, color: "",
          });
          cells.push({
            ...info.bodyStyles,
            fontSize: columnIndex === 0 ? originalFontSize : candidate.fontSize,
            name: `cell-text-${rowIndex}-${columnIndex}`,
            type: "text", readOnly: true, content,
            position: { x: x + padding.left + borderWidth.left, y: y + padding.top + borderWidth.top },
            width: textWidths[columnIndex],
            height: rowHeight - padding.top - padding.bottom - borderWidth.top - borderWidth.bottom,
            alignment: columnIndex === 0 ? "left" : "center",
            verticalAlignment: "middle",
            backgroundColor: "",
          });
          x += width;
        });
        y += heights[rowIndex];
      });
      template.schemas[0] = template.schemas[0].flatMap(schema => schema === info ? cells : [schema]);
      return template;
    }
  }
  throw new KanbanPdfLayoutError(partNo);
}
