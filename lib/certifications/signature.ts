import { PDFDocument } from "pdf-lib";

export const SIGNATURE_BUCKET = "certification-signatures";
export const MAX_SIGNATURE_BYTES = 512 * 1024;

export function isSignaturePathForOrganization(
  path: string,
  organizationId: string
) {
  const prefix = `${organizationId}/`;
  return (
    path.startsWith(prefix) &&
    /^[0-9a-f-]{36}\.png$/.test(path.slice(prefix.length))
  );
}

export async function validateSignaturePng(bytes: Uint8Array) {
  if (bytes.length > MAX_SIGNATURE_BYTES) {
    throw new Error("Signature image must be 512 KB or smaller.");
  }

  const pngHeader = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    bytes.length < 33 ||
    !pngHeader.every((byte, index) => bytes[index] === byte) ||
    String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR"
  ) {
    throw new Error("Signature must be a valid PNG image.");
  }

  // Bound decoded dimensions before the image decoder allocates pixel buffers.
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = header.getUint32(16);
  const height = header.getUint32(20);
  if (!width || !height || width > 2048 || height > 1024) {
    throw new Error("Signature image must be at most 2048 by 1024 pixels.");
  }

  try {
    const document = await PDFDocument.create();
    await document.embedPng(bytes);
  } catch {
    throw new Error("Signature must be a valid PNG image.");
  }
}
