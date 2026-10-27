import { isKanbanHeaderColor } from "./colors";

export const MAX_IMPORT_ROWS = 2000;
export const EDITABLE_FIELDS = [
  "part_no",
  "description",
  "location",
  "preferred_supplier",
  "order_quantity",
  "lead_time",
  "header_color",
] as const;
export type ImportField = (typeof EDITABLE_FIELDS)[number];
export type ImportDecision = "create" | "update" | "skip";
export interface ImportImage {
  url: string;
  name: string;
  blob: Blob;
}
export interface ImportRow {
  id: string;
  sourceRow: number;
  part_no: string;
  description: string;
  location: string;
  preferred_supplier: string;
  order_quantity: string;
  lead_time: string;
  header_color: string;
  image?: ImportImage;
  imageName?: string;
  decision: ImportDecision;
  targetId?: string;
}
export interface ExistingCard {
  id: string;
  part_no: string;
  location: string;
  header_color: string;
  description: string | null;
  preferred_supplier: string | null;
  order_quantity: number | null;
  lead_time: string | null;
}
export interface ExistingProduct {
  id: string;
  product_code: string | null;
  product_title: string | null;
}
export interface ImportReference {
  cards: ExistingCard[];
  products: ExistingProduct[];
}
export type MatchIndex = ReturnType<typeof buildMatchIndex>;
export const normalizePart = (value: string) => value.trim().toUpperCase();
export function normalizeLocation(value: string) {
  const location = value
    .trim()
    .toUpperCase()
    .replace(/^MAIN\/STOCK\/BRSTOCK\//, "");
  const match = location.match(/^UA(\d+)[/-]R?(\d+)[/-]C?(\d+)$/);
  return match
    ? `UA${Number(match[1])}/R${Number(match[2])}-C${Number(match[3])}`
    : location;
}
export function locationGroup(location: string) {
  return (
    location
      .trim()
      .replace(/^Main\/Stock\/BRStock\//i, "")
      .match(/^[^/\s-]+/)?.[0]
      ?.toUpperCase() || "Unassigned"
  );
}
export function buildMatchIndex(reference: ImportReference) {
  const cards = new Map<string, ExistingCard[]>();
  const products = new Map<string, ExistingProduct[]>();
  for (const card of reference.cards) {
    const key = normalizePart(card.part_no);
    cards.set(key, [...(cards.get(key) || []), card]);
  }
  for (const product of reference.products) {
    if (!product.product_code?.trim()) continue;
    const key = normalizePart(product.product_code);
    products.set(key, [...(products.get(key) || []), product]);
  }
  return { cards, products };
}
export function getMatches(row: ImportRow, index: MatchIndex) {
  const cards = index.cards.get(normalizePart(row.part_no)) || [];
  const products = index.products.get(normalizePart(row.part_no)) || [];
  return {
    cards,
    products,
    sameLocation: cards.filter(
      (c) => normalizeLocation(c.location) === normalizeLocation(row.location),
    ),
  };
}
export function applyDefaultDecisions(rows: ImportRow[], index: MatchIndex) {
  return rows.map((row) => ({
    ...row,
    decision: getMatches(row, index).cards.length
      ? ("skip" as const)
      : ("create" as const),
  }));
}
export function rowIssues(row: ImportRow) {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!row.part_no.trim()) errors.push("Part number is required");
  if (!row.location.trim()) errors.push("Location is required");
  if (
    row.order_quantity.trim() &&
    (!/^\d+$/.test(row.order_quantity.trim()) ||
      !Number.isSafeInteger(Number(row.order_quantity)) ||
      Number(row.order_quantity) > 2147483647)
  )
    errors.push("Quantity must be a whole number from 0 to 2,147,483,647");
  if (!isKanbanHeaderColor(row.header_color))
    errors.push("Choose a header colour");
  if (!row.description.trim()) warnings.push("No description");
  if (!row.image) warnings.push("No image supplied");
  if (!row.preferred_supplier.trim()) warnings.push("No supplier supplied");
  if (!row.order_quantity.trim()) warnings.push("Quantity left blank");
  if (!row.lead_time.trim()) warnings.push("Lead time left blank");
  return { errors, warnings };
}
export function assessBatch(rows: ImportRow[], index: MatchIndex) {
  const keys = new Map<string, number>();
  const targets = new Map<string, number>();
  for (const row of rows.filter((r) => r.decision !== "skip")) {
    const key = `${normalizePart(row.part_no)}|${normalizeLocation(row.location)}|${row.header_color}`;
    keys.set(key, (keys.get(key) || 0) + 1);
    if (row.decision === "update" && row.targetId)
      targets.set(row.targetId, (targets.get(row.targetId) || 0) + 1);
  }
  return rows.map((row) => {
    const matches = getMatches(row, index);
    const { errors, warnings } = rowIssues(row);
    const key = `${normalizePart(row.part_no)}|${normalizeLocation(row.location)}|${row.header_color}`;
    if (row.decision !== "skip" && (keys.get(key) || 0) > 1)
      errors.push("Repeated part, location and colour in this batch");
    if (
      row.decision === "update" &&
      !matches.cards.some((c) => c.id === row.targetId)
    )
      errors.push("Choose the existing card to update");
    if (
      row.decision === "update" &&
      row.targetId &&
      (targets.get(row.targetId) || 0) > 1
    )
      errors.push("More than one row updates this card");
    return { row, matches, errors, warnings };
  });
}

// Handles quoted commas, line breaks and doubled quotes. Also used for TSV paste.
export function parseDelimited(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') {
        value += '"';
        i++;
      } else if (quoted || value === "") quoted = !quoted;
      else value += char;
    } else if (char === delimiter && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else value += char;
  }
  if (quoted)
    throw new Error(
      "An opening quote in the spreadsheet has no closing quote.",
    );
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

const aliases: Record<string, ImportField | "imageName"> = {
  product: "part_no",
  partnumber: "part_no",
  partno: "part_no",
  productcode: "part_no",
  sku: "part_no",
  description: "description",
  productdescription: "description",
  location: "location",
  supplier: "preferred_supplier",
  preferredsupplier: "preferred_supplier",
  orderquantity: "order_quantity",
  orderqty: "order_quantity",
  quantity: "order_quantity",
  leadtime: "lead_time",
  headercolour: "header_color",
  headercolor: "header_color",
  imagefilename: "imageName",
  imagename: "imageName",
};
export function rowsFromCells(
  cells: { sourceRow: number; values: string[]; image?: ImportImage }[],
): ImportRow[] {
  const headerAt = cells.findIndex((row) => row.values.some((v) => v.trim()));
  if (headerAt < 0) throw new Error("The sheet is empty.");
  const fields = cells[headerAt].values.map(
    (v) => aliases[v.toLowerCase().replace(/[^a-z0-9]/g, "")],
  );
  if (!fields.includes("part_no") || !fields.includes("location"))
    throw new Error(
      "The first row needs Product (or Part Number) and Location columns.",
    );
  const known = fields.filter(Boolean);
  if (new Set(known).size !== known.length)
    throw new Error(
      "Two columns map to the same field. Keep one column per field.",
    );
  const rows: ImportRow[] = [];
  for (const cell of cells.slice(headerAt + 1)) {
    if (!cell.values.some((v) => v.trim())) continue;
    const row: ImportRow = {
      id: `source-${cell.sourceRow}`,
      sourceRow: cell.sourceRow,
      part_no: "",
      description: "",
      location: "",
      preferred_supplier: "",
      order_quantity: "",
      lead_time: "",
      header_color: "orange",
      decision: "create",
      image: cell.image,
    };
    fields.forEach((field, i) => {
      if (field) row[field] = (cell.values[i] || "").trim();
    });
    row.header_color = row.header_color.toLowerCase();
    row.location = row.location.replace(/^Main\/Stock\/BRStock\//i, "");
    rows.push(row);
  }
  if (!rows.length) throw new Error("No product rows were found.");
  if (rows.length > MAX_IMPORT_ROWS)
    throw new Error(
      `This review supports up to ${MAX_IMPORT_ROWS.toLocaleString()} rows. Split the workbook into smaller batches.`,
    );
  return rows;
}
