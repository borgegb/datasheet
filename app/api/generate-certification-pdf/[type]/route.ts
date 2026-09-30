export const runtime = "nodejs";
export const maxDuration = 60;

import {
  createClient as createSupabaseAdminClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { Template } from "@pdfme/common";
import { buildHydrostaticTestPdf } from "@/lib/pdf/certifications/buildHydrostaticTestPdf";
import { buildVm350DeclarationPdf } from "@/lib/pdf/certifications/buildVm350DeclarationPdf";
import {
  buildEuDeclarationOfConformityPdf,
  buildEuDeclarationTitle,
  type EuDeclarationProductCertification,
  isEuDeclarationOfConformityType,
} from "@/lib/pdf/certifications/buildEuDeclarationOfConformityPdf";
import { CERT_TYPES } from "@/app/dashboard/certifications/registry";
import { euDocHoldReason, SERIAL_NUMBER_FORMAT_MESSAGE, serialisedDeclarationNumber } from "@/lib/certifications/release";
import { isSerialisedDeclaration, supplementalDeclarationProfile, normalizeEuDocProductType, normalizeEuDocPedCategory } from "@/lib/certifications/declarations";
import { isAvailableDeclarationProduct } from "@/lib/certifications/products";
import { hydrostaticProductFields, type HydrostaticData } from "@/lib/certifications/hydrostatic";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  MAX_SIGNATURE_BYTES,
  SIGNATURE_BUCKET,
  isSignaturePathForOrganization,
  validateSignaturePng,
} from "@/lib/certifications/signature";
import {
  DEFAULT_CERTIFICATION_SETTINGS,
  mapCertificationSettingsRow,
  type CertificationSettings,
  type CertificationSettingsRow,
} from "@/lib/certifications/settings";

type RouteContext = {
  params: Promise<{ type: string }>;
};

let adminClient: SupabaseClient | null = null;

function getAdminClient() {
  if (adminClient) return adminClient;

  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase service credentials are not configured.");
  }

  adminClient = createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  return adminClient;
}

function jsonError(message: string, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

async function getAuthenticatedOrganizationId() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { organizationId: null, userId: null, role: null, error: "Authentication required." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    return { organizationId: null, userId: null, role: null, error: "User organization not found." };
  }

  return {
    organizationId: profile.organization_id as string,
    userId: user.id,
    role: profile.role as string | null,
    error: null,
  };
}

async function validateProductId(
  supabase: SupabaseClient,
  organizationId: string,
  productId: unknown
) {
  if (typeof productId !== "string" || !productId.trim()) {
    return { productId: null, product: null, error: null };
  }

  const { data, error } = await supabase
    .from("products")
    .select("id, product_title, product_code")
    .eq("id", productId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    return {
      productId: null,
      product: null,
      error: `Could not validate product ownership: ${error.message}`,
    };
  }

  if (!data?.id) {
    return { productId: null, product: null, error: "Selected product was not found." };
  }

  return { productId: data.id as string, product: data, error: null };
}

type EuDocProductRow = {
  id: string;
  product_title: string | null;
  product_code: string | null;
  eu_doc_product_type: string | null;
  eu_doc_ped_category: string | null;
  eu_doc_certificate_no: string | null;
};

async function fetchEuDeclarationProductCertification(
  supabase: SupabaseClient,
  organizationId: string,
  productId: unknown,
  type: string
): Promise<{
  productCertification: EuDeclarationProductCertification | null;
  error: string | null;
}> {
  if (typeof productId !== "string" || !productId.trim()) {
    return {
      productCertification: null,
      error: "Select a product before generating this DoC.",
    };
  }

  const { data, error } = await supabase
    .from("products")
    .select(
      "id, product_title, product_code, eu_doc_product_type, eu_doc_ped_category, eu_doc_certificate_no"
    )
    .eq("id", productId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    return {
      productCertification: null,
      error: `Could not validate selected product: ${error.message}`,
    };
  }

  const product = data as EuDocProductRow | null;
  if (!product?.id) {
    return {
      productCertification: null,
      error: "Selected product was not found.",
    };
  }

  const productType = normalizeEuDocProductType(product.eu_doc_product_type);
  const pedCategory = normalizeEuDocPedCategory(product.eu_doc_ped_category);
  const certificateNo = product.eu_doc_certificate_no?.trim() || "";

  const holdReason = euDocHoldReason(type, productType);
  if (holdReason) return { productCertification: null, error: holdReason };

  if (!productType || !pedCategory) {
    return {
      productCertification: null,
      error:
        "Selected product is missing EU DoC settings. Set product type and PED category on the datasheet first.",
    };
  }

  if (
    type === "eu-doc-owner-manual-blasting" &&
    productType !== "blast-machine"
  ) {
    return {
      productCertification: null,
      error:
        "Owner's Manual Blasting DoCs must use a blast machine product.",
    };
  }

  if (
    type === "eu-doc-owner-manual-pto-compressors" &&
    productType !== "pto-compressor"
  ) {
    return {
      productCertification: null,
      error:
        "Owner's Manual PTO Compressor DoCs must use a PTO compressor product.",
    };
  }

  if (productType === "pto-compressor" && pedCategory === "cat-iii") {
    return {
      productCertification: null,
      error:
        "PTO compressor DoCs must use Cat. II / Module A2 product settings.",
    };
  }

  const supplemental = supplementalDeclarationProfile(type);
  if (!supplemental && !certificateNo) {
    return {
      productCertification: null,
      error:
        "Selected product has no EU DoC certificate number. Add the issued certificate number on the datasheet before generating.",
    };
  }

  if (!isAvailableDeclarationProduct(type, { ...product, eu_doc_product_type: productType, eu_doc_ped_category: pedCategory })) {
    return { productCertification: null, error: supplemental
      ? `This declaration requires ${supplemental.productCode}, ${supplemental.pedCategory} settings and no Notified Body certificate number.`
      : "This generator only supports configured Cat. II / III blast machines." };
  }

  return {
    productCertification: {
      id: product.id,
      productTitle: product.product_title,
      productCode: product.product_code,
      productType,
      pedCategory,
      certificateNo,
    },
    error: null,
  };
}

async function fetchCertificationSettings(
  supabase: SupabaseClient,
  organizationId: string
): Promise<{ settings: CertificationSettings; signaturePath: string | null }> {
  const { data, error } = await supabase
    .from("certification_settings")
    .select("template_revision, signature_storage_path")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch certification settings:", error);
    throw new Error("Could not load certification settings. Check the DoC database migrations.");
  }

  const row = data as CertificationSettingsRow | null;
  return {
    settings: row ? mapCertificationSettingsRow(row) : DEFAULT_CERTIFICATION_SETTINGS,
    signaturePath: row?.signature_storage_path || null,
  };
}

async function loadTemplate(slug: string): Promise<Template> {
  switch (slug) {
    case "ec-vm-350-declaration": {
      const template = await import(
        "@/pdf/template/certifications/ec-vm-350-declaration.json"
      );
      return template.default as unknown as Template;
    }
    default:
      throw new Error(`No PDF template is configured for ${slug}.`);
  }
}

export async function POST(
  req: Request,
  { params }: RouteContext
) {
  try {
    const { type } = await params;
    const typeDef = CERT_TYPES[type];
    if (!typeDef) {
      return jsonError("Unknown certification type", 404);
    }

    const { organizationId, userId, role, error: orgError } =
      await getAuthenticatedOrganizationId();
    if (orgError || !organizationId) {
      return jsonError(orgError || "Authentication required.", 401);
    }

    if (role !== "owner" && role !== "member") {
      return jsonError("Only organization owners and members can generate certificates.", 403);
    }

    const holdReason = euDocHoldReason(type);
    if (holdReason) return jsonError(holdReason, 409);

    const payload = await req.json().catch(() => null);
    const { certification, productId } = payload || {};
    if (!certification || typeof certification !== "object") {
      return jsonError("Missing certification payload", 400);
    }

    const isEuDoc = isEuDeclarationOfConformityType(type);
    const isHydrostatic = type === "hydrostatic-test";
    const usesSignature = isEuDoc || isHydrostatic;
    const documentMode = payload.documentMode ?? "test";
    if (usesSignature && documentMode !== "test" && documentMode !== "issued") {
      return jsonError("Invalid document status.", 400);
    }
    const isTest = usesSignature && documentMode === "test";
    let merged = { ...typeDef.defaults, ...certification };
    if (isSerialisedDeclaration(type)) {
      const declarationNumber = serialisedDeclarationNumber(merged.serialNumber, type);
      if (!declarationNumber) return jsonError(SERIAL_NUMBER_FORMAT_MESSAGE, 400);
      merged.declarationNumber = declarationNumber;
    }
    const parsed = typeDef.schema.safeParse(merged);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return jsonError(firstIssue?.message || "Invalid certification data", 400);
    }
    if (usesSignature) {
      // Only accepted form fields may enter a document or its saved snapshot.
      merged = parsed.data;
      if (isEuDoc && isTest && !merged.declarationNumber.startsWith("TEST-")) {
        merged.declarationNumber = `TEST-${merged.declarationNumber}`;
      }
      if (isHydrostatic && isTest && !merged.certificateNumber.startsWith("TEST-")) {
        merged.certificateNumber = `TEST-${merged.certificateNumber}`;
      }
    }

    const adminSupabase = getAdminClient();
    let productRecordId: string | null = null;
    let euProductCertification: EuDeclarationProductCertification | null = null;

    if (isEuDeclarationOfConformityType(type)) {
      const productValidation =
        await fetchEuDeclarationProductCertification(
          adminSupabase,
          organizationId,
          productId,
          type
        );

      if (productValidation.error || !productValidation.productCertification) {
        return jsonError(productValidation.error || "Invalid product.", 400);
      }

      euProductCertification = productValidation.productCertification;
      productRecordId = euProductCertification.id || null;
    } else {
      const productValidation = await validateProductId(
        adminSupabase,
        organizationId,
        productId
      );
      if (productValidation.error) {
        return jsonError(productValidation.error, 400);
      }
      productRecordId = productValidation.productId;
      if (isHydrostatic) {
        if (!productValidation.product) return jsonError("Select a product before generating a hydrostatic certificate.", 400);
        merged.model = hydrostaticProductFields(productValidation.product).model;
      }
    }

    let pdfBytes: Uint8Array;
    let title: string;
    let signatureRecord: {
      signerName: string;
      storagePath: string;
      sha256: string;
      generatedBy: string | null;
      generatedAt: string;
    } | null = null;

    if (usesSignature) {
      const { settings, signaturePath } = await fetchCertificationSettings(
        adminSupabase,
        organizationId
      );
      let signaturePng: Uint8Array | undefined;
      if (!isTest) {
        if (!signaturePath || !isSignaturePathForOrganization(signaturePath, organizationId)) {
          return jsonError("An organization owner must configure Mark's signature in Certification Settings before issuing a document.", 409);
        }

        const { data: signatureFile, error: signatureError } = await adminSupabase.storage
          .from(SIGNATURE_BUCKET)
          .download(signaturePath);
        if (signatureError || !signatureFile || signatureFile.size > MAX_SIGNATURE_BYTES) {
          return jsonError("The configured signature could not be loaded. Ask an organization owner to upload it again.", 409);
        }
        signaturePng = new Uint8Array(await signatureFile.arrayBuffer());
        await validateSignaturePng(signaturePng);
        signatureRecord = {
          signerName: "Mark Clendennen",
          storagePath: signaturePath,
          sha256: createHash("sha256").update(signaturePng).digest("hex"),
          generatedBy: userId,
          generatedAt: new Date().toISOString(),
        };
      }
      if (isEuDeclarationOfConformityType(type)) {
        pdfBytes = await buildEuDeclarationOfConformityPdf(
          type,
          merged,
          settings,
          euProductCertification,
          signaturePng,
          { isTest }
        );
        title = buildEuDeclarationTitle(type, merged, euProductCertification);
      } else {
        pdfBytes = await buildHydrostaticTestPdf(merged as HydrostaticData, { signaturePng, isTest });
        title = `${typeDef.title} - ${merged.model} - ${merged.serialNumber}`;
      }
      if (isTest) title = `TEST / NOT FOR ISSUE - ${title}`;
    } else {
      if (type !== "ec-vm-350-declaration") return jsonError("Unsupported certification type", 400);
      const template = await loadTemplate(typeDef.slug);
      pdfBytes = await buildVm350DeclarationPdf(merged, template);
      title = [
        merged?.model || merged?.equipmentDescription || "",
        merged?.serialNumber || "",
      ]
        .filter(Boolean)
        .join(" - ");
    }

    const iso = new Date().toISOString().replace(/[:.]/g, "-");
    const rid = randomUUID().slice(0, 8);
    const fileName = `${isTest ? "TEST-" : ""}${type}-certificate-${iso}-${rid}.pdf`;
    const filePath = `${organizationId}/certifications/${type}/generated/${fileName}`;

    const { error: uploadError } = await adminSupabase.storage
      .from("datasheet-assets")
      .upload(filePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      return jsonError(uploadError.message);
    }

    try {
      const { error: recordError } = await adminSupabase.from("certifications").insert({
        organization_id: organizationId,
        product_id: productRecordId,
        type,
        title: title || null,
        data: usesSignature
          ? {
              ...merged,
              ...(euProductCertification ? { productCertification: euProductCertification } : {}),
              signature: signatureRecord,
              documentMode,
              generatedBy: userId,
            }
          : merged,
        pdf_storage_path: filePath,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (recordError) throw recordError;
    } catch (e) {
      console.error("Failed to insert certification record:", e);
      const { error: cleanupError } = await adminSupabase.storage.from("datasheet-assets").remove([filePath]);
      if (cleanupError) console.error("Orphaned certificate PDF requires cleanup:", filePath, cleanupError);
      return jsonError("Could not save the certificate record. Please try again.");
    }

    revalidatePath("/dashboard/certifications");
    const { data: signed, error: signedErr } = await adminSupabase.storage
      .from("datasheet-assets")
      .createSignedUrl(filePath, 900);
    if (signedErr || !signed?.signedUrl) {
      return jsonError("Certificate saved, but its download link could not be created. Open it from the certificates list.");
    }
    return Response.json({ url: signed?.signedUrl, path: filePath });
  } catch (e) {
    return jsonError(errorMessage(e));
  }
}
