import { z } from "zod";

export const DOCUMENT_REVISIONS = ["01", "02", "03", "04", "05"] as const;

export const documentRevisionSchema = z.enum(DOCUMENT_REVISIONS, {
  errorMap: () => ({ message: "Revision must be between 01 and 05" }),
}).default("01");
