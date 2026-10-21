import JSZip from "jszip";
import {
  parseDelimited,
  rowsFromCells,
  type ImportImage,
  type ImportRow,
} from "./import-model";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 80 * 1024 * 1024;
const children = (node: Document | Element, name: string) =>
  Array.from(node.getElementsByTagNameNS("*", name));
function xml(text: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    throw new Error("This workbook contains unsupported XML declarations.");
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length)
    throw new Error("The workbook contains invalid XML.");
  return doc;
}
function resolvePath(base: string, target: string) {
  const parts = target.startsWith("/") ? [] : base.split("/").slice(0, -1);
  for (const part of target.split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return parts.join("/");
}
function relPath(path: string) {
  const parts = path.split("/");
  const file = parts.pop();
  return [...parts, "_rels", `${file}.rels`].join("/");
}
function relId(element: Element) {
  return element.getAttributeNS(
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "id",
  );
}

export interface ParsedImport {
  rows: ImportRow[];
  sheetName: string;
  notices: string[];
  urls: string[];
}
export async function parseImportFile(file: File): Promise<ParsedImport> {
  if (file.size > MAX_FILE_BYTES)
    throw new Error("Choose a file smaller than 20 MB.");
  if (/\.csv$/i.test(file.name)) {
    const rows = rowsFromCells(
      parseDelimited(await file.text()).map((values, i) => ({
        sourceRow: i + 1,
        values,
      })),
    );
    return {
      rows,
      sheetName: "CSV",
      notices: ["CSV images can be attached by filename using Add images."],
      urls: [],
    };
  }
  if (!/\.xlsx$|\.xlsm$/i.test(file.name))
    throw new Error("Choose an .xlsx, .xlsm or .csv file.");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  // JSZip exposes central-directory sizes before expanding members. Refuse large archives.
  const entries = Object.values(zip.files);
  const expandedSize = entries.reduce(
    (size, entry) =>
      size +
      ((entry as unknown as { _data?: { uncompressedSize?: number } })._data
        ?.uncompressedSize || 0),
    0,
  );
  if (entries.length > 10000 || expandedSize > MAX_EXPANDED_BYTES)
    throw new Error(
      "The expanded workbook is too large. Split it into smaller files.",
    );
  async function read(path: string, optional = false) {
    const entry = zip.file(path);
    if (!entry) {
      if (optional) return null;
      throw new Error(`The workbook is missing ${path}.`);
    }
    return xml(await entry.async("string"));
  }
  const relationshipMap = async (path: string) => {
    const doc = await read(relPath(path), true);
    return new Map(
      doc
        ? children(doc, "Relationship")
            .filter((e) => e.getAttribute("TargetMode") !== "External")
            .map((e) => [
              e.getAttribute("Id"),
              resolvePath(path, e.getAttribute("Target") || ""),
            ])
        : [],
    );
  };
  const workbook = await read("xl/workbook.xml");
  const sheets = children(workbook!, "sheet");
  const firstSheet = sheets[0];
  if (!firstSheet) throw new Error("There is no worksheet in this workbook.");
  const workbookRels = await relationshipMap("xl/workbook.xml");
  const sheetPath = workbookRels.get(relId(firstSheet));
  if (!sheetPath) throw new Error("The worksheet could not be located.");
  const [
    sheet,
    shared,
    metadata,
    richValues,
    richRels,
    richStructure,
    imageRels,
  ] = await Promise.all([
    read(sheetPath),
    read("xl/sharedStrings.xml", true),
    read("xl/metadata.xml", true),
    read("xl/richData/rdrichvalue.xml", true),
    read("xl/richData/richValueRel.xml", true),
    read("xl/richData/rdrichvaluestructure.xml", true),
    relationshipMap("xl/richData/richValueRel.xml"),
  ]);
  const strings = shared
    ? children(shared, "si").map((si) =>
        children(si, "t")
          .map((t) => t.textContent || "")
          .join(""),
      )
    : [];
  const valueMetadata = metadata
    ? children(metadata, "valueMetadata")[0]
    : null;
  const future = metadata
    ? children(metadata, "futureMetadata").find(
        (e) => e.getAttribute("name") === "XLRICHVALUE",
      )
    : null;
  const richRecords = richValues ? children(richValues, "rv") : [];
  const richRelationships = richRels ? children(richRels, "rel") : [];
  const structures = richStructure ? children(richStructure, "s") : [];
  const urls: string[] = [];
  const images = new Map<string, ImportImage>();
  let unresolved = 0;
  async function getImage(path: string | undefined) {
    if (!path || !/\.(png|jpe?g|webp)$/i.test(path)) return undefined;
    if (images.has(path)) return images.get(path);
    const entry = zip.file(path);
    if (!entry) return undefined;
    const bytes = await entry.async("uint8array");
    if (bytes.length > 5 * 1024 * 1024) return undefined;
    const ext = path.split(".").pop()!.toLowerCase();
    const blob = new Blob([bytes as BlobPart], {
      type:
        ext === "png"
          ? "image/png"
          : ext === "webp"
            ? "image/webp"
            : "image/jpeg",
    });
    const image = {
      url: URL.createObjectURL(blob),
      blob,
      name: path.split("/").pop()!,
    };
    urls.push(image.url);
    images.set(path, image);
    return image;
  }
  try {
    const cells: {
      sourceRow: number;
      values: string[];
      image?: ImportImage;
    }[] = [];
    for (const row of children(sheet!, "row")) {
      const values: string[] = [];
      let image: ImportImage | undefined;
      for (const cell of Array.from(row.children)) {
        const letters = (cell.getAttribute("r") || "").match(/^[A-Z]+/)?.[0];
        if (!letters) continue;
        const col =
          [...letters].reduce(
            (n, char) => n * 26 + char.charCodeAt(0) - 64,
            0,
          ) - 1;
        if (col > 100) continue;
        const raw = children(cell, "v")[0]?.textContent || "";
        const type = cell.getAttribute("t");
        values[col] =
          type === "s"
            ? strings[Number(raw)] || ""
            : type === "inlineStr"
              ? children(cell, "t")
                  .map((t) => t.textContent || "")
                  .join("")
              : raw;
        if (cell.hasAttribute("vm")) {
          const record =
            valueMetadata?.children[Number(cell.getAttribute("vm")) - 1];
          const rc = record && children(record, "rc")[0];
          const futureRecord =
            rc && future?.children[Number(rc.getAttribute("v"))];
          const rvb = futureRecord && children(futureRecord, "rvb")[0];
          const rich = rvb && richRecords[Number(rvb.getAttribute("i"))];
          const structure = rich && structures[Number(rich.getAttribute("s"))];
          const key = structure
            ? children(structure, "k").findIndex(
                (k) => k.getAttribute("n") === "_rvRel:LocalImageIdentifier",
              )
            : -1;
          const relIndex =
            rich && key >= 0
              ? children(rich, "v")[key]?.textContent
              : undefined;
          const relationship =
            relIndex != null ? richRelationships[Number(relIndex)] : undefined;
          image = await getImage(
            relationship ? imageRels.get(relId(relationship)) : undefined,
          );
          if (!image) unresolved++;
        }
      }
      cells.push({ sourceRow: Number(row.getAttribute("r")), values, image });
    }
    const notices: string[] = [];
    if (sheets.length > 1)
      notices.push(
        `Using the first worksheet, “${firstSheet.getAttribute("name")}”. Other worksheets are not included.`,
      );
    if (children(sheet!, "drawing").length)
      notices.push(
        "Floating images are not supported in this preview. Attach images separately by filename.",
      );
    if (unresolved)
      notices.push(
        `${unresolved} embedded image references could not be loaded. Check the rows marked No image.`,
      );
    return {
      rows: rowsFromCells(cells),
      sheetName: firstSheet.getAttribute("name") || "Sheet 1",
      notices,
      urls,
    };
  } catch (error) {
    urls.forEach((url) => URL.revokeObjectURL(url));
    throw error;
  }
}

// Export text safely when the review package is opened in Excel.
export function csvCell(value: string) {
  const safe = /^[\s]*[=+@-]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
export async function exportReview(rows: ImportRow[]) {
  const zip = new JSZip();
  const header = [
    "Source Row",
    "Action",
    "Existing Card ID",
    "Part Number",
    "Description",
    "Location",
    "Preferred Supplier",
    "Order Quantity",
    "Lead Time",
    "Header Colour",
    "Image Filename",
  ];
  const lines = [header.map(csvCell).join(",")];
  rows.forEach((row) => {
    const imageName = row.image
      ? `row-${row.sourceRow}.${row.image.blob.type === "image/png" ? "png" : row.image.blob.type === "image/webp" ? "webp" : "jpg"}`
      : "";
    if (row.image) zip.file(`images/${imageName}`, row.image.blob);
    lines.push(
      [
        String(row.sourceRow),
        row.decision,
        row.targetId || "",
        row.part_no,
        row.description,
        row.location,
        row.preferred_supplier,
        row.order_quantity,
        row.lead_time,
        row.header_color,
        imageName,
      ]
        .map(csvCell)
        .join(","),
    );
  });
  zip.file("reviewed-batch.csv", "\uFEFF" + lines.join("\r\n"));
  zip.file(
    "README.txt",
    "Kanban import review\nThis package records proposed changes only. No database records have been created or updated.\nBlank values are intentional and must be reviewed before a future import. Existing images are not included.\n",
  );
  return zip.generateAsync({ type: "blob" });
}
