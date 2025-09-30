import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const { imagePaths } = await request.json();
    
    if (!Array.isArray(imagePaths) || imagePaths.length === 0) {
      return NextResponse.json(
        { error: "Invalid request: imagePaths must be a non-empty array" },
        { status: 400 }
      );
    }

    // Limit batch size to prevent abuse
    if (imagePaths.length > 50) {
      return NextResponse.json(
        { error: "Batch size too large. Maximum 50 URLs per request." },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Process all URLs in parallel
    const urlPromises = imagePaths.map(async (path) => {
      try {
        const { data, error } = await supabase.storage
          .from("datasheet-assets")
          .createSignedUrl(path, 60 * 60); // 1 hour expiry

        if (error || !data?.signedUrl) {
          console.error(`Failed to generate URL for ${path}:`, error);
          return { path, url: null, error: error?.message || "Failed to generate URL" };
        }

        return { path, url: data.signedUrl, error: null };
      } catch (err) {
        console.error(`Exception generating URL for ${path}:`, err);
        return { path, url: null, error: "Exception during URL generation" };
      }
    });

    const results = await Promise.all(urlPromises);
    
    // Create a map for easier client-side lookup
    const urlMap: Record<string, string | null> = {};
    const errors: Record<string, string> = {};
    
    results.forEach(result => {
      if (result.url) {
        urlMap[result.path] = result.url;
      } else if (result.error) {
        errors[result.path] = result.error;
      }
    });

    return NextResponse.json({ 
      urls: urlMap,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
      count: results.length
    });
  } catch (error) {
    console.error("Batch signed URL generation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
