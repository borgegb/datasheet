export const KANBAN_ALLOWED_HEADER_COLORS = [
  "red",
  "orange",
  "green",
  "yellow",
  "blue",
] as const;

export type KanbanHeaderColor = (typeof KANBAN_ALLOWED_HEADER_COLORS)[number];

export function isKanbanHeaderColor(
  value: unknown
): value is KanbanHeaderColor {
  return (
    typeof value === "string" &&
    KANBAN_ALLOWED_HEADER_COLORS.includes(value as KanbanHeaderColor)
  );
}

export function normalizeKanbanHeaderColor(value: unknown): KanbanHeaderColor {
  return isKanbanHeaderColor(value) ? value : "red";
}
