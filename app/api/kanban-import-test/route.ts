import { createHash } from "node:crypto";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { prepareTestCards, sameTestCards, testCardId, testImportSchema } from "@/lib/kanban/import-test";

export const runtime = "nodejs";
export const maxDuration = 60;
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development" && process.env.VERCEL_ENV !== "preview")
    return fail("Test imports are available only in a preview deployment.", 403);
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return fail("Open the review page to confirm this test import.", 403);
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return fail("Sign in before importing test copies.", 401);
  const { data: profile, error: profileError } = await supabase.from("profiles")
    .select("organization_id,role").eq("id", user.id).single();
  if (profileError || !profile?.organization_id) return fail("Your organisation could not be verified.", 403);
  if (!["owner", "member"].includes(profile.role)) return fail("An organisation editor must confirm test imports.", 403);
  const org = profile.organization_id as string;
  try {
    if (Number(request.headers.get("content-length")) > 3_500_000)
      return fail("Test images must total less than 3 MB. Choose smaller images for this test.", 413);
    const form = await request.formData();
    const parsed = testImportSchema.safeParse(JSON.parse(String(form.get("payload"))));
    if (!parsed.success) return fail("Choose one to three valid rows with a part number, location and colour.", 400);
    const payload = parsed.data;
    const uploads: { path: string; bytes: Buffer; contentType: string }[] = [];
    const paths: (string | null)[] = [];
    let bytesTotal = 0;
    for (let i = 0; i < payload.rows.length; i++) {
      const image = form.get(`image${i}`);
      if (!image) { paths.push(null); continue; }
      if (!(image instanceof File)) return fail("Invalid test image.", 400);
      bytesTotal += image.size;
      if (bytesTotal > 3_000_000) return fail("Test images must total less than 3 MB.", 413);
      let bytes = Buffer.from(await image.arrayBuffer());
      const metadata = await sharp(bytes, { limitInputPixels: 25_000_000 }).metadata();
      if (!metadata.format || !["png", "jpeg", "webp"].includes(metadata.format))
        return fail("Use PNG, JPEG or WebP images for the test.", 400);
      // The card PDF renderer accepts PNG/JPEG; convert WebP during import.
      const format = metadata.format === "webp" ? "png" : metadata.format;
      if (metadata.format === "webp") bytes = Buffer.from(await sharp(bytes, { limitInputPixels: 25_000_000 }).png().toBuffer());
      const digest = createHash("sha256").update(bytes).digest("hex");
      const path = `${org}/kanban/test-imports/${user.id}/${payload.batchId}/${digest}.${format}`;
      paths.push(path);
      uploads.push({ path, bytes, contentType: `image/${format}` });
    }
    const expected = prepareTestCards(payload, org, user.id, paths);
    // Always look at all three slots: reusing a batch ID with fewer rows must
    // not silently accept a different batch. IDs are scoped to org and user.
    const ids = [0, 1, 2].map(i => testCardId(org, user.id, payload.batchId, i));
    const readSaved = () => supabase.from("kanban_cards").select("*")
      .eq("organization_id", org).in("id", ids);
    const existing = await readSaved();
    if (existing.error) return fail("Could not check whether this test was already saved. Retry the same test.", 500);
    if (existing.data?.length) {
      if (!sameTestCards(existing.data, expected)) return fail("This test was already saved with different details. Open the saved cards before starting another test.", 409);
      return NextResponse.json({ cards: expected, reused: true });
    }
    for (const upload of uploads) {
      const { error } = await supabase.storage.from("datasheet-assets")
        .upload(upload.path, upload.bytes, { contentType: upload.contentType, upsert: false });
      if (error && error.message !== "The resource already exists" && error.message !== "Duplicate")
        return fail("A test image could not be saved. Retry the same test; no cards have been created yet.", 500);
    }
    // One atomic insert; never update/upsert a real card or catalogue product.
    const inserted = await supabase.from("kanban_cards").insert(expected);
    if (inserted.error) {
      const raced = await readSaved();
      if (raced.error || !sameTestCards(raced.data ?? [], expected))
        return fail("The test cards could not be confirmed. Retry this same test to check its saved state safely.", 500);
    }
    revalidatePath("/dashboard/kanban");
    return NextResponse.json({ cards: expected, reused: false });
  } catch {
    return fail("The test could not be completed. Check the file and images, then retry the same test.", 400);
  }
}
