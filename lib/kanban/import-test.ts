import { createHash } from "node:crypto";
import { z } from "zod";
import { isKanbanHeaderColor } from "./colors";

const field = z.string().trim().max(2000);
export const testImportSchema = z.object({
  batchId: z.string().uuid(),
  rows: z.array(z.object({
    part_no: field.min(1),
    description: field,
    location: field.min(1),
    preferred_supplier: field,
    order_quantity: z.string().trim().refine(value => value === "" ||
      (/^\d+$/.test(value) && Number(value) <= 2147483647), "Use a whole quantity or leave it blank."),
    lead_time: field,
    header_color: z.string().refine(isKanbanHeaderColor),
  }).strict()).min(1).max(3),
}).strict();

export function testCardId(organizationId: string, userId: string, batchId: string, index: number) {
  const hash = createHash("sha256").update(`kanban-test-v1:${organizationId}:${userId}:${batchId}:${index}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function prepareTestCards(payload: z.infer<typeof testImportSchema>, organizationId: string, userId: string, imagePaths: (string | null)[]) {
  return payload.rows.map((row, index) => ({
    id: testCardId(organizationId, userId, payload.batchId, index),
    organization_id: organizationId,
    product_id: null,
    part_no: `TEST-IMPORT-${payload.batchId.slice(0, 8).toUpperCase()}-${index + 1}`,
    description: `[TEST COPY of ${row.part_no}] ${row.description}`,
    location: `TEST / ${row.location}`,
    preferred_supplier: row.preferred_supplier,
    order_quantity: row.order_quantity === "" ? null : Number(row.order_quantity),
    lead_time: row.lead_time,
    header_color: row.header_color,
    image_path: imagePaths[index] ?? null,
  }));
}

export type TestCard = ReturnType<typeof prepareTestCards>[number];
export function sameTestCards(saved: Record<string, unknown>[], expected: TestCard[]) {
  return saved.length === expected.length && expected.every(card => {
    const existing = saved.find(row => row.id === card.id);
    return existing && Object.entries(card).every(([key, value]) => existing[key] === value);
  });
}
