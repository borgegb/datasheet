import { z } from "zod";

export const UNIT_SERIAL_MESSAGE = "Enter a four-digit year of manufacture and exactly five serial digits.";
export const manufactureYearSchema = z.string().trim().regex(/^(19|20|21)\d{2}$/, "Enter a year of manufacture between 1900 and 2199");
export const unitSerialSchema = z.string().trim().regex(/^AP-\d{2}-\d{5}$/, UNIT_SERIAL_MESSAGE);

export function unitSerialNumber(year: unknown, digits: unknown): string {
  if (!manufactureYearSchema.safeParse(year).success || typeof digits !== "string" || !/^\d{5}$/.test(digits)) return "";
  return `AP-${String(year).trim().slice(-2)}-${digits}`;
}

export function serialMatchesYear(serial: string, year: string) {
  return serial === unitSerialNumber(year, serial.slice(-5));
}

export function calendarDateValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Earlier calendar clients sent UTC-midnight timestamps instead of date-only values.
export const certificateDateSchema = z.preprocess(value =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(value) ? value.slice(0, 10) : value,
  z.string().trim().refine(value => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value,
  "Select a valid date")
);
