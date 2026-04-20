import { generate } from "@pdfme/generator";
import { text, image, line, rectangle, table } from "@pdfme/schemas";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getDefaultFont } from "@pdfme/common";
import type { Template, Font } from "@pdfme/common";
import { EC_VM_350_DECLARATION_BASE_PDF_DATA_URI } from "./ec-vm-350-base-pdf";

type HydrostaticCertificationData = {
  titleTop: string;
  titleBottom: string;
  euDirective: string;
  manufacturer: string;
  equipmentDescription: string;
  model: string;
  serialNumber: string;
  dateOfTest: string;
  ped: { header: string; columns: string[]; row: string[] };
  safeWorkingPressurePSI: number;
  designedTemperatureC: number;
  hydrostaticTestPressurePSI: number;
  signLineLead: string;
  signatoryName: string;
  signatoryTitle: string;
  validityMonths: number;
  branding: {
    companyName: string;
    tagline: string;
    leftRibbonText: string;
    showQcStamp: boolean;
  };
};

type Vm350DeclarationData = {
  model: string;
  equipmentDescription: string;
  serialNumber: string;
};

export type CertificationDataModel =
  | HydrostaticCertificationData
  | Vm350DeclarationData
  | Record<string, any>;

type SupportedCertificationVariant =
  | "hydrostatic-test"
  | "ec-vm-350-declaration";

const VARIANT_BASE_PDF_DATA_URIS: Partial<
  Record<SupportedCertificationVariant, string>
> = {
  "ec-vm-350-declaration": EC_VM_350_DECLARATION_BASE_PDF_DATA_URI,
};

type BuildOptions = {
  templatePath?: string;
  template?: Template;
  variant?: SupportedCertificationVariant;
};

type TemplateWithAssetPath = Template & {
  basePdfAssetPath?: string;
};

function cloneTemplate(template: TemplateWithAssetPath): TemplateWithAssetPath {
  return JSON.parse(JSON.stringify(template));
}

async function readDataUri(
  assetPath: string,
  contentType: string
): Promise<string> {
  const file = await fs.readFile(path.resolve(process.cwd(), assetPath));
  return `data:${contentType};base64,${file.toString("base64")}`;
}

async function loadTemplate(
  options: BuildOptions
): Promise<TemplateWithAssetPath> {
  if (options.template) {
    return cloneTemplate(options.template as TemplateWithAssetPath);
  }

  if (options.templatePath) {
    const absPath = path.resolve(process.cwd(), options.templatePath);
    const templateRaw = await fs.readFile(absPath, "utf8");
    return JSON.parse(templateRaw) as TemplateWithAssetPath;
  }

  throw new Error("No certificate template provided or found.");
}

async function materializeTemplate(
  template: TemplateWithAssetPath,
  variant: SupportedCertificationVariant
): Promise<Template> {
  const nextTemplate = cloneTemplate(template);
  const variantBasePdfDataUri = VARIANT_BASE_PDF_DATA_URIS[variant];

  if (variantBasePdfDataUri) {
    nextTemplate.basePdf = variantBasePdfDataUri;
    delete nextTemplate.basePdfAssetPath;
  } else if (typeof nextTemplate.basePdfAssetPath === "string") {
    nextTemplate.basePdf = await readDataUri(
      nextTemplate.basePdfAssetPath,
      "application/pdf"
    );
    delete nextTemplate.basePdfAssetPath;
  }

  if (typeof nextTemplate.basePdf !== "string") {
    nextTemplate.basePdf = {
      ...nextTemplate.basePdf,
      padding: nextTemplate.basePdf.padding as [number, number, number, number],
    };
  }

  return nextTemplate as Template;
}

function dashifyLine(
  template: Template,
  lineName: string,
  segmentLength: number,
  gapLength: number
) {
  const templateAny = template as any;
  if (!Array.isArray(templateAny.schemas)) return;

  for (let pageIndex = 0; pageIndex < templateAny.schemas.length; pageIndex++) {
    const page = templateAny.schemas[pageIndex];
    if (!Array.isArray(page)) continue;

    const lineIndex = page.findIndex(
      (element: any) => element?.type === "line" && element.name === lineName
    );
    if (lineIndex === -1) continue;

    const baseLine = page[lineIndex];
    const startX = baseLine.position?.x ?? 0;
    const y = baseLine.position?.y ?? 0;
    const totalWidth = baseLine.width ?? 0;
    const height = baseLine.height ?? 0.2;
    const color = baseLine.color ?? "#000000";

    const segments: any[] = [];
    let cursorX = startX;
    const stride = segmentLength + gapLength;

    while (cursorX + segmentLength <= startX + totalWidth) {
      segments.push({
        type: "line",
        name: `${lineName}_seg_${segments.length}`,
        position: { x: cursorX, y },
        width: segmentLength,
        height,
        content: "",
        color,
      });
      cursorX += stride;
    }

    const remaining = startX + totalWidth - cursorX;
    if (remaining > 0.1) {
      segments.push({
        type: "line",
        name: `${lineName}_seg_${segments.length}`,
        position: { x: cursorX, y },
        width: Math.min(segmentLength, remaining),
        height,
        content: "",
        color,
      });
    }

    page.splice(lineIndex, 1, ...segments);
  }
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
  } catch {
    // Keep pdfme defaults when Inter isn't available.
  }

  return fontMap;
}

async function buildHydrostaticInputs(
  data: HydrostaticCertificationData
): Promise<Record<string, any>[]> {
  const [appliedLogoBase64, leftRibbonBase64, approvedLogoBase64] =
    await Promise.all([
      readDataUri("pdf/assets/Appliedweb.jpg", "image/jpeg").catch(() => ""),
      readDataUri("pdf/assets/leftRibbon.png", "image/png").catch(() => ""),
      readDataUri("pdf/assets/approvedlogo.png", "image/png").catch(() => ""),
    ]);

  const pedTableBody = [data.ped.columns, data.ped.row];

  return [
    {
      logo: appliedLogoBase64,
      watermarkLogo: appliedLogoBase64,
      leftRibbon: leftRibbonBase64,
      approvedLogo: approvedLogoBase64,
      companyNameStatic: data.branding.companyName || "Applied Concepts",
      taglineStatic:
        (data.branding.tagline &&
          data.branding.tagline.replace(
            /\s+IN\s+BLASTING\s+TECHNOLOGY/i,
            " IN\nBLASTING\nTECHNOLOGY"
          )) ||
        "LEADERS IN\nBLASTING\nTECHNOLOGY",
      titleTop: `${data.titleTop}\n${data.titleBottom || ""}`.trim(),
      intro: `The following equipment has been assessed and tested and conforms to the\n${data.euDirective}`,
      manufacturerLabel: "Manufacturer:",
      manufacturer: data.manufacturer,
      equipmentDescriptionLabel: "Description of the Pressure Equipment:",
      equipmentDescription: data.equipmentDescription,
      modelLabel: "Model:",
      model: data.model,
      serialNumberLabel: "Serial Number:",
      serialNumber: data.serialNumber,
      pedCategory: "PED Category and Conformity Assessment Procedure:",
      pedTable: pedTableBody,
      field30: pedTableBody,
      swpLabel: "Safe Working Pressure:",
      swp: `${data.safeWorkingPressurePSI} PSI`,
      designTempLabel: "Designed Temperature:",
      designTemp: `${data.designedTemperatureC} °C`,
      hydroPressureLabel: "Hydrostatic Test Pressure:",
      hydroPressure: `${data.hydrostaticTestPressurePSI} PSI`,
      dateOfTestLabel: "Date of test:",
      dateOfTest: data.dateOfTest
        ? new Date(data.dateOfTest).toLocaleDateString()
        : "",
      signLineLead: data.signLineLead,
      signatoryName: data.signatoryName,
      signatoryTitle: data.signatoryTitle,
      validity: `This certificate is valid for ${data.validityMonths} months from date of issue.`,
    },
  ];
}

function buildVm350DeclarationInputs(
  data: Vm350DeclarationData
): Record<string, any>[] {
  return [
    {
      serialNumber: data.serialNumber,
    },
  ];
}

async function buildInputsForVariant(
  variant: SupportedCertificationVariant,
  data: CertificationDataModel
): Promise<Record<string, any>[]> {
  switch (variant) {
    case "ec-vm-350-declaration":
      return buildVm350DeclarationInputs(data as Vm350DeclarationData);
    case "hydrostatic-test":
      return buildHydrostaticInputs(data as HydrostaticCertificationData);
    default:
      throw new Error(`Unsupported certification variant: ${variant}`);
  }
}

function applyTemplateTransforms(
  template: Template,
  variant: SupportedCertificationVariant
) {
  if (variant === "hydrostatic-test") {
    dashifyLine(template, "modelUnderline", 1, 1);
    dashifyLine(template, "serialUnderline", 1, 1);
  }
}

export async function buildCertificationPdf(
  data: CertificationDataModel,
  opts: BuildOptions | string = {
    templatePath: "pdf/template/certifications/hydrostatic-test.json",
    variant: "hydrostatic-test",
  }
): Promise<Uint8Array> {
  const options: BuildOptions =
    typeof opts === "string" ? { templatePath: opts } : opts || {};
  const variant = options.variant ?? "hydrostatic-test";

  const loadedTemplate = await loadTemplate(options);
  const template = await materializeTemplate(loadedTemplate, variant);
  applyTemplateTransforms(template, variant);

  const [fontMap, inputs] = await Promise.all([
    loadFontMap(),
    buildInputsForVariant(variant, data),
  ]);

  return generate({
    template,
    inputs,
    options: { font: fontMap },
    plugins: { text, image, line, rectangle, Table: table },
  });
}
