import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const { imagePath } = await request.json();
    
    if (!imagePath) {
      return NextResponse.json(
        { error: "Image path is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Verify user is authenticated
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Generate signed URL
    const { data, error } = await supabase.storage
      .from("datasheet-assets")
      .createSignedUrl(imagePath, 60 * 60); // 1 hour expiry

    if (error) {
      console.error("Error generating signed URL:", error);
      
      // Try the fallback logic from the image library
      // Get user's organization ID
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();
      
      const organizationId = profile?.organization_id;
      
      if (organizationId) {
        // Extract filename from path
        const filename = imagePath.split("/").pop();
        if (filename) {
          // Try organization-based path
          const orgPath = `${organizationId}/kanban/images/${filename}`;
          const { data: orgData, error: orgError } = await supabase.storage
            .from("datasheet-assets")
            .createSignedUrl(orgPath, 60 * 60);
          
          if (!orgError && orgData?.signedUrl) {
            return NextResponse.json({ url: orgData.signedUrl });
          }
        }
      }
      
      return NextResponse.json(
        { error: "Failed to generate signed URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch (error) {
    console.error("Error in signed URL endpoint:", error);
    return NextResponse.json(
      { error: "Failed to generate signed URL" },
      { status: 500 }
    );
  }
}
