import { z } from "zod";

export type FieldSpec = {
  name: string;
  label: string;
  type: "text" | "date" | "select";
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

export const CERT_TYPES: Record<string, CertificationTypeDef> = {
  "hydrostatic-test": {
    slug: "hydrostatic-test",
    title: "Hydrostatic Test",
    templatePath: "pdf/template/certifications/hydrostatic-test.json",
    defaults: {
      titleTop: "EC Declaration of Conformity and",
      titleBottom: "Certificate of Hydrostatic Test",
      euDirective: "European Pressure Equipment Directive 97/23/EC",
      manufacturer:
        "Applied Concepts Ltd, Roscrea Road, Birr, Co Offaly, Republic of Ireland",
      equipmentDescription: "Blast Vessel",
      model: "",
      serialNumber: "",
      dateOfTest: "",
      ped: {
        header: "PED Category and Conformity Assessment Procedure",
        columns: ["Equipment", "PED Category", "Assessment module(s)"],
        row: ["Blast Vessel", "CAT I", "A"],
      },
      safeWorkingPressurePSI: 116,
      designedTemperatureC: 80,
      hydrostaticTestPressurePSI: 220,
      signLineLead: "Signed on behalf of Applied Concepts Ltd:",
      signatoryName: "Mark Clendennen",
      signatoryTitle: "Authorised Signatory",
      validityMonths: 24,
      branding: {
        companyName: "Applied Concepts",
        tagline: "LEADERS IN BLASTING TECHNOLOGY",
        leftRibbonText: "CERTIFICATE",
        showQcStamp: true,
      },
    },
    schema: z.object({
      model: z.string().min(1),
      serialNumber: z.string().min(1),
      dateOfTest: z.string().min(1),
    }),
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
      { name: "dateOfTest", label: "Date of Test", type: "date" },
    ],
  },
};
