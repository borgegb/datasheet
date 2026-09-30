export type EuDocProductType = "blast-machine" | "pto-compressor" | "air-filter";
export type EuDocPedCategory = "cat-i" | "cat-ii" | "cat-iii" | "sep";

export const DECLARATION_TYPES = [
  "eu-doc-owner-manual-blasting",
  "eu-doc-owner-manual-pto-compressors",
  "eu-doc-serialised",
  "eu-doc-20l-manual",
  "eu-doc-20l-serialised",
  "sep-air-filter-manual",
  "sep-air-filter-serialised",
] as const;
export type DeclarationType = (typeof DECLARATION_TYPES)[number];

export function isDeclarationType(type: string): type is DeclarationType {
  return DECLARATION_TYPES.includes(type as DeclarationType);
}

export function isSerialisedDeclaration(type: string) {
  return isDeclarationType(type) && type.endsWith("serialised");
}

// These profiles apply only to the two products covered by Rafael's references.
export function supplementalDeclarationProfile(type: string) {
  if (type === "eu-doc-20l-manual" || type === "eu-doc-20l-serialised") {
    return {
      kind: "20l" as const,
      productCode: "BP-A-1000",
      productType: "blast-machine" as const,
      pedCategory: "cat-i" as const,
      revision: "02",
      numberPrefix: "ACL-DoC-BP20",
      commercialName: "Blasting Machine BP20L",
      modelType: "20L / BP-A-1000",
    };
  }
  if (type === "sep-air-filter-manual" || type === "sep-air-filter-serialised") {
    return {
      kind: "sep" as const,
      productCode: "AF-A-0001",
      productType: "air-filter" as const,
      pedCategory: "sep" as const,
      revision: "01",
      numberPrefix: "ACL-SEP-RAF",
      commercialName: "Respirator Air Filter AF5L",
      modelType: "5L / AF-A-0001",
    };
  }
  return null;
}

export function normalizeEuDocProductType(value: unknown): EuDocProductType | null {
  return value === "blast-machine" || value === "pto-compressor" || value === "air-filter" ? value : null;
}

export function normalizeEuDocPedCategory(value: unknown): EuDocPedCategory | null {
  return value === "cat-i" || value === "cat-ii" || value === "cat-iii" || value === "sep" ? value : null;
}

export function certificationMappingError(productType: EuDocProductType | null, category: EuDocPedCategory | null, certificateNo: string | null, code: string | null) {
  if (!productType && !category && !certificateNo?.trim()) return null;
  if (!productType || !category) return "Certification settings need both product type and PED category.";
  if (productType === "pto-compressor" && category !== "cat-ii") return "PTO compressor EU DoC settings must use Cat. II / Module A2.";
  if (productType === "air-filter" || category === "sep") {
    if (productType !== "air-filter" || category !== "sep" || code?.trim() !== "AF-A-0001") {
      return "SEP settings are supported only for the AF-A-0001 air filter.";
    }
  }
  if (category === "cat-i" && (productType !== "blast-machine" || code?.trim() !== "BP-A-1000")) {
    return "Cat. I / Module A settings are supported only for the BP-A-1000 20L blast machine.";
  }
  if ((category === "cat-i" || category === "sep") && certificateNo?.trim()) {
    return "Cat. I and SEP products do not have a Notified Body certificate number. Clear that field.";
  }
  return null;
}
