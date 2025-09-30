import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ImageLibraryClient from "./ImageLibraryClient";
import { fetchImagesForLibrary } from "./actions";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default async function ImageLibraryPage() {
  // Check authentication
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/auth/login");
  }

  // Fetch initial images metadata only (URLs will be prefetched client-side)
  const initialData = await fetchImagesForLibrary();

  return (
    <div className="flex flex-col flex-1 p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold mb-2">Image Library</h1>
        <p className="text-muted-foreground">
          All images from your products, kanban cards, and catalogs in one
          place.
        </p>
      </div>

      <Suspense fallback={<ImageLibrarySkeleton />}>
        <ImageLibraryClient initialData={initialData} />
      </Suspense>
    </div>
  );
}

function ImageLibrarySkeleton() {
  return (
    <div className="space-y-6">
      {/* Filters skeleton */}
      <Card className="p-4">
        <div className="flex gap-4">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-32" />
        </div>
      </Card>

      {/* Grid skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <Skeleton className="aspect-square w-full" />
            <div className="p-3 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
