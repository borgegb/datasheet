export const PRODUCTION_KANBAN_PDF_FORMATS = [
  "a6_duplex",
  "a5_folded",
] as const;

export type ProductionKanbanPdfFormat =
  (typeof PRODUCTION_KANBAN_PDF_FORMATS)[number];

export const DEFAULT_PRODUCTION_KANBAN_PDF_FORMAT: ProductionKanbanPdfFormat =
  "a6_duplex";

export const PRODUCTION_KANBAN_PDF_FORMAT_OPTIONS: ReadonlyArray<{
  value: ProductionKanbanPdfFormat;
  label: string;
}> = [
  { value: "a6_duplex", label: "A6 Duplex" },
  { value: "a5_folded", label: "A5 Folded" },
];

export function normalizeProductionKanbanPdfFormat(
  value: unknown
): ProductionKanbanPdfFormat {
  return value === "a5_folded"
    ? "a5_folded"
    : DEFAULT_PRODUCTION_KANBAN_PDF_FORMAT;
}

export function getProductionKanbanPdfFormatLabel(
  format: ProductionKanbanPdfFormat
) {
  return format === "a5_folded" ? "A5 Folded" : "A6 Duplex";
}

export function getProductionKanbanPdfFormatToken(
  format: ProductionKanbanPdfFormat
) {
  return format === "a5_folded" ? "a5-folded" : "a6-duplex";
}
