"use server";

import { createClient } from "@/lib/supabase/server";
import { ImageItem, ImageLibraryData } from "./types";

async function getUserOrgId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) return null;
  
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();
    
  return profile?.organization_id || null;
}

export async function fetchImagesForLibrary(): Promise<ImageLibraryData> {
  try {
    const supabase = await createClient();
    const organizationId = await getUserOrgId();
    
    if (!organizationId) {
      return { images: [], totalCount: 0, error: "Organization not found" };
    }
    
    // Fetch images from all sources in parallel
    const [productsResult, kanbanResult, catalogsResult] = await Promise.all([
      // Products images
      supabase
        .from("products")
        .select("id, product_title, image_path, created_at")
        .eq("organization_id", organizationId)
        .not("image_path", "is", null),
        
      // Kanban cards images (both main image and signature)
      supabase
        .from("kanban_cards")
        .select("id, part_no, description, image_path, signature_path, created_at")
        .eq("organization_id", organizationId),
        
      // Catalogs images
      supabase
        .from("catalogs")
        .select("id, name, image_path, created_at")
        .eq("organization_id", organizationId)
        .not("image_path", "is", null)
    ]);
    
    const images: ImageItem[] = [];
    
    // Process product images
    if (productsResult.data) {
      for (const product of productsResult.data) {
        if (product.image_path) {
          images.push({
            id: `product-${product.id}`,
            path: product.image_path,
            source: 'products',
            sourceId: product.id,
            sourceName: product.product_title || 'Untitled Product',
            uploadedAt: product.created_at,
            organizationId
          });
        }
      }
    }
    
    // Process kanban images
    if (kanbanResult.data) {
      for (const card of kanbanResult.data) {
        if (card.image_path) {
          images.push({
            id: `kanban-${card.id}-main`,
            path: card.image_path,
            source: 'kanban_cards',
            sourceId: card.id,
            sourceName: `${card.part_no} - ${card.description || 'Kanban Card'}`,
            uploadedAt: card.created_at,
            organizationId
          });
        }
        
        if (card.signature_path) {
          images.push({
            id: `kanban-${card.id}-signature`,
            path: card.signature_path,
            source: 'kanban_cards',
            sourceId: card.id,
            sourceName: `${card.part_no} - Signature`,
            uploadedAt: card.created_at,
            organizationId
          });
        }
      }
    }
    
    // Process catalog images
    if (catalogsResult.data) {
      for (const catalog of catalogsResult.data) {
        if (catalog.image_path) {
          images.push({
            id: `catalog-${catalog.id}`,
            path: catalog.image_path,
            source: 'catalogs',
            sourceId: catalog.id,
            sourceName: `${catalog.name} (Catalog)`,
            uploadedAt: catalog.created_at,
            organizationId
          });
        }
      }
    }
    
    // Sort by upload date (newest first)
    images.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    
    // Generate signed URLs for first batch of images (e.g., first 20)
    const imagesWithUrls = await Promise.all(
      images.slice(0, 20).map(async (image) => {
        const { data: urlData } = await supabase.storage
          .from("datasheet-assets")
          .createSignedUrl(image.path, 60 * 60); // 1 hour expiry
          
        return {
          ...image,
          url: urlData?.signedUrl || undefined
        };
      })
    );
    
    // Combine images with URLs and those without
    const finalImages = [
      ...imagesWithUrls,
      ...images.slice(20)
    ];
    
    return {
      images: finalImages,
      totalCount: images.length,
      error: undefined
    };
    
  } catch (error) {
    console.error("Error fetching images:", error);
    return {
      images: [],
      totalCount: 0,
      error: error instanceof Error ? error.message : "Failed to fetch images"
    };
  }
}

export async function generateSignedUrl(imagePath: string): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.storage
      .from("datasheet-assets")
      .createSignedUrl(imagePath, 60 * 60); // 1 hour expiry
      
    if (error) {
      console.error("Error generating signed URL:", error);
      return null;
    }
    
    return data?.signedUrl || null;
  } catch (error) {
    console.error("Error in generateSignedUrl:", error);
    return null;
  }
}
