import { supplementalDeclarationProfile } from "@/lib/certifications/declarations";

export const PTO_DOC_HOLD_MESSAGE =
  "PTO Compressor DoCs are on hold pending Applied's revised PED scope and document content.";

export function euDocHoldReason(type: string, productType?: string | null) {
  return type === "ec-vm-350-declaration" ||
    type === "eu-doc-owner-manual-pto-compressors" ||
    (type === "eu-doc-serialised" && productType === "pto-compressor")
    ? PTO_DOC_HOLD_MESSAGE
    : null;
}

export const SERIAL_NUMBER_FORMAT_MESSAGE =
  "Use AP-YY-##### with five serial digits and a year matching the year of manufacture.";

export function serialisedDeclarationNumber(serial: unknown, type = "eu-doc-serialised"): string | null {
  if (typeof serial !== "string") return null;
  // Keep the earlier unprefixed and four-digit serial formats compatible.
  const match = /^(?:AP-)?(\d{2})-(\d{4,5})$/.exec(serial.trim());
  if (!match) return null;
  const prefix = supplementalDeclarationProfile(type)?.numberPrefix || "ACL-DoC";
  return `${prefix}-${match[1]}_${match[2].replace(/^0+(?=\d)/, "")}`;
}

export function serialisedProductFields(product: {
  product_title: string | null;
  product_code: string | null;
}) {
  return {
    commercialName: product.product_title || "",
    modelType: product.product_code || "",
    serialNumber: "",
    yearOfConstruction: "",
  };
}
