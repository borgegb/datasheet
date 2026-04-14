const FALLBACK_IMAGE_STEM = "production-kanban";

function getFileExtension(fileName: string, mimeType?: string) {
  const trimmedFileName = fileName.trim();
  const lastDotIndex = trimmedFileName.lastIndexOf(".");

  if (lastDotIndex !== -1 && lastDotIndex < trimmedFileName.length - 1) {
    return trimmedFileName.slice(lastDotIndex + 1).toLowerCase();
  }

  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    default:
      return "png";
  }
}

export function sanitizeProductionKanbanPartNumberForFileName(partNumber: string) {
  const asciiPartNumber = partNumber
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "");

  const sanitizedPartNumber = asciiPartNumber
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "");

  return sanitizedPartNumber || FALLBACK_IMAGE_STEM;
}

export function getProductionKanbanImageFileName(options: {
  partNumber: string;
  originalFileName: string;
  mimeType?: string;
}) {
  const { partNumber, originalFileName, mimeType } = options;
  const safeStem = sanitizeProductionKanbanPartNumberForFileName(partNumber);
  const extension = getFileExtension(originalFileName, mimeType);
  return `${safeStem}.${extension}`;
}

export function getProductionKanbanImageStoragePath(options: {
  organizationId: string;
  partNumber: string;
  originalFileName: string;
  mimeType?: string;
}) {
  const fileName = getProductionKanbanImageFileName(options);
  return {
    fileName,
    storagePath: `${options.organizationId}/production-kanban/images/${fileName}`,
  };
}
