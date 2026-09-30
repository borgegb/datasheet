import { z } from "zod";

const requiredText = (label: string, max = 160) => z.string().trim().min(1, `${label} is required`).max(max);
const numberField = (label: string, min: number, max: number) =>
  requiredText(label, 20).refine(value => /^-?\d+(\.\d+)?$/.test(value) && Number(value) >= min && Number(value) <= max,
    `${label} must be between ${min} and ${max}`);

export const hydrostaticSchema = z.object({
  model: requiredText("Model"),
  certificateNumber: requiredText("Certificate No.", 100),
  equipmentDescription: requiredText("Equipment description", 100),
  serialNumber: requiredText("Serial number", 60),
  yearOfManufacture: z.string().trim().regex(/^\d{4}$/, "Year of manufacture must use four digits"),
  dateOfTest: requiredText("Date of test", 10).refine(value => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, "Enter a valid test date"),
  pedCategory: z.enum(["cat-i", "cat-ii", "cat-iii", "sep"], { errorMap: () => ({ message: "Select a PED category" }) }),
  assessmentModules: requiredText("Assessment module(s)", 60),
  maxPressureBar: numberField("Maximum allowable pressure", 0.01, 1000),
  minTemperatureC: numberField("Minimum temperature", -273, 1000),
  maxTemperatureC: numberField("Maximum temperature", -273, 1000),
  testPressureBar: numberField("Hydrostatic test pressure", 0.01, 2000),
  holdingMinutes: numberField("Holding time", 0.1, 1440),
  testMedium: requiredText("Test medium", 40),
  testResult: z.enum(["pass", "fail"], { errorMap: () => ({ message: "Select the actual test result" }) }),
}).refine(data => Number(data.minTemperatureC) <= Number(data.maxTemperatureC), {
  message: "Minimum temperature must not exceed maximum temperature", path: ["minTemperatureC"],
}).refine(data => Number(data.testPressureBar) >= Number(data.maxPressureBar), {
  message: "Test pressure must not be below maximum allowable pressure", path: ["testPressureBar"],
});

export type HydrostaticData = z.infer<typeof hydrostaticSchema>;

export function hydrostaticAssessmentModules(category: string) {
  const modules: Record<string, string> = {
    "cat-i": "A",
    "cat-ii": "A2 (NB 2810)",
    "cat-iii": "B + C2 (NB 2810)",
    sep: "Not applicable (Article 4(3))",
  };
  return modules[category] || "";
}

export function hydrostaticCertificateNumber(productCode: string | null, serial: unknown) {
  if (!productCode?.trim() || typeof serial !== "string" || !serial.trim()) return "";
  const model = productCode.trim() === "BP-A-2000" ? "BP40L" : productCode.trim();
  return `ACL-HT-${model}-${serial.trim()}`;
}

export function hydrostaticProductFields(product: {
  product_title: string | null;
  product_code: string | null;
  eu_doc_ped_category?: string | null;
}) {
  const is40L = product.product_code?.trim() === "BP-A-2000";
  const category = product.eu_doc_ped_category || (is40L ? "cat-ii" : "");
  return {
    model: [product.product_title, is40L ? "BP40L / BP-A-2000" : product.product_code].filter(Boolean).join(" - "),
    certificateNumber: "", serialNumber: "", yearOfManufacture: "", dateOfTest: "", testResult: "",
    equipmentDescription: is40L ? "Blast Vessel" : "",
    pedCategory: category,
    assessmentModules: hydrostaticAssessmentModules(category),
    // Only the supplied BP40L reference confirms these test parameters.
    maxPressureBar: is40L ? "8.6" : "",
    minTemperatureC: is40L ? "-10" : "", maxTemperatureC: is40L ? "80" : "",
    testPressureBar: is40L ? "20" : "", holdingMinutes: is40L ? "15" : "",
    testMedium: "water",
  };
}
