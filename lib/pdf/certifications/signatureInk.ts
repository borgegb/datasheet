import sharp from "sharp";
import { validateSignaturePng } from "@/lib/certifications/signature";

export const SIGNATURE_INK = "#1746A2";
export type SignatureInk = typeof SIGNATURE_INK | "original";

export function signatureInkForDocument(type: string, productCode?: string | null): SignatureInk {
  // Rafael requested blue in his BP40L Hydrostatic feedback, not for other PDFs.
  return type === "hydrostatic-test" && productCode === "BP-A-2000" ? SIGNATURE_INK : "original";
}

// Preserve the stored original and audit hash. Only the rendered ink changes;
// white background and antialiasing become transparent coverage.
export async function blueSignaturePng(original: Uint8Array): Promise<Uint8Array> {
  await validateSignaturePng(original);
  const { data, info } = await sharp(original, { limitInputPixels: 2048 * 1024 })
    .ensureAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const coverage = 1 - Math.min(data[i], data[i + 1], data[i + 2]) / 255;
    data[i + 3] = Math.round(data[i + 3] * coverage);
    data[i] = 23; data[i + 1] = 70; data[i + 2] = 162;
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}
