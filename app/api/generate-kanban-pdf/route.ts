// /api/generate-kanban-pdf   (Next.js 14 route)
export const runtime = "nodejs"; // full Node env
export const memory = 1024; // MB
export const maxDuration = 60; // seconds

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { buildKanbanPdf } from "../../../lib/pdf/kanban/buildKanbanPdf";

// --- Supabase Client Initialization ---
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase: SupabaseClient = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
  {
    auth: { persistSession: false },
  }
);

export async function POST(req: Request) {
  console.log("--- Vercel POST /api/generate-kanban-pdf handler entered ---");
  try {
    const payload = await req.json();
    const { kanbanCardIds } = payload;

    if (
      !kanbanCardIds ||
      !Array.isArray(kanbanCardIds) ||
      kanbanCardIds.length === 0
    ) {
      throw new Error("Missing or empty kanbanCardIds array.");
    }

    console.log(`Fetching kanban cards for IDs: ${kanbanCardIds.join(", ")}`);

    // Fetch kanban cards from database
    const { data: kanbanCards, error: dbError } = await supabase
      .from("kanban_cards")
      .select("*")
      .in("id", kanbanCardIds);

    if (dbError) {
      console.error("DB Error fetching kanban cards:", dbError);
      throw new Error(`DB Error: ${dbError.message}`);
    }

    if (!kanbanCards || kanbanCards.length === 0) {
      throw new Error("No kanban cards found for the provided IDs.");
    }

    console.log(`Found ${kanbanCards.length} kanban cards for PDF generation`);

    // Generate PDF with the kanban cards data
    const pdfBytes = await buildKanbanPdf(kanbanCards);

    // Construct filename
    const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const pdfFileName = `kanban-cards-${timestamp}.pdf`;

    // Get organization ID from first card (assuming all cards belong to same org)
    const orgId = kanbanCards[0].organization_id;
    const filePath = `${orgId}/kanban_cards/generated_pdfs/${pdfFileName}`;

    console.log(
      `Uploading PDF to Supabase Storage at: datasheet-assets/${filePath}`
    );

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("datasheet-assets")
      .upload(filePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("Supabase Storage upload error:", uploadError);
      return new Response(
        JSON.stringify({
          error: `Storage upload failed: ${uploadError.message}`,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Update kanban card records with PDF storage path
    console.log(`Updating kanban cards with PDF path: ${filePath}`);
    const { error: updateError } = await supabase
      .from("kanban_cards")
      .update({
        pdf_storage_path: filePath,
        updated_at: new Date().toISOString(),
      })
      .in("id", kanbanCardIds);

    if (updateError) {
      console.error("Error updating kanban cards with PDF path:", updateError);
      // Don't fail the request, just log the error since PDF was generated successfully
    } else {
      console.log(
        `Successfully updated ${kanbanCardIds.length} kanban cards with PDF path`
      );
    }

    // Return a signed URL
    const { data: signedUrlData, error: signedUrlError } =
      await supabase.storage
        .from("datasheet-assets")
        .createSignedUrl(filePath, 900); // 15 minutes

    if (signedUrlError) {
      console.error("Supabase signed URL error:", signedUrlError);
      return new Response(
        JSON.stringify({
          error: `Failed to create signed URL: ${signedUrlError.message}`,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    console.log(
      "Kanban PDF generation and upload successful. Returning signed URL."
    );
    return Response.json({ url: signedUrlData?.signedUrl });
  } catch (error: any) {
    console.error(
      "Error in POST /api/generate-kanban-pdf:",
      error,
      error.stack
    );
    const message =
      error.message ||
      "An unknown error occurred during kanban PDF generation.";
    return new Response(
      JSON.stringify({ error: message, stack: error.stack }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
