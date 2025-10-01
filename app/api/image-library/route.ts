import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const { organizationId } = await request.json();

    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization ID is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Verify user belongs to the organization
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (profileError || profile?.organization_id !== organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch images from all sources
    const [productsResult, kanbanResult, catalogsResult] = await Promise.all([
      supabase
        .from("products")
        .select("id, product_title, image_path, created_at")
        .eq("organization_id", organizationId)
        .not("image_path", "is", null)
        .order("created_at", { ascending: false })
        .limit(50),

      supabase
        .from("kanban_cards")
        .select("id, part_no, image_path, created_at")
        .eq("organization_id", organizationId)
        .not("image_path", "is", null)
        .order("created_at", { ascending: false })
        .limit(50),

      supabase
        .from("catalogs")
        .select("id, name, image_path, created_at")
        .eq("organization_id", organizationId)
        .not("image_path", "is", null)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    // Log results for debugging
    console.log("Image library API results:", {
      products: productsResult.data?.length || 0,
      productsError: productsResult.error,
      kanban: kanbanResult.data?.length || 0,
      kanbanError: kanbanResult.error,
      catalogs: catalogsResult.data?.length || 0,
      catalogsError: catalogsResult.error,
    });

    // Transform results into a unified format
    const images = [
      ...(productsResult.data || []).map((item) => ({
        id: `product-${item.id}`,
        path: item.image_path,
        source: "products" as const,
        sourceName: item.product_title,
        uploadedAt: item.created_at,
      })),
      ...(kanbanResult.data || []).map((item) => ({
        id: `kanban-${item.id}`,
        path: item.image_path,
        source: "kanban_cards" as const,
        sourceName: item.part_no,
        uploadedAt: item.created_at,
      })),
      ...(catalogsResult.data || []).map((item) => ({
        id: `catalog-${item.id}`,
        path: item.image_path,
        source: "catalogs" as const,
        sourceName: item.name,
        uploadedAt: item.created_at,
      })),
    ];

    // Sort all images by upload date (newest first)
    images.sort(
      (a, b) =>
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );

    return NextResponse.json({ images });
  } catch (error) {
    console.error("Error fetching images for library:", error);
    return NextResponse.json(
      { error: "Failed to fetch images" },
      { status: 500 }
    );
  }
}
