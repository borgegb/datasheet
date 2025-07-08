import { generate } from "@pdfme/generator";
import { text, image, rectangle } from "@pdfme/schemas";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getDefaultFont } from "@pdfme/common";
import type { Template, Font } from "@pdfme/common";

// Default image for kanban cards when no image is provided
const DEFAULT_KANBAN_IMAGE_BASE64 =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0xMDAgNzBMMTMwIDEzMEg3MEwxMDAgNzBaIiBmaWxsPSIjQ0NEMkQzIi8+Cjx0ZXh0IHg9IjEwMCIgeT0iMTYwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjNjc3NDhGIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiPk5vIEltYWdlPC90ZXh0Pgo8L3N2Zz4K";

interface BuildKanbanPdfInput {
  partNumber: string;
  description?: string;
  location: string;
  orderQuantity?: number;
  preferredSupplier?: string;
  leadTime?: string;
  headerColor: "red" | "orange" | "green";
  productImageBase64?: string;
  signatureImageBase64?: string;
}

export async function buildKanbanPdf(
  input: BuildKanbanPdfInput
): Promise<Uint8Array> {
  // Load the appropriate template based on header color
  const templateFileName = `template-${input.headerColor}.json`;
  const templateData = (
    await import(`../../../pdf/template/kanban/${templateFileName}`)
  ).default;

  // Fix padding type for TypeScript
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
    const poppinsBoldPath = path.join(fontDir, "Poppins-Bold.ttf");
    const interRegularPath = path.join(fontDir, "Inter-Regular.ttf");
    const interBoldPath = path.join(fontDir, "Inter-Bold.ttf");

    const [poppinsBoldFontBytes, interRegularFontBytes, interBoldFontBytes] =
      await Promise.all([
        fs.readFile(poppinsBoldPath),
        fs.readFile(interRegularPath),
        fs.readFile(interBoldPath),
      ]);

    // Add our custom fonts to the font map
    fontMap = {
      ...fontMap,
      "Poppins-Bold": { data: poppinsBoldFontBytes, subset: true },
      "Inter-Regular": {
        data: interRegularFontBytes,
        subset: true,
      },
      "Inter-Bold": { data: interBoldFontBytes, subset: true },
    };
    console.log("Custom fonts loaded for kanban card");
  } catch (loadError: any) {
    console.error("Error loading fonts for kanban card PDFME:", loadError);
    throw new Error(
      `Failed to load kanban card PDF fonts: ${loadError.message}`
    );
  }

  // Prepare inputs for the template
  const inputs = [
    {
      partNumber: input.partNumber || "",
      description: input.description || "",
      location: input.location || "",
      orderQuantity: input.orderQuantity ? input.orderQuantity.toString() : "",
      supplier: input.preferredSupplier || "",
      leadTime: input.leadTime || "",
      productImage: input.productImageBase64 || DEFAULT_KANBAN_IMAGE_BASE64,
    },
  ];

  console.log("Generating kanban card PDF with inputs:", {
    partNumber: input.partNumber,
    description: input.description?.substring(0, 50) + "...",
    location: input.location,
    headerColor: input.headerColor,
    hasImage: !!input.productImageBase64,
  });

  // Generate PDF
  const pdfBytes = await generate({
    template,
    inputs,
    options: { font: fontMap },
    plugins: {
      text,
      image,
      rectangle,
    },
  });

  return pdfBytes;
}
