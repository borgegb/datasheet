import { supplementalDeclarationProfile, type EuDocProductType, type EuDocPedCategory } from "@/lib/certifications/declarations";
import { hydrostaticProfileSchema } from "@/lib/certifications/hydrostatic";
import { allowsBlankDeclarationCertificate } from "@/lib/certifications/release";
import { productReference, referenceConfigurationError } from "@/lib/certifications/reference";

export type EuDocProduct = {
  id: string;
  product_title: string | null;
  product_code: string | null;
  eu_doc_product_type: EuDocProductType | null;
  eu_doc_ped_category: EuDocPedCategory | null;
  eu_doc_certificate_no: string | null;
  hydrostatic_profile?: unknown;
  certification_issue_enabled?: boolean | null;
};

export type EuDocProductOptions = {
  data: EuDocProduct[];
  error: string | null;
};

export const ORGANIZATION_ACCESS_MESSAGE =
  "Your account is not linked to an accessible organization. Contact your organization owner to arrange access.";

export function certificateModelName(product: Pick<EuDocProduct, "product_code" | "hydrostatic_profile">) {
  const profile = hydrostaticProfileSchema.safeParse(product.hydrostatic_profile);
  return [profile.success ? profile.data.modelCode : null, product.product_code].filter(Boolean).join(" / ");
}

export function isAvailableBlastProduct(product: EuDocProduct) {
  return product.eu_doc_product_type === "blast-machine" &&
    (product.eu_doc_ped_category === "cat-ii" || product.eu_doc_ped_category === "cat-iii") &&
    hasDeclarationCertificate(product);
}

function allowsBlankCertificate(product: Partial<EuDocProduct>) {
  return allowsBlankDeclarationCertificate({ productCode: product.product_code, productType: product.eu_doc_product_type,
    pedCategory: product.eu_doc_ped_category, issueEnabled: product.certification_issue_enabled });
}

function hasDeclarationCertificate(product: EuDocProduct) {
  return Boolean(product.eu_doc_certificate_no?.trim()) || product.certification_issue_enabled === false || allowsBlankCertificate(product);
}

export function declarationIssueError(product: Partial<EuDocProduct>) {
  if (product.certification_issue_enabled === false) return "Signed issuance is blocked for this product pending certification. Only unsigned test documents are available.";
  const referenceError = referenceConfigurationError({ productCode: product.product_code, productType: product.eu_doc_product_type,
    pedCategory: product.eu_doc_ped_category, certificateNo: product.eu_doc_certificate_no });
  if (referenceError) return referenceError;
  if (["cat-ii", "cat-iii"].includes(product.eu_doc_ped_category || "") && !product.eu_doc_certificate_no?.trim() && !allowsBlankCertificate(product)) return "This product has no approved PED certificate number. Signed issuance is blocked.";
  return null;
}

export function isAvailableDeclarationProduct(type: string, product: EuDocProduct) {
  const profile = supplementalDeclarationProfile(type);
  if (!profile) {
    if (type !== "eu-doc-owner-manual-pto-compressors" && isAvailableBlastProduct(product)) return true;
    return (type === "eu-doc-serialised" || type === "eu-doc-owner-manual-pto-compressors") &&
      productReference(product)?.kind === "receiver" &&
      hasDeclarationCertificate(product);
  }
  return product.product_code?.trim() === profile.productCode &&
    product.eu_doc_product_type === profile.productType &&
    product.eu_doc_ped_category === profile.pedCategory &&
    !product.eu_doc_certificate_no?.trim();
}
