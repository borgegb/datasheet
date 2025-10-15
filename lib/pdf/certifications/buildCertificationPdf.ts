import { generate } from "@pdfme/generator";
import { text, image, line, rectangle, table } from "@pdfme/schemas";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getDefaultFont } from "@pdfme/common";
import type { Template, Font } from "@pdfme/common";

export interface CertificationDataModel {
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
}

type BuildOptions = {
  templatePath?: string;
  template?: Template;
};

export async function buildCertificationPdf(
  data: CertificationDataModel,
  opts: BuildOptions | string = {
    templatePath: "pdf/template/certifications/hydrostatic-test.json",
  }
): Promise<Uint8Array> {
  let template: Template | null = null;

  // Back-compat if a string path was passed
  const options: BuildOptions =
    typeof opts === "string" ? { templatePath: opts } : opts || {};

  if (options.template) {
    template = options.template as Template;
  } else if (options.templatePath) {
    // Load template from filesystem (works in dev and in serverless if file bundled)
    const absPath = path.resolve(process.cwd(), options.templatePath);
    const templateRaw = await fs.readFile(absPath, "utf8");
    const parsed = JSON.parse(templateRaw);
    template = parsed as Template;
  }

  if (!template) {
    throw new Error("No certificate template provided or found.");
  }

  // Normalize template fields (match kanban approach)
  const normalizedTemplate: Template = {
    ...(template as any),
    basePdf: {
      ...(template as any).basePdf,
      padding: (template as any).basePdf.padding as [
        number,
        number,
        number,
        number
      ],
    },
  } as Template;
  template = normalizedTemplate;

  // Fonts
  const fontDir = path.resolve(process.cwd(), "pdf/fonts");
  // Start with pdfme default (Roboto) but ensure it is NOT fallback
  const defaultFontsObj = getDefaultFont();
  if (defaultFontsObj.Roboto) {
    defaultFontsObj.Roboto.fallback = false;
  }
  let fontMap: Font = { ...defaultFontsObj };
  try {
    const interBold = await fs.readFile(path.join(fontDir, "Inter-Bold.ttf"));
    const interRegular = await fs.readFile(
      path.join(fontDir, "Inter-Regular.ttf")
    );
    // Only ONE fallback font is allowed. Use Inter-Regular as the fallback.
    fontMap = {
      ...fontMap,
      "Inter-Regular": { data: interRegular, subset: true, fallback: true },
      "Inter-Bold": { data: interBold, subset: true },
    } as unknown as Font;
  } catch (e) {
    // If Inter fonts are not available, keep Roboto (non-fallback) and rely on default glyphs
  }

  // Assets
  let appliedLogoBase64 = "";
  let leftRibbonBase64 = "";
  try {
    const logoPath = path.resolve(process.cwd(), "pdf/assets/Appliedweb.jpg");
    const file = await fs.readFile(logoPath);
    appliedLogoBase64 = `data:image/jpeg;base64,${file.toString("base64")}`;
  } catch (e) {
    appliedLogoBase64 = "";
  }
  try {
    const leftRibbonPath = path.resolve(
      process.cwd(),
      "pdf/assets/leftRibbon.png"
    );
    const file = await fs.readFile(leftRibbonPath);
    leftRibbonBase64 = `data:image/png;base64,${file.toString("base64")}`;
  } catch (e) {
    leftRibbonBase64 = "";
  }

  // Build table rows. Current template uses showHead=false, so include header labels as first body row
  const pedTableBody = [data.ped.columns, data.ped.row];

  const inputs = [
    {
      logo: appliedLogoBase64,
      watermarkLogo: appliedLogoBase64,
      leftRibbon: leftRibbonBase64,
      companyNameStatic: data.branding.companyName || "Applied Concepts",
      taglineStatic:
        (data.branding.tagline &&
          data.branding.tagline.replace(
            /\s+IN\s+BLASTING\s+TECHNOLOGY/i,
            " IN\nBLASTING\nTECHNOLOGY"
          )) ||
        "LEADERS IN\nBLASTING\nTECHNOLOGY",
      // Merge title into one centered block with manual line break
      titleTop: `${data.titleTop}\nCertificate of Hydrostatic Test`,
      titleBottom: "",
      // Two-line intro with manual break before directive
      intro: `The following equipment has been assessed and tested and conforms to the\n${data.euDirective}`,
      manufacturerLabel: "Manufacturer:",
      manufacturer: data.manufacturer,
      equipmentDescriptionLabel: "Description of the Pressure Equipment:",
      equipmentDescription: data.equipmentDescription,
      modelLabel: "Model:",
      model: data.model,
      serialNumberLabel: "Serial Number:",
      serialNumber: data.serialNumber,
      pedTable: pedTableBody,
      // Support current template table name
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

  const pdfBytes = await generate({
    template,
    inputs,
    options: { font: fontMap },
    plugins: { text, image, line, rectangle, Table: table },
  });

  return pdfBytes;
}
