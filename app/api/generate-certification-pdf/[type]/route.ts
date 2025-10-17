export const runtime = "nodejs";
export const memory = 1024;
export const maxDuration = 60;

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { buildCertificationPdf } from "@/lib/pdf/certifications/buildCertificationPdf";
import { CERT_TYPES } from "@/app/dashboard/certifications/registry";
import { randomUUID } from "node:crypto";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase: SupabaseClient = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
  { auth: { persistSession: false } }
);

export async function POST(
  req: Request,
  { params }: { params: { type: string } }
) {
  try {
    const typeDef = CERT_TYPES[params.type];
    if (!typeDef) {
      return new Response(
        JSON.stringify({ error: "Unknown certification type" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const payload = await req.json();
    const { certification, organizationId, productId } = payload || {};
    if (!certification) {
      return new Response(
        JSON.stringify({ error: "Missing certification payload" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Merge with defaults to ensure all fields exist
    const merged = { ...typeDef.defaults, ...certification };

    // Generate PDF
    // Prefer bundling the template via import so it exists in serverless
    // The builder accepts a Template directly.
    const templateJson = await import(
      `@/pdf/template/certifications/${typeDef.slug}.json`
    );
    const pdfBytes = await buildCertificationPdf(merged, {
      template: templateJson.default,
    });

    const iso = new Date().toISOString().replace(/[:.]/g, "-");
    const rid = randomUUID().slice(0, 8);
    const fileName = `${params.type}-certificate-${iso}-${rid}.pdf`;
    const org = organizationId || "public";
    const filePath = `${org}/certifications/${params.type}/generated/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("datasheet-assets")
      .upload(filePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      return new Response(JSON.stringify({ error: uploadError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: signed, error: signedErr } = await supabase.storage
      .from("datasheet-assets")
      .createSignedUrl(filePath, 900);

    if (signedErr) {
      return new Response(JSON.stringify({ error: signedErr.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Persist certification record (if table exists)
    try {
      const title = [
        merged?.model || merged?.equipmentDescription || "",
        merged?.serialNumber || "",
      ]
        .filter(Boolean)
        .join(" – ");

      await supabase.from("certifications").insert({
        organization_id: org,
        product_id: productId || null,
        type: params.type,
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
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e?.message || "Unknown error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
