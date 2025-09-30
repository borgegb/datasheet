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
      console.error("Error generating signed URL for path:", imagePath, error);
      
      // Handle "Object not found" errors with fallback logic
      if (error.message === "Object not found" || error.message === "The resource was not found") {
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
          const pathParts = imagePath.split("/");
          const firstPart = pathParts[0];
          
          if (filename) {
            // Check if it's a product image path (user ID instead of org ID)
            if (firstPart && firstPart !== organizationId && firstPart.match(/^[a-f0-9-]{36}$/)) {
              console.log(`Path appears to be user-based (${firstPart}), but we need org-based access`);
              
              // For product images, we know they exist but can't access due to RLS
              // Return a special response that the client can handle
              return NextResponse.json(
                { 
                  error: "Product image requires storage policy update",
                  requiresPolicyUpdate: true,
                  originalPath: imagePath 
                },
                { status: 403 }
              );
            }
            
            // Try organization-based path for kanban images
            const orgPath = `${organizationId}/kanban/images/${filename}`;
            const { data: orgData, error: orgError } = await supabase.storage
              .from("datasheet-assets")
              .createSignedUrl(orgPath, 60 * 60);
            
            if (!orgError && orgData?.signedUrl) {
              return NextResponse.json({ url: orgData.signedUrl });
            }
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
