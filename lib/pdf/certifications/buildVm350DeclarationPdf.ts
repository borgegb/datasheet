import { generate } from "@pdfme/generator";
import { text, image, line, rectangle, table } from "@pdfme/schemas";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getDefaultFont } from "@pdfme/common";
import type { Template, Font } from "@pdfme/common";
import { EC_VM_350_DECLARATION_BASE_PDF_DATA_URI } from "./ec-vm-350-base-pdf";

type Vm350DeclarationData = {
  serialNumber: string;
};

type TemplateWithAssetPath = Template & {
  basePdfAssetPath?: string;
};

function cloneTemplate(template: TemplateWithAssetPath): TemplateWithAssetPath {
  return JSON.parse(JSON.stringify(template));
}

async function loadFontMap(): Promise<Font> {
  const fontDir = path.resolve(process.cwd(), "pdf/fonts");
  const defaultFonts = getDefaultFont();
  if (defaultFonts.Roboto) {
    defaultFonts.Roboto.fallback = false;
  }

  let fontMap: Font = { ...defaultFonts };

  try {
    const interBold = await fs.readFile(path.join(fontDir, "Inter-Bold.ttf"));
    const interRegular = await fs.readFile(
      path.join(fontDir, "Inter-Regular.ttf")
    );

    fontMap = {
      ...fontMap,
      "Inter-Regular": { data: interRegular, subset: true, fallback: true },
      "Inter-Bold": { data: interBold, subset: true },
    } as unknown as Font;
  } catch (e) {
    // Keep default fonts when Inter isn't available.
  }

  return fontMap;
}

export async function buildVm350DeclarationPdf(
  data: Vm350DeclarationData,
  template: Template
): Promise<Uint8Array> {
  const nextTemplate = cloneTemplate(template as TemplateWithAssetPath);
  nextTemplate.basePdf = EC_VM_350_DECLARATION_BASE_PDF_DATA_URI;
  delete nextTemplate.basePdfAssetPath;

  const fontMap = await loadFontMap();

  return generate({
    template: nextTemplate,
    inputs: [{ serialNumber: data.serialNumber }],
    options: { font: fontMap },
    plugins: { text, image, line, rectangle, Table: table },
  });
}
