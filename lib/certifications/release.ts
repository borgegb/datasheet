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
  "Use a serial number such as AP-26-00321 (or the existing 26-00321 format), with a two-digit year and four or five unit digits.";

export function serialisedDeclarationNumber(serial: unknown): string | null {
  if (typeof serial !== "string") return null;
  // Keep the earlier unprefixed and four-digit serial formats compatible.
  const match = /^(?:AP-)?(\d{2})-(\d{4,5})$/.exec(serial.trim());
  if (!match) return null;
  return `ACL-DoC-${match[1]}_${match[2].replace(/^0+(?=\d)/, "")}`;
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
