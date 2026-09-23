export const PTO_DOC_HOLD_MESSAGE =
  "VariMount / PTO DoCs are on hold pending Applied's revised PED scope and document content.";

export function euDocHoldReason(type: string, productType?: string | null) {
  return type === "eu-doc-owner-manual-pto-compressors" ||
    (type === "eu-doc-serialised" && productType === "pto-compressor")
    ? PTO_DOC_HOLD_MESSAGE
    : null;
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
