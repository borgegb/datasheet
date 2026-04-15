const FALLBACK_UPLOAD_KEY_PREFIX = "kanban-image";

export function createKanbanImageUploadKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${FALLBACK_UPLOAD_KEY_PREFIX}-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
}

export function buildKanbanImageUploadDirectory(
  organizationId: string,
  uploadKey: string
) {
  return `${organizationId}/kanban/images/${uploadKey}`;
}

export function buildKanbanImagePath(
  organizationId: string,
  uploadKey: string,
  fileName: string
) {
  return `${buildKanbanImageUploadDirectory(organizationId, uploadKey)}/${fileName}`;
}
