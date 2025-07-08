// /api/generate-kanban-pdf   (Next.js 14 route)
export const runtime = "nodejs"; // full Node env
export const memory = 3009; // MB – Pro max
export const maxDuration = 300; // seconds

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Import the kanban PDF build function
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

// Default image fallback
const DEFAULT_KANBAN_IMAGE_BASE64 =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0xMDAgNzBMMTMwIDEzMEg3MEwxMDAgNzBaIiBmaWxsPSIjQ0NEMkQzIi8+Cjx0ZXh0IHg9IjEwMCIgeT0iMTYwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjNjc3NDhGIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiPk5vIEltYWdlPC90ZXh0Pgo8L3N2Zz4K";

export async function POST(req: Request) {
  console.log("--- Vercel POST /api/generate-kanban-pdf handler entered ---");
  try {
    const payload = await req.json();
    const { kanbanCardId, isPreview, ...previewData } = payload;

    if (!kanbanCardId && !isPreview) {
      throw new Error("Missing kanbanCardId or not in preview mode.");
    }

    let kanbanCardData: any = {};
    let productImageBase64 = DEFAULT_KANBAN_IMAGE_BASE64;

    if (!isPreview && kanbanCardId) {
      console.log(`Fetching kanban card data for ID: ${kanbanCardId}`);
      const { data: dbKanbanCard, error: dbError } = await supabase
        .from("kanban_cards")
        .select("*, organization_id")
        .eq("id", kanbanCardId)
        .single();

      if (dbError) {
        console.error("DB Error fetching kanban card:", dbError);
        throw new Error(`DB Error: ${dbError.message}`);
      }
      if (!dbKanbanCard) {
        throw new Error(`Kanban card with ID ${kanbanCardId} not found.`);
      }
      kanbanCardData = dbKanbanCard;

      // Fetch kanban card image if path exists
      if (kanbanCardData.image_path) {
        console.log(
          `Fetching kanban card image from: ${kanbanCardData.image_path}`
        );
        const { data: blobData, error: downloadError } = await supabase.storage
          .from("datasheet-assets") // Same bucket as datasheets
          .download(kanbanCardData.image_path);

        if (downloadError) {
          console.warn(
            `Failed to download kanban card image ${kanbanCardData.image_path}: ${downloadError.message}`
          );
          // Keep default image if download fails
        } else if (blobData) {
          const imageBytes = await blobData.arrayBuffer();
          const mimeType = kanbanCardData.image_path
            .toLowerCase()
            .endsWith(".png")
            ? "image/png"
            : "image/jpeg";
          productImageBase64 = `data:${mimeType};base64,${Buffer.from(
            imageBytes
          ).toString("base64")}`;
          console.log("Kanban card image fetched and converted to base64.");
        } else {
          console.warn(
            `Kanban card image blob data is null for ${kanbanCardData.image_path}.`
          );
        }
      }
    } else if (isPreview) {
      // Use preview data passed in the payload
      kanbanCardData = {
        part_no: previewData.partNumber,
        description: previewData.description,
        location: previewData.location,
        order_quantity: previewData.orderQuantity,
        preferred_supplier: previewData.preferredSupplier,
        lead_time: previewData.leadTime,
        header_color: previewData.headerColor,
        image_path: previewData.imagePath,
        organization_id: previewData.userId
          ? `user-${previewData.userId}-org-preview`
          : "preview-org-id",
      };

      // For preview, if an imagePath is provided and it's a base64 string, use it
      if (
        previewData.imagePath &&
        previewData.imagePath.startsWith("data:image")
      ) {
        productImageBase64 = previewData.imagePath;
      } else {
        console.log("Preview mode: Using default kanban card image.");
      }
      console.log("Using preview data directly for kanban card.");
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid request parameters" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Build the kanban card PDF input
    const kanbanInput = {
      partNumber: kanbanCardData.part_no || "",
      description: kanbanCardData.description || "",
      location: kanbanCardData.location || "",
      orderQuantity: kanbanCardData.order_quantity || undefined,
      preferredSupplier: kanbanCardData.preferred_supplier || "",
      leadTime: kanbanCardData.lead_time || "",
      headerColor:
        (kanbanCardData.header_color as "red" | "orange" | "green") || "red",
      productImageBase64,
    };

    console.log("Building kanban card PDF with input:", kanbanInput);
    const pdfBytes = await buildKanbanPdf(kanbanInput);

    // Construct the file path for storage
    if (!kanbanCardData.organization_id || !kanbanCardId) {
      console.error(
        "Missing organization_id or kanbanCardId for constructing storage path."
      );
      throw new Error(
        "Internal server error: cannot construct kanban card PDF storage path."
      );
    }

    const orgId = kanbanCardData.organization_id;
    const safePartNo = (kanbanCardData.part_no || "kanban").replace(
      /[^a-zA-Z0-9_\-\.]/g,
      "_"
    );
    const safeLocation = (kanbanCardData.location || "location").replace(
      /[^a-zA-Z0-9_\-\.]/g,
      "_"
    );
    const pdfFileName = `kanban-${safePartNo}-${safeLocation}.pdf`;
    const filePath = `${orgId}/kanban/pdfs/${kanbanCardId}/${pdfFileName}`;

    console.log(
      `Uploading kanban card PDF to Supabase Storage at: datasheet-assets/${filePath}`
    );

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("datasheet-assets")
      .upload(filePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true, // Overwrite if exists
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

    // Update kanban_cards table with the new pdf_storage_path
    console.log("Updating kanban_cards table with PDF storage path:", filePath);
    const { error: updateError } = await supabase
      .from("kanban_cards")
      .update({
        pdf_storage_path: filePath, // Store the relative path
        updated_at: new Date().toISOString(),
      })
      .eq("id", kanbanCardId);

    if (updateError) {
      // Log error but don't necessarily fail the whole request if PDF upload was successful
      console.warn(
        `Failed to update kanban_cards table with PDF path: ${updateError.message}`
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
      "Kanban card PDF generation and upload successful. Returning signed URL."
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
      "An unknown error occurred during kanban card PDF generation.";
    return new Response(
      JSON.stringify({ error: message, stack: error.stack }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
