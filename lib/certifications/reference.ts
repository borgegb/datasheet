import { z } from "zod";
import { isSerialisedDeclaration } from "@/lib/certifications/declarations";

// Approved by Applied in the six references sent on 21 October 2026.
export const CAT_III_CERTIFICATE = "HPiVS-iP1283-001-I-02-01";
export const RECEIVER_CERTIFICATE = "HPiVS-iP1283-003-01-00";
export const NOTIFIED_BODY = "HPi Verification Services (Ireland) Ltd, EU Notified Body No. 2810, Office No. C5, Bracetown Business Park, Clonee, Dublin 15, D15 YDC1, Ireland.";

const blastModels: Record<string, { model: string; category: "cat-ii" | "cat-iii"; pressure: string }> = {
  "BP-A-2000": { model: "BP40L", category: "cat-ii", pressure: "8.6" },
  "BP-A-3000": { model: "BP100L", category: "cat-ii", pressure: "8.6" },
  "BP-A-6000": { model: "BP100LA", category: "cat-ii", pressure: "8.6" },
  "BP-A-4000": { model: "BP140L", category: "cat-iii", pressure: "8.6" },
  "BP-A-5000": { model: "BP200L", category: "cat-iii", pressure: "8.6" },
  "BP-A-5200": { model: "BP200LX", category: "cat-iii", pressure: "12" },
};

export type ReferenceProduct = {
  productCode?: string | null;
  productType?: string | null;
  pedCategory?: string | null;
  certificateNo?: string | null;
};

export function declarationReference(product: ReferenceProduct | null | undefined) {
  if (!product) return null;
  if (product.productCode === "VM-A-0003" && product.productType === "air-receiver" && product.pedCategory === "cat-ii") {
    return { kind: "receiver" as const, model: "32 L Air Receiver", category: "cat-ii" as const,
      pressure: "12", certificate: RECEIVER_CERTIFICATE, revision: "02" };
  }
  const model = blastModels[product.productCode || ""];
  if (product.productType !== "blast-machine" || !model || model.category !== product.pedCategory) return null;
  return { kind: "blast" as const, ...model, certificate: model.category === "cat-iii" ? CAT_III_CERTIFICATE : null,
    revision: model.category === "cat-iii" ? "02" : "01" };
}

export function productReference(product: {
  product_code?: string | null; eu_doc_product_type?: string | null; eu_doc_ped_category?: string | null;
}) {
  return declarationReference({ productCode: product.product_code, productType: product.eu_doc_product_type,
    pedCategory: product.eu_doc_ped_category });
}

export function fixedManualMetadata(type: string, product: ReferenceProduct | null | undefined) {
  const reference = declarationReference(product);
  if (!reference || isSerialisedDeclaration(type)) return null;
  if (type === "eu-doc-owner-manual-pto-compressors" && reference.kind === "receiver") {
    return { declarationNumber: "ACL-DoC-OM01", revision: "02", issueDate: "2026-10-19" };
  }
  if (type === "eu-doc-owner-manual-blasting" && reference.kind === "blast") {
    return { declarationNumber: reference.category === "cat-ii" ? "ACL-DoC-OM02" : "ACL-DoC-OM03",
      revision: "01", issueDate: "2026-10-20" };
  }
  return null;
}

export function referenceIdentity(product: ReferenceProduct) {
  const reference = declarationReference(product);
  if (!reference) return null;
  return { commercialName: reference.kind === "receiver" ? reference.model : `Blast Machine ${reference.model}`,
    modelType: reference.kind === "receiver" ? "32 L Air Receiver - VM-A-0003"
      : reference.model === product.productCode ? reference.model : `${reference.model} / ${product.productCode}` };
}

export const compressorSerialSchema = z.string({ required_error: "Compressor serial number is required" }).trim().min(1, "Compressor serial number is required")
  .max(80, "Compressor serial number must be 80 characters or fewer")
  .regex(/^[A-Za-z0-9][A-Za-z0-9 ./_-]*$/, "Use letters, numbers, spaces, dots, slashes or hyphens for the compressor serial number");

export function referenceConfigurationError(product: ReferenceProduct) {
  const reference = declarationReference(product);
  if (reference?.certificate && product.certificateNo?.trim() !== reference.certificate) {
    return `Update this product's approved certificate reference to ${reference.certificate} before issuing a document.`;
  }
  return null;
}
