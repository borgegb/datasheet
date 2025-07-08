import { generate } from "@pdfme/generator";
import { text, image, line, rectangle } from "@pdfme/schemas";
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
  header_color: "red" | "orange" | "green";
  image_path?: string | null;
  organization_id: string;
}

export async function buildKanbanPdf(
  kanbanCards: KanbanCard[]
): Promise<Uint8Array> {
  console.log(`Building PDF for ${kanbanCards.length} kanban cards`);

  // Load template using dynamic import (following working pattern)
  const templateData = (
    await import("../../../pdf/template/kanban/kanban-card-template.json")
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

    // Add our custom fonts to the font map
    fontMap = {
      ...fontMap,
      "Inter-Regular": {
        data: interRegularFontBytes,
        subset: true,
      },
      "Inter-Bold": { data: interBoldFontBytes, subset: true },
    };
    console.log("Custom fonts loaded from:", fontDir);
    console.log("Available fonts:", Object.keys(fontMap));
  } catch (loadError: any) {
    console.error("Error loading fonts for PDFME:", loadError);
    throw new Error(`Failed to load PDF fonts: ${loadError.message}`);
  }

  // Prepare inputs for all kanban cards
  const inputs = kanbanCards.map((card) => ({
    partNumber: card.part_no || "",
    description: card.description || "",
    location: card.location || "",
    orderQuantity: card.order_quantity?.toString() || "",
    preferredSupplier: card.preferred_supplier || "",
    leadTime: card.lead_time || "",
    headerColor: card.header_color || "red",
    // TODO: Load actual images from storage paths - for now using placeholder
    productImage: card.image_path ? DEFAULT_KANBAN_IMAGE_BASE64 : DEFAULT_KANBAN_IMAGE_BASE64,
  }));

  console.log(`Prepared ${inputs.length} inputs for PDF generation`);

  // Generate PDF
  const pdfBytes = await generate({
    template,
    inputs,
    options: { font: fontMap },
    plugins: {
      text,
      image,
      line,
      rectangle,
    },
  });

  console.log(`PDF generated successfully, size: ${pdfBytes.length} bytes`);
  return pdfBytes;
}
