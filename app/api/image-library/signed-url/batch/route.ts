import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const { paths } = await request.json();

    if (!Array.isArray(paths) || paths.length === 0) {
      return NextResponse.json(
        { error: "paths must be a non-empty string array" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Verify auth
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch org for cheap product fallbacks
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();
    const organizationId: string | undefined =
      profile?.organization_id || undefined;

    const urls: Record<string, string> = {};

    for (const originalPath of paths) {
      if (typeof originalPath !== "string" || originalPath.length === 0)
        continue;

      // Candidate order: original -> org/images/{file} -> images/{file}
      const candidates: string[] = [originalPath];
      const filename = originalPath.split("/").pop();
      const firstPart = originalPath.split("/")[0];
      const isLikelyProduct = originalPath.includes("/images/") && !!filename;

      if (isLikelyProduct && organizationId) {
        if (firstPart && firstPart !== organizationId) {
          candidates.push(`${organizationId}/images/${filename}`);
        }
        candidates.push(`images/${filename}`);
      }

      let resolved: string | null = null;
      for (const candidate of candidates) {
        const { data, error } = await supabase.storage
          .from("datasheet-assets")
          .createSignedUrl(candidate, 60 * 60);
        if (!error && data?.signedUrl) {
          resolved = data.signedUrl;
          break;
        }
      }

      if (resolved) {
        urls[originalPath] = resolved;
      }
    }

    return NextResponse.json({ urls });
  } catch (error) {
    console.error("Error in batch signed URL endpoint:", error);
    return NextResponse.json(
      { error: "Failed to generate batch signed URLs" },
      { status: 500 }
    );
  }
}
