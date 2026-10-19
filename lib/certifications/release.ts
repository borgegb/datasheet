import { supplementalDeclarationProfile } from "@/lib/certifications/declarations";

export function euDocHoldReason(type: string) {
  return type === "ec-vm-350-declaration"
    ? "The legacy VM350 generator is on hold. Use the PTO Compressor EU DoC generators."
    : null;
}

// These two products were explicitly released for signed DoCs on 19 October.
// Keep their absent PED certificate reference blank, never substitute another product's.
export function allowsBlankDeclarationCertificate(product: {
  productCode?: string | null;
  productType?: string | null;
  pedCategory?: string | null;
  issueEnabled?: boolean | null;
}) {
  return product.issueEnabled === true && (
    (product.productCode === "VM-A-0001" && product.productType === "pto-compressor" && product.pedCategory === "cat-ii") ||
    (product.productCode === "BP-A-5200" && product.productType === "blast-machine" && product.pedCategory === "cat-iii")
  );
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
