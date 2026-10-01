import { supplementalDeclarationProfile, type EuDocProductType, type EuDocPedCategory } from "@/lib/certifications/declarations";

export type EuDocProduct = {
  id: string;
  product_title: string | null;
  product_code: string | null;
  eu_doc_product_type: EuDocProductType | null;
  eu_doc_ped_category: EuDocPedCategory | null;
  eu_doc_certificate_no: string | null;
  hydrostatic_profile?: unknown;
};

export type EuDocProductOptions = {
  data: EuDocProduct[];
  error: string | null;
};

export const ORGANIZATION_ACCESS_MESSAGE =
  "Your account is not linked to an accessible organization. Contact your organization owner to arrange access.";

export function isAvailableBlastProduct(product: EuDocProduct) {
  return product.eu_doc_product_type === "blast-machine" &&
    (product.eu_doc_ped_category === "cat-ii" || product.eu_doc_ped_category === "cat-iii") &&
    Boolean(product.eu_doc_certificate_no?.trim());
}

export function isAvailableDeclarationProduct(type: string, product: EuDocProduct) {
  const profile = supplementalDeclarationProfile(type);
  if (!profile) return isAvailableBlastProduct(product);
  return product.product_code?.trim() === profile.productCode &&
    product.eu_doc_product_type === profile.productType &&
    product.eu_doc_ped_category === profile.pedCategory &&
    !product.eu_doc_certificate_no?.trim();
}
