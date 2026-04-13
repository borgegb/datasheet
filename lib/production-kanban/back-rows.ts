export const PRODUCTION_KANBAN_BACK_ROW_COUNT = 18;

export interface ProductionKanbanBackRow {
  leftLocation: string;
  leftQty: string;
  rightLocation: string;
  rightQty: string;
}

function toCleanString(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

export function createEmptyProductionKanbanBackRow(): ProductionKanbanBackRow {
  return {
    leftLocation: "",
    leftQty: "",
    rightLocation: "",
    rightQty: "",
  };
}

export function createEmptyProductionKanbanBackRows(
  count = PRODUCTION_KANBAN_BACK_ROW_COUNT
) {
  return Array.from({ length: count }, () =>
    createEmptyProductionKanbanBackRow()
  );
}

export function normalizeProductionKanbanBackRows(input: unknown) {
  const sourceRows = Array.isArray(input) ? input : [];
  const normalizedRows = sourceRows
    .slice(0, PRODUCTION_KANBAN_BACK_ROW_COUNT)
    .map((row) => {
      const source =
        row && typeof row === "object"
          ? (row as Partial<ProductionKanbanBackRow>)
          : {};

      return {
        leftLocation: toCleanString(source.leftLocation, 64),
        leftQty: toCleanString(source.leftQty, 24),
        rightLocation: toCleanString(source.rightLocation, 64),
        rightQty: toCleanString(source.rightQty, 24),
      };
    });

  while (normalizedRows.length < PRODUCTION_KANBAN_BACK_ROW_COUNT) {
    normalizedRows.push(createEmptyProductionKanbanBackRow());
  }

  return normalizedRows;
}
