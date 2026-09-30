import { z } from "zod";
import { SERIAL_NUMBER_FORMAT_MESSAGE, serialisedDeclarationNumber } from "@/lib/certifications/release";
import { supplementalDeclarationProfile } from "@/lib/certifications/declarations";
import { hydrostaticSchema } from "@/lib/certifications/hydrostatic";
import { HYDROSTATIC_CERTIFICATE_TITLE } from "@/lib/certifications/labels";

export type FieldSpec = {
  name: string;
  label: string;
  type: "text" | "date" | "select" | "number";
  options?: { label: string; value: string }[];
  placeholder?: string;
  required?: boolean;
};

export type CertificationTypeDef = {
  slug: string;
  title: string;
  templatePath: string;
  defaults: Record<string, any>;
  schema: z.ZodTypeAny;
  fieldLayout: FieldSpec[];
};

const declarationNumber = z.string().trim().min(1, "Declaration No. is required").max(80, "Declaration No. must be 80 characters or fewer");
const issueDate = z.string().trim().min(1, "Date of issue is required").max(40)
  .refine((value) => !Number.isNaN(Date.parse(value)), "Date of issue must be a valid date");

export const CERT_TYPES: Record<string, CertificationTypeDef> = {
  "ec-vm-350-declaration": {
    slug: "ec-vm-350-declaration",
    title: "EC Declaration of Conformity (VM 350)",
    templatePath: "pdf/template/certifications/ec-vm-350-declaration.json",
    defaults: {
      titleTop: "EC Declaration of Conformity",
      equipmentDescription: "Varimount Compressor",
      model: "VM 350",
      serialNumber: "",
      manufacturer: "Applied Concepts Ltd.",
      manufacturerAddress:
        "Roscrea Rd, Birr, Co. Offaly, R42 XW08, Republic of Ireland.",
      applicableLegislation: [
        "Directive 2006/42/EC of the European Parliament and of the Council of 17 May 2006 on machinery.",
        "Directive 2014/68/EU of the European Parliament and of the Council of 15 May 2014 on the harmonisation of the laws of the Member States relating to the making available on the market of pressure equipment (PED).",
      ],
      conformityAssessmentProcedure: "Module A2",
      applicableStandards:
        "EN ISO 12100:2010; EN ISO 4414:2010; EN 1012-1:2010",
      technicalFileContactName: "Mark Clendennen",
      technicalFileContactTitle: "Managing Director",
      technicalFileContactAddress:
        "Roscrea Rd, Birr, Co. Offaly, R42 XW08, Republic of Ireland.",
      placeOfIssue: "Birr, Co. Offaly",
      signatoryName: "Mark Clendennen",
      signatoryTitle: "Managing Director",
    },
    schema: z.object({
      serialNumber: z
        .string()
        .regex(/^AP-\d{2}-\d{4}$/, "Serial Number must match AP-00-0000"),
    }),
    fieldLayout: [
      {
        name: "serialNumber",
        label: "Serial Number",
        type: "text",
        placeholder: "e.g., VM350-001",
      },
    ],
  },
  "eu-doc-owner-manual-blasting": {
    slug: "eu-doc-owner-manual-blasting",
    title: "EU DoC - Owner's Manual - Blast Machines",
    templatePath: "",
    defaults: {
      declarationNumber: "",
      issueDate: "",
    },
    schema: z.object({
      declarationNumber,
      issueDate,
    }),
    fieldLayout: [
      {
        name: "declarationNumber",
        label: "Declaration No.",
        type: "text",
        placeholder: "e.g., ACL-DoC-OM01",
        required: true,
      },
      {
        name: "issueDate",
        label: "Date of issue",
        type: "date",
        required: true,
      },
    ],
  },
  "eu-doc-owner-manual-pto-compressors": {
    slug: "eu-doc-owner-manual-pto-compressors",
    title: "EU DoC - Owner's Manual - PTO Compressors",
    templatePath: "",
    defaults: {
      declarationNumber: "",
      issueDate: "",
    },
    schema: z.object({
      declarationNumber,
      issueDate,
    }),
    fieldLayout: [
      {
        name: "declarationNumber",
        label: "Declaration No.",
        type: "text",
        placeholder: "e.g., ACL-DoC-OM02",
        required: true,
      },
      {
        name: "issueDate",
        label: "Date of issue",
        type: "date",
        required: true,
      },
    ],
  },
  "eu-doc-serialised": {
    slug: "eu-doc-serialised",
    title: "EU DoC - Serialised - Blast Machines",
    templatePath: "",
    defaults: {
      declarationNumber: "",
      issueDate: "",
      commercialName: "",
      modelType: "",
      serialNumber: "",
      yearOfConstruction: "",
    },
    schema: z.object({
      declarationNumber,
      issueDate,
      commercialName: z.string().trim().min(1, "Commercial name is required").max(160, "Commercial name must be 160 characters or fewer"),
      modelType: z.string().trim().min(1, "Model / type is required").max(80, "Model / type must be 80 characters or fewer"),
      serialNumber: z.string().trim().refine((value) => serialisedDeclarationNumber(value) !== null, SERIAL_NUMBER_FORMAT_MESSAGE),
      yearOfConstruction: z
        .string()
        .trim()
        .regex(/^\d{4}$/, "Year must use four digits"),
    }),
    fieldLayout: [
      {
        name: "declarationNumber",
        label: "Declaration No.",
        type: "text",
        placeholder: "Automatic",
        required: true,
      },
      {
        name: "issueDate",
        label: "Date of issue",
        type: "date",
        required: true,
      },
      {
        name: "commercialName",
        label: "Commercial name",
        type: "text",
        placeholder: "e.g., Blast Machine BP200L",
        required: true,
      },
      {
        name: "modelType",
        label: "Model / type",
        type: "text",
        placeholder: "e.g., BP-A-5000",
        required: true,
      },
      {
        name: "serialNumber",
        label: "Serial number",
        type: "text",
        placeholder: "e.g., AP-26-00321",
        required: true,
      },
      {
        name: "yearOfConstruction",
        label: "Year of construction",
        type: "text",
        placeholder: "e.g., 2025",
        required: true,
      },
    ],
  },
  "hydrostatic-test": {
    slug: "hydrostatic-test",
    title: HYDROSTATIC_CERTIFICATE_TITLE,
    templatePath: "pdf/template/certifications/hydrostatic-test.json",
    defaults: { testMedium: "water", testResult: "" },
    schema: hydrostaticSchema,
    fieldLayout: [
      {
        name: "model",
        label: "Model",
        type: "text",
        placeholder: "e.g., SX-200",
      },
      {
        name: "serialNumber",
        label: "Serial Number",
        type: "text",
        placeholder: "e.g., AC-12345",
      },
      { name: "certificateNumber", label: "Certificate No.", type: "text", required: true },
      { name: "yearOfManufacture", label: "Year of manufacture", type: "text", required: true },
      { name: "equipmentDescription", label: "Equipment description", type: "text", required: true },
      { name: "dateOfTest", label: "Date of Test", type: "date", required: true },
      { name: "pedCategory", label: "PED category", type: "select", required: true, options: [
        { label: "Cat. I", value: "cat-i" }, { label: "Cat. II", value: "cat-ii" },
        { label: "Cat. III", value: "cat-iii" }, { label: "Article 4(3) / SEP", value: "sep" },
      ] },
      { name: "assessmentModules", label: "Assessment module(s)", type: "text", required: true },
      { name: "maxPressureBar", label: "Maximum allowable pressure (bar)", type: "number", required: true },
      { name: "testPressureBar", label: "Hydrostatic test pressure (bar)", type: "number", required: true },
      { name: "minTemperatureC", label: "Minimum temperature (C)", type: "number", required: true },
      { name: "maxTemperatureC", label: "Maximum temperature (C)", type: "number", required: true },
      { name: "testMedium", label: "Test medium", type: "text", required: true },
      { name: "holdingMinutes", label: "Holding time (minutes)", type: "number", required: true },
      { name: "testResult", label: "Test result", type: "select", required: true, options: [
        { label: "PASS - no leakage / deformation", value: "pass" },
        { label: "FAIL", value: "fail" },
      ] },
    ],
  },
};

for (const [slug, title, serialised] of [
  ["eu-doc-20l-manual", "EU DoC - Owner's Manual - 20L Blast Machine", false],
  ["eu-doc-20l-serialised", "EU DoC - Serialised - 20L Blast Machine", true],
  ["sep-air-filter-manual", "SEP Declaration - Owner's Manual - Air Filter", false],
  ["sep-air-filter-serialised", "SEP Declaration - Serialised - Air Filter", true],
] as const) {
  const base = CERT_TYPES[serialised ? "eu-doc-serialised" : "eu-doc-owner-manual-blasting"];
  const profile = supplementalDeclarationProfile(slug)!;
  CERT_TYPES[slug] = {
    ...base,
    slug,
    title,
    defaults: { ...base.defaults },
    fieldLayout: base.fieldLayout.map(field => ({
      ...field,
      placeholder: field.name === "declarationNumber" && !serialised ? `${profile.numberPrefix}-OM01`
        : field.name === "commercialName" ? profile.commercialName
        : field.name === "modelType" ? profile.modelType : field.placeholder,
    })),
  };
}
