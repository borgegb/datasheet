export const runtime = "nodejs";
export const memory = 1024;
export const maxDuration = 60;

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { buildCertificationPdf } from "@/lib/pdf/certifications/buildCertificationPdf";
import { CERT_TYPES } from "@/app/dashboard/certifications/registry";

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
    const { certification, organizationId } = payload || {};
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
    const pdfBytes = await buildCertificationPdf(
      merged,
      // Resolve from repo root; builder will path.resolve(process.cwd(), ...)
      `pdf/template/certifications/${typeDef.slug}.json`
    );

    const timestamp = new Date().toISOString().slice(0, 10);
    const fileName = `${params.type}-certificate-${timestamp}.pdf`;
    const org = organizationId || "public";
    const filePath = `${org}/certifications/${params.type}/generated/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("datasheet-assets")
      .upload(filePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
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

    return Response.json({ url: signed?.signedUrl });
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
