export const runtime = "nodejs";
export const maxDuration = 60;

import {
  createClient as createSupabaseAdminClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Template } from "@pdfme/common";
import { buildCertificationPdf } from "@/lib/pdf/certifications/buildCertificationPdf";
import { buildVm350DeclarationPdf } from "@/lib/pdf/certifications/buildVm350DeclarationPdf";
import {
  buildEuDeclarationOfConformityPdf,
  buildEuDeclarationTitle,
  isEuDeclarationOfConformityType,
} from "@/lib/pdf/certifications/buildEuDeclarationOfConformityPdf";
import { CERT_TYPES } from "@/app/dashboard/certifications/registry";
import { createClient as createServerClient } from "@/lib/supabase/server";
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
    return { organizationId: null, error: "Authentication required." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    return { organizationId: null, error: "User organization not found." };
  }

  return { organizationId: profile.organization_id as string, error: null };
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

async function fetchCertificationSettings(
  supabase: SupabaseClient,
  organizationId: string
): Promise<CertificationSettings> {
  const { data, error } = await supabase
    .from("certification_settings")
    .select("template_revision, cat_ii_certificate_no, cat_iii_certificate_no")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch certification settings:", error);
    return DEFAULT_CERTIFICATION_SETTINGS;
  }

  return mapCertificationSettingsRow(data as CertificationSettingsRow | null);
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

    const { organizationId, error: orgError } =
      await getAuthenticatedOrganizationId();
    if (orgError || !organizationId) {
      return jsonError(orgError || "Authentication required.", 401);
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
    const productValidation = await validateProductId(
      adminSupabase,
      organizationId,
      productId
    );
    if (productValidation.error) {
      return jsonError(productValidation.error, 400);
    }

    let pdfBytes: Uint8Array;
    let title: string;

    if (isEuDeclarationOfConformityType(type)) {
      const settings = await fetchCertificationSettings(
        adminSupabase,
        organizationId
      );
      pdfBytes = await buildEuDeclarationOfConformityPdf(
        type,
        merged,
        settings
      );
      title = buildEuDeclarationTitle(type, merged);
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
      await adminSupabase.from("certifications").insert({
        organization_id: organizationId,
        product_id: productValidation.productId,
        type,
        title: title || null,
        data: merged,
        pdf_storage_path: filePath,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      // Non-fatal if table missing; PDF already generated and uploaded
      console.error("Failed to insert certification record:", e);
    }

    return Response.json({ url: signed?.signedUrl, path: filePath });
  } catch (e) {
    return jsonError(errorMessage(e));
  }
}
