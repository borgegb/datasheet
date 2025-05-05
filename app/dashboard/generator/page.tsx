"use client";

import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import DatasheetGeneratorForm from "./DatasheetGeneratorForm";

export default function CreateDatasheetPage() {
  return (
    <div className="flex flex-col flex-1 p-4 md:p-6">
      <Suspense fallback={<FormSkeleton />}>
        <DatasheetGeneratorForm />
      </Suspense>
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="w-full max-w-3xl mx-auto space-y-8">
      <Skeleton className="h-10 w-1/2" />
      <Skeleton className="h-8 w-3/4" />
      <div className="space-y-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-8">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
      <div className="flex justify-end pt-8 gap-x-3">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-10 w-32" />
      </div>
    </div>
  );
}
