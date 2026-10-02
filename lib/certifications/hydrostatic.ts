import { z } from "zod";
import { certificateDateSchema, manufactureYearSchema, serialMatchesYear, unitSerialSchema } from "@/lib/certifications/unit";

const requiredText = (label: string, max = 160) => z.string().trim().min(1, `${label} is required`).max(max);
const numberField = (label: string, min: number, max: number) =>
  requiredText(label, 20).refine(value => /^-?\d+(\.\d+)?$/.test(value) && Number(value) >= min && Number(value) <= max,
    `${label} must be between ${min} and ${max}`);

export const hydrostaticSchema = z.object({
  model: requiredText("Model"),
  certificateNumber: requiredText("Certificate No.", 100),
  equipmentDescription: requiredText("Equipment description", 100),
  serialNumber: unitSerialSchema,
  yearOfManufacture: manufactureYearSchema,
  dateOfTest: certificateDateSchema,
  pedCategory: z.enum(["cat-i", "cat-ii", "cat-iii", "sep"], { errorMap: () => ({ message: "Select a PED category" }) }),
  assessmentModules: requiredText("Assessment module(s)", 60),
  maxPressureBar: numberField("Maximum allowable pressure", 0.01, 1000),
  minTemperatureC: numberField("Minimum temperature", -273, 1000),
  maxTemperatureC: numberField("Maximum temperature", -273, 1000),
  testPressureBar: z.enum(["15", "20"]),
  holdingMinutes: numberField("Holding time (minutes)", 15, 1440),
  testMedium: z.literal("Water"),
  testResult: z.enum(["pass", "fail"], { errorMap: () => ({ message: "Select the actual test result" }) }),
}).refine(data => serialMatchesYear(data.serialNumber, data.yearOfManufacture), {
  message: "Serial number year must match the year of manufacture", path: ["serialNumber"],
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

export const hydrostaticProfileSchema = z.object({
  modelCode: z.string().trim().max(30).regex(/^[A-Z0-9-]*$/, "Model code must use uppercase letters, digits or hyphens"),
  equipmentDescription: z.string().trim().max(100),
  maxPressureBar: numberField("Maximum allowable pressure", 0.01, 20).or(z.literal("")),
  minTemperatureC: numberField("Minimum temperature", -273, 1000).or(z.literal("")),
  maxTemperatureC: numberField("Maximum temperature", -273, 1000).or(z.literal("")),
  volumeLitres: numberField("Volume", 0.01, 10000).or(z.literal("")).default(""),
  testPressureBar: z.enum(["15", "20", ""]).default("20"),
  requirement: z.enum(["mandatory", "optional", "not-applicable"]).default("mandatory"),
  issueEnabled: z.boolean(),
}).strict().refine(data => !data.minTemperatureC || !data.maxTemperatureC || Number(data.minTemperatureC) <= Number(data.maxTemperatureC), {
  message: "Minimum temperature must not exceed maximum temperature", path: ["minTemperatureC"],
}).refine(data => !data.issueEnabled || Boolean(data.modelCode && data.equipmentDescription && data.maxPressureBar && data.minTemperatureC && data.maxTemperatureC), {
  message: "Complete all Hydrostatic specifications before enabling signed certificates", path: ["issueEnabled"],
});

export type HydrostaticProfile = z.infer<typeof hydrostaticProfileSchema>;
export const EMPTY_HYDROSTATIC_PROFILE: HydrostaticProfile = {
  modelCode: "", equipmentDescription: "", maxPressureBar: "", minTemperatureC: "", maxTemperatureC: "",
  volumeLitres: "", testPressureBar: "20", requirement: "mandatory", issueEnabled: false,
};

export type HydrostaticProduct = {
  product_title: string | null;
  product_code: string | null;
  eu_doc_product_type?: string | null;
  eu_doc_ped_category?: string | null;
  eu_doc_certificate_no?: string | null;
  hydrostatic_profile?: unknown;
  certification_issue_enabled?: boolean | null;
};

export const OPTIONAL_HYDROSTATIC_NOTE = "Hydrostatic test not mandatory for this product (SEP) - certificate optional.";

export function hydrostaticRequirement(product: HydrostaticProduct) {
  if (product.eu_doc_product_type === "pto-compressor") return "not-applicable";
  if (product.eu_doc_product_type === "air-filter") return "optional";
  return "mandatory";
}

export function hydrostaticSetupError(product: HydrostaticProduct, issued = false): string | null {
  if (hydrostaticRequirement(product) === "not-applicable") return "Hydrostatic certificates do not apply to PTO compressors. Select the separate air receiver.";
  const isSep = product.eu_doc_product_type === "air-filter" && product.eu_doc_ped_category === "sep" && product.product_code === "AF-A-0001";
  if (!isSep && !["blast-machine", "air-receiver"].includes(product.eu_doc_product_type || "")) return "Hydrostatic certificates support blast machines, air receivers and the AF5L air filter only.";
  if (!isSep && !["cat-i", "cat-ii", "cat-iii"].includes(product.eu_doc_ped_category || "")) return "An organization owner must configure this product's PED category.";
  const result = hydrostaticProfileSchema.safeParse(product.hydrostatic_profile);
  if (!result.success || !result.data.modelCode || !result.data.equipmentDescription || !result.data.maxPressureBar || !result.data.minTemperatureC || !result.data.maxTemperatureC) {
    return "Hydrostatic setup incomplete. An organization owner must confirm the model code, description, pressure and temperature limits on this product.";
  }
  if (Number(result.data.maxPressureBar) > Number(result.data.testPressureBar)) return "Test pressure must not be below maximum allowable pressure.";
  if (result.data.testPressureBar !== (isSep ? "15" : "20")) return "Hydrostatic test pressure must be 15 bar for AF5L and 20 bar for blast machines and air receivers.";
  if (result.data.requirement !== hydrostaticRequirement(product)) return "Hydrostatic applicability must match the product type.";
  if (issued && product.certification_issue_enabled === false) return "Signed issuance is blocked for this product pending certification. Only unsigned test documents are available.";
  if (issued && !result.data.issueEnabled) return "Signed Hydrostatic certificates are not enabled for this product. Its specifications are pending approval.";
  if (issued && !isSep && product.eu_doc_ped_category !== "cat-i" && !product.eu_doc_certificate_no?.trim()) return "This product has no approved PED certificate number. Signed Hydrostatic certificates are blocked.";
  if (isSep && product.eu_doc_certificate_no?.trim()) return "SEP products must not have a Notified Body certificate number.";
  return null;
}

export function hydrostaticCertificateNumber(modelCode: string | null, serial: unknown) {
  if (!modelCode?.trim() || !unitSerialSchema.safeParse(serial).success) return "";
  return `ACL-HT-${modelCode.trim()}-${String(serial).trim()}`;
}

export function hydrostaticProductFields(product: HydrostaticProduct) {
  const profile = hydrostaticProfileSchema.safeParse(product.hydrostatic_profile);
  const values = profile.success ? profile.data : EMPTY_HYDROSTATIC_PROFILE;
  const category = product.eu_doc_ped_category || "";
  return {
    model: [values.modelCode, product.product_code].filter(Boolean).join(" / "),
    equipmentDescription: values.equipmentDescription,
    pedCategory: category,
    assessmentModules: hydrostaticAssessmentModules(category),
    maxPressureBar: values.maxPressureBar,
    minTemperatureC: values.minTemperatureC, maxTemperatureC: values.maxTemperatureC,
    testPressureBar: values.testPressureBar, testMedium: "Water",
  };
}

export function hydrostaticProductCertificateNumber(product: HydrostaticProduct, serial: unknown) {
  const result = hydrostaticProfileSchema.safeParse(product.hydrostatic_profile);
  return hydrostaticCertificateNumber(result.success ? result.data.modelCode : null, serial);
}

export const HYDROSTATIC_FIXED_FIELDS = ["model", "certificateNumber", "equipmentDescription", "pedCategory", "assessmentModules", "maxPressureBar", "minTemperatureC", "maxTemperatureC", "testPressureBar", "testMedium"];
