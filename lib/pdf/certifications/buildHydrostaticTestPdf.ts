import { PDFDocument, PDFFont, rgb } from "pdf-lib";
import { promises as fs } from "node:fs";
import path from "node:path";
// @ts-expect-error fontkit does not ship local TypeScript declarations.
import * as fontkit from "fontkit";
import { hydrostaticSchema, type HydrostaticData } from "@/lib/certifications/hydrostatic";
import { blueSignaturePng } from "@/lib/pdf/certifications/signatureInk";

type BuildOptions = { signaturePng?: Uint8Array; isTest?: boolean };
const WIDTH = 595.28, HEIGHT = 841.89;
const LEFT = 108, RIGHT = 547;
const BLACK = rgb(0.05, 0.05, 0.05), GREY = rgb(0.38, 0.38, 0.38);

export async function buildHydrostaticTestPdf(data: HydrostaticData, options: BuildOptions = {}): Promise<Uint8Array> {
  const input = hydrostaticSchema.parse(data);
  if (!options.isTest && !options.signaturePng) throw new Error("A configured signature is required to issue a hydrostatic certificate.");
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(await fs.readFile(path.resolve("pdf/fonts/Inter-Regular.ttf")));
  const bold = await doc.embedFont(await fs.readFile(path.resolve("pdf/fonts/Inter-Bold.ttf")));
  const logo = await doc.embedJpg(await fs.readFile(path.resolve("pdf/assets/Appliedlogo.jpg")));
  const ribbon = await doc.embedPng(await fs.readFile(path.resolve("pdf/assets/leftRibbon.png")));
  const page = doc.addPage([WIDTH, HEIGHT]);
  const text = (value: string, x: number, top: number, size = 9.5, font = regular, color = BLACK) =>
    page.drawText(value, { x, y: HEIGHT - top - size, size, font, color });
  function lines(value: string, width: number, font: PDFFont, size: number) {
    const result: string[] = [];
    for (const paragraph of value.split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= width) { line = candidate; continue; }
        if (line) result.push(line);
        line = "";
        // Long product identifiers need the same overflow protection as prose.
        for (const char of word) {
          if (font.widthOfTextAtSize(line + char, size) > width) { result.push(line); line = ""; }
          line += char;
        }
      }
      result.push(line);
    }
    return result;
  }
  function paragraph(value: string, x: number, top: number, width: number, size = 9.5, font = regular, color = BLACK) {
    const wrapped = lines(value, width, font, size);
    wrapped.forEach((line, i) => text(line, x, top + i * (size + 3), size, font, color));
    return top + wrapped.length * (size + 3);
  }

  page.drawImage(ribbon, { x: 0, y: 16, width: 74, height: HEIGHT - 32 });
  page.drawRectangle({ x: 398, y: HEIGHT - 205, width: 149, height: 173, color: rgb(0.85, 0.85, 0.85) });
  page.drawImage(logo, { x: 430, y: HEIGHT - 118, width: 86, height: 80 });
  text("Applied Concepts Ltd.", 410, 123, 9.5);
  paragraph("LEADERS IN\nBLASTING\nTECHNOLOGY", 410, 143, 128, 10, bold);
  text("www.appliedpi.com", 410, 184, 9.5);
  text("Certificate of Hydrostatic Test", 130, 101, 13, bold);
  const headingBottom = paragraph(`Certificate No. ${input.certificateNumber}`, 130, 124, 248, 9, regular, GREY);
  if (headingBottom > 186) throw new Error("Certificate number is too long for the header.");
  if (options.isTest) text("TEST / NOT FOR ISSUE - UNSIGNED", LEFT, 211, 10, bold, GREY);

  let y = 241;
  y = paragraph(input.testResult === "pass"
    ? "The pressure equipment identified below has been hydrostatically tested by the manufacturer and conforms to the Pressure Equipment Directive 2014/68/EU."
    : "The pressure equipment identified below has been hydrostatically tested by the manufacturer. The test failed; this document does not state conformity with the Pressure Equipment Directive 2014/68/EU.",
  LEFT, y, RIGHT - LEFT) + 14;
  function field(label: string, value: string, gap = 8, color = BLACK) {
    const labelWidth = bold.widthOfTextAtSize(label, 9.5) + 6;
    text(label, LEFT, y, 9.5, bold);
    y = paragraph(value, LEFT + labelWidth, y, RIGHT - LEFT - labelWidth, 9.5, regular, color) + gap;
  }
  field("Manufacturer:", "Applied Concepts Ltd, Roscrea Road, Birr, Co Offaly, R42 XW08, Republic of Ireland");
  field("Description of the Pressure Equipment:", input.equipmentDescription, 14);
  field("Model:", input.model);
  field("Serial Number:", input.serialNumber);
  field("Year of Manufacture:", input.yearOfManufacture, 14);
  text("PED Category and Conformity Assessment Procedure:", LEFT, y, 9.5, bold);
  y += 18;
  const category = { "cat-i": "CAT I", "cat-ii": "CAT II", "cat-iii": "CAT III", sep: "Article 4(3) / SEP" }[input.pedCategory];
  const columns = ["Equipment", "PED Category", "Assessment module(s)"];
  const values = [input.equipmentDescription, category, input.assessmentModules];
  const widths = [155, 119, RIGHT - LEFT - 274];
  for (const row of [columns, values]) {
    const rowLines = row.map((value, i) => lines(value, widths[i] - 12, regular, 9.5));
    const height = Math.max(31, Math.max(...rowLines.map(value => value.length)) * 12.5 + 12);
    let x = LEFT;
    rowLines.forEach((cell, index) => {
      page.drawRectangle({ x, y: HEIGHT - y - height, width: widths[index], height, borderColor: BLACK, borderWidth: 0.7 });
      cell.forEach((line, i) => text(line, x + (widths[index] - regular.widthOfTextAtSize(line, 9.5)) / 2, y + 7 + i * 12.5));
      x += widths[index];
    });
    y += height;
  }
  y += 28;
  const pressure = (value: string) => `${Number(value)} bar (${Math.round(Number(value) * 14.5037738)} psi)`;
  const temperature = (value: string) => `${Number(value) > 0 ? "+" : ""}${Number(value)} °C`;
  field("Maximum Allowable Pressure (PS):", pressure(input.maxPressureBar));
  field("Allowable Temperature (TS min / max):", `${temperature(input.minTemperatureC)} / ${temperature(input.maxTemperatureC)}`);
  field("Hydrostatic Test Pressure (PT):", `${pressure(input.testPressureBar)} - ${input.testMedium}, held for ${Number(input.holdingMinutes)} minutes`);
  field("Result:", input.testResult === "pass" ? "PASS - no leakage, no permanent deformation" : "FAIL - test acceptance criteria not met", 8,
    input.testResult === "pass" ? rgb(0.12, 0.34, 0.23) : BLACK);
  const [year, month, day] = input.dateOfTest.split("-");
  field("Date of Test:", `${day}/${month}/${year}`, 17);
  if (y + 94 > HEIGHT - 35) throw new Error("Hydrostatic certificate details are too long for one page. Shorten the model, description or assessment modules.");
  text(`${input.testResult === "pass" ? "Approved" : "Recorded"} on behalf of Applied Concepts Ltd:`, LEFT, y, 9.5, bold);
  y += 21;
  if (!options.isTest && options.signaturePng) {
    const signature = await doc.embedPng(await blueSignaturePng(options.signaturePng));
    const scale = Math.min(142 / signature.width, 34 / signature.height);
    page.drawImage(signature, { x: LEFT + 5, y: HEIGHT - y - 34, width: signature.width * scale, height: signature.height * scale });
  }
  y += 38;
  page.drawLine({ start: { x: LEFT, y: HEIGHT - y }, end: { x: LEFT + 210, y: HEIGHT - y }, thickness: 0.7, color: BLACK });
  text("Mark Clendennen", LEFT, y + 3, 9.5);
  text("Managing Director - Authorised Signatory", LEFT, y + 22, 9, regular, GREY);
  return doc.save();
}
