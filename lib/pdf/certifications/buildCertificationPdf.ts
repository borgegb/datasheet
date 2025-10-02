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

export async function buildCertificationPdf(
  data: CertificationDataModel,
  templatePath: string = "pdf/template/certifications/hydrostatic-test.json"
): Promise<Uint8Array> {
  // Load template from filesystem to avoid bundler dynamic import constraints
  const absPath = path.resolve(process.cwd(), templatePath);
  const templateRaw = await fs.readFile(absPath, "utf8");
  const parsed = JSON.parse(templateRaw);
  const template: Template = parsed as Template;

  // Fonts
  const defaultFonts = getDefaultFont();
  const fontDir = path.resolve(process.cwd(), "pdf/fonts");
  let fontMap: Font = { ...defaultFonts };
  try {
    const interBold = await fs.readFile(path.join(fontDir, "Inter-Bold.ttf"));
    const interRegular = await fs.readFile(
      path.join(fontDir, "Inter-Regular.ttf")
    );
    fontMap = {
      ...fontMap,
      "Inter-Bold": {
        data: interBold,
        fallback: true,
      },
      "Inter-Regular": {
        data: interRegular,
        fallback: true,
      },
    } as unknown as Font;
  } catch (e) {
    // Use default font if Inter is unavailable
  }

  // Assets
  let appliedLogoBase64 = "";
  try {
    const logoPath = path.resolve(process.cwd(), "pdf/assets/Appliedweb.jpg");
    const file = await fs.readFile(logoPath);
    appliedLogoBase64 = `data:image/jpeg;base64,${file.toString("base64")}`;
  } catch (e) {
    appliedLogoBase64 = "";
  }

  // Build table for PED
  const pedTableBody = [data.ped.columns, data.ped.row];

  const inputs = [
    {
      logo: appliedLogoBase64,
      leftRibbon: data.branding.leftRibbonText,
      titleTop: data.titleTop,
      titleBottom: data.titleBottom,
      intro: `The equipment has been assessed and tested and conforms to the ${data.euDirective}.`,
      manufacturer: data.manufacturer,
      equipmentDescription: data.equipmentDescription,
      model: data.model,
      serialNumber: data.serialNumber,
      pedTable: pedTableBody,
      swp: `${data.safeWorkingPressurePSI} PSI`,
      designTemp: `${data.designedTemperatureC} °C`,
      hydroPressure: `${data.hydrostaticTestPressurePSI} PSI`,
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
