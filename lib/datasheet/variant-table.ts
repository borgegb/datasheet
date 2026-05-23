export type VariantColumnDefinition = {
  key: string;
  label: string;
  weight: number;
  placeholder?: string;
  archivedAt?: string | null;
};

export const VARIANT_TABLE_COLUMN_OPTIONS: VariantColumnDefinition[] = [
  {
    key: "productCode",
    label: "Product Code",
    weight: 14,
    placeholder: "AL-A-0001",
  },
  {
    key: "description",
    label: "Description",
    weight: 42,
    placeholder: "Standard lance assembly",
  },
  { key: "weight", label: "Weight", weight: 14, placeholder: "3.5 kg" },
  { key: "length", label: "Length", weight: 14, placeholder: "1470 mm" },
  { key: "diameter", label: "Diameter", weight: 14, placeholder: "70 mm" },
  { key: "thread", label: "Thread", weight: 14, placeholder: "1/2 in BSP" },
  {
    key: "connection",
    label: "Connection",
    weight: 16,
    placeholder: "Claw coupling",
  },
  { key: "material", label: "Material", weight: 16, placeholder: "Aluminium" },
  {
    key: "pressureRating",
    label: "Pressure Rating",
    weight: 16,
    placeholder: "100 psi",
  },
  { key: "hoseSize", label: "Hose Size", weight: 14, placeholder: "1/2 in" },
  { key: "inlet", label: "Inlet", weight: 12, placeholder: "1/2 in" },
  { key: "outlet", label: "Outlet", weight: 12, placeholder: "70 mm" },
];

export type VariantColumnKey = string;

export type StandardSpecRow = {
  label: string;
  value: string;
};

export type VariantTableRow = {
  values: Partial<Record<VariantColumnKey, string>>;
};

export type StandardDatasheetTablePayload = {
  tableMode: "standard";
  specifications: StandardSpecRow[];
};

export type VariantDatasheetTablePayload = {
  version: 2;
  tableMode: "variant";
  specifications: StandardSpecRow[];
  variantColumns: VariantColumnDefinition[];
  variantRows: VariantTableRow[];
};

export type DatasheetTablePayload =
  | StandardDatasheetTablePayload
  | VariantDatasheetTablePayload;

export const DEFAULT_VARIANT_COLUMN_KEYS: VariantColumnKey[] = [
  "productCode",
  "description",
  "weight",
  "length",
  "diameter",
];

export const DEFAULT_VARIANT_ROW_COUNT = 6;
export const MAX_VARIANT_COLUMNS = 5;
export const MAX_VARIANT_ROWS = 6;

const normalizeColumnLabel = (label: unknown): string => {
  const normalized = (label ?? "").toString().trim();
  return normalized || "Variant Column";
};

const normalizeColumnWeight = (weight: unknown): number => {
  const parsed =
    typeof weight === "number" ? weight : Number.parseFloat(String(weight));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 14;
};

export function normalizeVariantColumnDefinition(
  column: unknown,
  availableColumns: VariantColumnDefinition[] = VARIANT_TABLE_COLUMN_OPTIONS
): VariantColumnDefinition | null {
  if (typeof column === "string") {
    return (
      availableColumns.find((availableColumn) => availableColumn.key === column) ||
      null
    );
  }

  if (!column || typeof column !== "object") {
    return null;
  }

  const candidate = column as Record<string, unknown>;
  const key = (candidate.key ?? candidate.id ?? "").toString().trim();
  if (!key) return null;

  const fallbackColumn = availableColumns.find(
    (availableColumn) => availableColumn.key === key
  );

  return {
    key,
    label: normalizeColumnLabel(candidate.label ?? fallbackColumn?.label),
    weight: normalizeColumnWeight(candidate.weight ?? fallbackColumn?.weight),
    placeholder:
      (candidate.placeholder ?? fallbackColumn?.placeholder ?? "")
        .toString()
        .trim() || undefined,
    archivedAt:
      typeof candidate.archivedAt === "string"
        ? candidate.archivedAt
        : typeof candidate.archived_at === "string"
        ? candidate.archived_at
        : fallbackColumn?.archivedAt ?? null,
  };
}

export function normalizeVariantColumns(
  columns: unknown,
  availableColumns: VariantColumnDefinition[] = VARIANT_TABLE_COLUMN_OPTIONS
): VariantColumnDefinition[] {
  const source = Array.isArray(columns)
    ? columns
    : DEFAULT_VARIANT_COLUMN_KEYS;

  const selected: VariantColumnDefinition[] = [];
  const seenKeys = new Set<string>();

  for (const column of source) {
    const normalizedColumn = normalizeVariantColumnDefinition(
      column,
      availableColumns
    );

    if (!normalizedColumn || seenKeys.has(normalizedColumn.key)) {
      continue;
    }

    selected.push(normalizedColumn);
    seenKeys.add(normalizedColumn.key);
  }

  if (selected.length === 0) {
    return availableColumns.slice(0, MAX_VARIANT_COLUMNS);
  }

  return selected.slice(0, MAX_VARIANT_COLUMNS);
}

export function normalizeVariantColumnKeys(
  columnKeys: unknown,
  availableColumns: VariantColumnDefinition[] = VARIANT_TABLE_COLUMN_OPTIONS
): VariantColumnKey[] {
  return normalizeVariantColumns(columnKeys, availableColumns).map(
    (column) => column.key
  );
}

export function getVariantColumnDefinitions(
  columns: unknown,
  availableColumns: VariantColumnDefinition[] = VARIANT_TABLE_COLUMN_OPTIONS
): VariantColumnDefinition[] {
  return normalizeVariantColumns(columns, availableColumns);
}

export function getVariantTableHead(
  columns: unknown,
  availableColumns: VariantColumnDefinition[] = VARIANT_TABLE_COLUMN_OPTIONS
): string[] {
  return getVariantColumnDefinitions(columns, availableColumns).map(
    (column) => column.label
  );
}

export function getVariantTableWidthPercentages(
  columns: unknown,
  availableColumns: VariantColumnDefinition[] = VARIANT_TABLE_COLUMN_OPTIONS
): number[] {
  const columnDefinitions = getVariantColumnDefinitions(
    columns,
    availableColumns
  );
  const totalWeight = columnDefinitions.reduce((total, column) => {
    return total + column.weight;
  }, 0);

  return columnDefinitions.map((column, index) => {
    const value = (column.weight / totalWeight) * 100;
    return index === columnDefinitions.length - 1
      ? Number(
          (
            100 -
            columnDefinitions
              .slice(0, -1)
              .reduce(
                (total, previous) =>
                  total + (previous.weight / totalWeight) * 100,
                0
              )
          ).toFixed(2)
        )
      : Number(value.toFixed(2));
  });
}

export function coerceSpecRows(rows: unknown): StandardSpecRow[] {
  if (!Array.isArray(rows)) return [];

  return rows.map((row) => {
    if (!row || typeof row !== "object") {
      return { label: "", value: "" };
    }

    const candidate = row as Record<string, unknown>;
    return {
      label: (candidate.label ?? "").toString(),
      value: (candidate.value ?? "").toString(),
    };
  });
}

export function coerceVariantRows(rows: unknown): VariantTableRow[] {
  if (!Array.isArray(rows)) return [];

  return rows.slice(0, MAX_VARIANT_ROWS).map((row) => {
    if (!row || typeof row !== "object") {
      return { values: {} };
    }

    const candidate = row as Record<string, unknown>;
    const source =
      candidate.values && typeof candidate.values === "object"
        ? (candidate.values as Record<string, unknown>)
        : candidate;

    const values: Partial<Record<VariantColumnKey, string>> = {};

    for (const [key, value] of Object.entries(source)) {
      values[key] = (value ?? "").toString();
    }

    return { values };
  });
}

export function parseDatasheetTablePayload(raw: unknown): DatasheetTablePayload {
  let parsed = raw;

  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { tableMode: "standard", specifications: [] };
    }
  }

  if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    (parsed as Record<string, unknown>).tableMode === "variant"
  ) {
    const variantPayload = parsed as Record<string, unknown>;

    return {
      version: 2,
      tableMode: "variant",
      specifications: coerceSpecRows(variantPayload.specifications),
      variantColumns: normalizeVariantColumns(
        variantPayload.variantColumns
      ),
      variantRows: coerceVariantRows(variantPayload.variantRows),
    };
  }

  return {
    tableMode: "standard",
    specifications: coerceSpecRows(parsed),
  };
}

export function toVariantTableRows(
  columns: unknown,
  rows: VariantTableRow[]
): string[][] {
  const normalizedColumnKeys = normalizeVariantColumnKeys(columns);
  const tableRows = rows.map((row) => {
    return normalizedColumnKeys.map((key) => row.values[key] ?? "");
  });

  while (tableRows.length < DEFAULT_VARIANT_ROW_COUNT) {
    tableRows.push(normalizedColumnKeys.map(() => ""));
  }

  return tableRows.slice(0, MAX_VARIANT_ROWS);
}
