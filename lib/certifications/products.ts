export type EuDocProduct = {
  id: string;
  product_title: string | null;
  product_code: string | null;
  eu_doc_product_type: "blast-machine" | "pto-compressor" | null;
  eu_doc_ped_category: "cat-ii" | "cat-iii" | null;
  eu_doc_certificate_no: string | null;
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
