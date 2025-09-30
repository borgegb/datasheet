import { generate } from "@pdfme/generator";
import { text, image, line, rectangle, table } from "@pdfme/schemas";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getDefaultFont } from "@pdfme/common";
import type { Template, Font } from "@pdfme/common";

// Default placeholder image
const DEFAULT_KANBAN_IMAGE_BASE64 =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0xMDAgNzBMMTMwIDEzMEg3MEwxMDAgNzBaIiBmaWxsPSIjQ0NEMkQzIi8+Cjx0ZXh0IHg9IjEwMCIgeT0iMTYwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjNjc3NDhGIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiPk5vIEltYWdlPC90ZXh0Pgo8L3N2Zz4K";

interface KanbanCard {
  id: string;
  part_no: string;
  description: string;
  location: string;
  order_quantity: number;
  preferred_supplier: string;
  lead_time: string;
  header_color: "red" | "orange" | "green" | "yellow" | "blue" | "purple" | "brown" | "pink" | "teal" | "cyan" | "gray" | "magenta" | "lime" | "silver";
  image_path?: string | null;
  organization_id: string;
}

export async function buildKanbanPdf(
  kanbanCards: KanbanCard[]
): Promise<Uint8Array> {
  console.log(`Building PDF for ${kanbanCards.length} kanban cards`);

  // Load template based on header color (use first card's color, default to red)
  const headerColor = kanbanCards[0]?.header_color || "red";
  const templateData = (
    await import(`../../../pdf/template/kanban/template-${headerColor}.json`)
  ).default;

  // Fix padding type
  const template: Template = {
    ...templateData,
    basePdf: {
      ...templateData.basePdf,
      padding: templateData.basePdf.padding as [number, number, number, number],
    },
  } as Template;

  // Set up fonts - load the proper fonts from filesystem
  const fontDir = path.resolve(process.cwd(), "pdf/fonts");

  // Get pdfme's default fonts (includes Roboto)
  const defaultFonts = getDefaultFont();

  let fontMap: Font = {
    // Include pdfme's default Roboto font to avoid character encoding issues
    ...defaultFonts,
  };

  try {
    const interRegularPath = path.join(fontDir, "Inter-Regular.ttf");
    const interBoldPath = path.join(fontDir, "Inter-Bold.ttf");

    const [interRegularFontBytes, interBoldFontBytes] = await Promise.all([
      fs.readFile(interRegularPath),
      fs.readFile(interBoldPath),
    ]);

    // Ensure only one font has fallback=true (leave Roboto as false, Inter-Regular as true)
    const defaultFontsObj = getDefaultFont();
    defaultFontsObj.Roboto.fallback = false;

    // Reflect the fallback setting in the initial fontMap as well
    if (fontMap.Roboto) {
      fontMap.Roboto.fallback = false;
    }

    // Add our custom fonts to the font map
    fontMap = {
      ...fontMap,
      "Inter-Regular": {
        data: interRegularFontBytes,
        subset: true,
        fallback: true,
      },
      "Inter-Bold": { data: interBoldFontBytes, subset: true },
    };
    console.log("Custom fonts loaded from:", fontDir);
    console.log("Available fonts:", Object.keys(fontMap));
  } catch (loadError: any) {
    console.error("Error loading fonts for PDFME:", loadError);
    throw new Error(`Failed to load PDF fonts: ${loadError.message}`);
  }

  // Prepare inputs for all kanban cards (matching template field names)
  const inputs = await Promise.all(
    kanbanCards.map(async (card) => {
      let productImageBase64 = ""; // Empty string instead of placeholder

      // Load actual image from Supabase storage if available
      if (card.image_path) {
        try {
          console.log(`Loading image for card ${card.id}: ${card.image_path}`);

          // Create signed URL for the image
          const { createClient } = await import("@supabase/supabase-js");
          const supabaseUrl = process.env.SUPABASE_URL!;
          const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
          const supabase = createClient(supabaseUrl, supabaseServiceKey);

          const { data: urlData, error: urlError } = await supabase.storage
            .from("datasheet-assets")
            .createSignedUrl(card.image_path, 60 * 5); // 5 minutes

          if (urlError) {
            console.error(
              `Error creating signed URL for ${card.image_path}:`,
              urlError
            );
          } else if (urlData?.signedUrl) {
            // Fetch the image data
            const response = await fetch(urlData.signedUrl);
            if (response.ok) {
              const imageBuffer = await response.arrayBuffer();
              const uint8Array = new Uint8Array(imageBuffer);

              // Detect image format
              const isPng =
                uint8Array.length >= 8 &&
                uint8Array[0] === 0x89 &&
                uint8Array[1] === 0x50 &&
                uint8Array[2] === 0x4e &&
                uint8Array[3] === 0x47;

              const isJpeg =
                uint8Array.length >= 2 &&
                uint8Array[0] === 0xff &&
                uint8Array[1] === 0xd8;

              if (isPng || isJpeg) {
                const mimeType = isPng ? "image/png" : "image/jpeg";
                const base64Data = Buffer.from(imageBuffer).toString("base64");
                productImageBase64 = `data:${mimeType};base64,${base64Data}`;
                console.log(
                  `Successfully loaded ${mimeType} image for card ${card.id}`
                );
              } else {
                console.warn(`Unsupported image format for ${card.image_path}`);
              }
            } else {
              console.error(
                `Failed to fetch image from signed URL: ${response.status}`
              );
            }
          }
        } catch (error) {
          console.error(`Error loading image for card ${card.id}:`, error);
        }
      }

      return {
        productImage: productImageBase64, // Use loaded image or empty string
        productInfo: [
          ["Part No:", card.part_no || ""],
          ["Description:", card.description || ""],
          ["Location:", card.location || ""],
          ["Order Qty:", card.order_quantity?.toString() || ""],
          ["Preferred Supplier:", card.preferred_supplier || ""],
          ["Lead Time:", card.lead_time || ""],
          ["Signature:", ""],
        ],
      };
    })
  );

  console.log(`Prepared ${inputs.length} inputs for PDF generation`);

  if (inputs.length > 0 && inputs[0].productInfo) {
    console.log(
      "PRODUCT INFO DUMP:",
      JSON.stringify(inputs[0].productInfo, null, 2)
    );
  }

  const plugins = {
    text,
    image,
    line,
    rectangle,
    Table: table,
  };
  console.log("Kanban plug-ins:", Object.keys(plugins));

  // Generate PDF
  const pdfBytes = await generate({
    template,
    inputs,
    options: { font: fontMap },
    plugins,
  });

  console.log(`PDF generated successfully, size: ${pdfBytes.length} bytes`);
  return pdfBytes;
}
