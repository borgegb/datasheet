export const runtime = "nodejs";
export const maxDuration = 60;

import {
  createClient as createSupabaseAdminClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import type { Template } from "@pdfme/common";
import { buildCertificationPdf } from "@/lib/pdf/certifications/buildCertificationPdf";
import { buildVm350DeclarationPdf } from "@/lib/pdf/certifications/buildVm350DeclarationPdf";
import {
  buildEuDeclarationOfConformityPdf,
  buildEuDeclarationTitle,
  type EuDeclarationProductCertification,
  type EuDocPedCategory,
  type EuDocProductType,
  isEuDeclarationOfConformityType,
} from "@/lib/pdf/certifications/buildEuDeclarationOfConformityPdf";
import { CERT_TYPES } from "@/app/dashboard/certifications/registry";
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
    return { productId: null, error: null };
  }

  const { data, error } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    return {
      productId: null,
      error: `Could not validate product ownership: ${error.message}`,
    };
  }

  if (!data?.id) {
    return { productId: null, error: "Selected product was not found." };
  }

  return { productId: data.id as string, error: null };
}

type EuDocProductRow = {
  id: string;
  product_title: string | null;
  product_code: string | null;
  eu_doc_product_type: string | null;
  eu_doc_ped_category: string | null;
  eu_doc_certificate_no: string | null;
};

function normalizeEuDocProductType(value: unknown): EuDocProductType | null {
  if (value === "blast-machine" || value === "pto-compressor") {
    return value;
  }
  return null;
}

function normalizeEuDocPedCategory(value: unknown): EuDocPedCategory | null {
  if (value === "cat-ii" || value === "cat-iii") {
    return value;
  }
  return null;
}

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

  if (!certificateNo) {
    return {
      productCertification: null,
      error:
        "Selected product has no EU DoC certificate number. Add the issued certificate number on the datasheet before generating.",
    };
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
    case "hydrostatic-test": {
      const template = await import(
        "@/pdf/template/certifications/hydrostatic-test.json"
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

    if (isEuDeclarationOfConformityType(type) && role !== "owner" && role !== "member") {
      return jsonError("Only organization owners and members can issue signed DoCs.", 403);
    }

    const payload = await req.json().catch(() => null);
    const { certification, productId } = payload || {};
    if (!certification || typeof certification !== "object") {
      return jsonError("Missing certification payload", 400);
    }

    const merged = { ...typeDef.defaults, ...certification };
    const parsed = typeDef.schema.safeParse(merged);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return jsonError(firstIssue?.message || "Invalid certification data", 400);
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

    if (isEuDeclarationOfConformityType(type)) {
      const { settings, signaturePath } = await fetchCertificationSettings(
        adminSupabase,
        organizationId
      );
      if (!signaturePath || !isSignaturePathForOrganization(signaturePath, organizationId)) {
        return jsonError("An organization owner must configure Mark's signature in Certification Settings before issuing a DoC.", 409);
      }

      const { data: signatureFile, error: signatureError } = await adminSupabase.storage
        .from(SIGNATURE_BUCKET)
        .download(signaturePath);
      if (signatureError || !signatureFile || signatureFile.size > MAX_SIGNATURE_BYTES) {
        return jsonError("The configured signature could not be loaded. Ask an organization owner to upload it again.", 409);
      }
      const signaturePng = new Uint8Array(await signatureFile.arrayBuffer());
      await validateSignaturePng(signaturePng);
      signatureRecord = {
        signerName: "Mark Clendennen",
        storagePath: signaturePath,
        sha256: createHash("sha256").update(signaturePng).digest("hex"),
        generatedBy: userId,
        generatedAt: new Date().toISOString(),
      };
      pdfBytes = await buildEuDeclarationOfConformityPdf(
        type,
        merged,
        settings,
        euProductCertification,
        signaturePng
      );
      title = buildEuDeclarationTitle(type, merged, euProductCertification);
    } else {
      const template = await loadTemplate(typeDef.slug);
      pdfBytes =
        type === "ec-vm-350-declaration"
          ? await buildVm350DeclarationPdf(merged, template)
          : await buildCertificationPdf(merged, { template });
      title = [
        merged?.model || merged?.equipmentDescription || "",
        merged?.serialNumber || "",
      ]
        .filter(Boolean)
        .join(" - ");
    }

    const iso = new Date().toISOString().replace(/[:.]/g, "-");
    const rid = randomUUID().slice(0, 8);
    const fileName = `${type}-certificate-${iso}-${rid}.pdf`;
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

    const { data: signed, error: signedErr } = await adminSupabase.storage
      .from("datasheet-assets")
      .createSignedUrl(filePath, 900);

    if (signedErr) {
      return jsonError(signedErr.message);
    }

    try {
      const { error: recordError } = await adminSupabase.from("certifications").insert({
        organization_id: organizationId,
        product_id: productRecordId,
        type,
        title: title || null,
        data: euProductCertification
          ? {
              ...merged,
              productCertification: euProductCertification,
              signature: signatureRecord,
            }
          : merged,
        pdf_storage_path: filePath,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (recordError) throw recordError;
    } catch (e) {
      console.error("Failed to insert certification record:", e);
      if (signatureRecord) {
        await adminSupabase.storage.from("datasheet-assets").remove([filePath]);
        return jsonError("Could not save the signed DoC record. Please try again.");
      }
    }

    return Response.json({ url: signed?.signedUrl, path: filePath });
  } catch (e) {
    return jsonError(errorMessage(e));
  }
}
