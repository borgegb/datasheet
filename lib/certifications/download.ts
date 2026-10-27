import { isDeclarationType } from "@/lib/certifications/declarations";

function part(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^[.-]+|[.-]+$/g, "").slice(0, 120) : "";
}

export function certificateDownloadName(type: string, data: Record<string, unknown> | null | undefined) {
  const values = data || {};
  const number = part(isDeclarationType(type) ? values.declarationNumber : values.certificateNumber);
  const fallback = [part(type), part(values.serialNumber)].filter(Boolean).join("-") || "certificate";
  const revision = isDeclarationType(type) && part(values.revision) ? `_Rev${part(values.revision)}` : "";
  const name = `${number || fallback}${revision}`;
  return `${values.documentMode === "test" && !name.startsWith("TEST-") ? "TEST-" : ""}${name}.pdf`;
}
