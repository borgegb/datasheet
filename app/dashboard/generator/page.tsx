"use client";

import { Suspense, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import DatasheetGeneratorForm from "./DatasheetGeneratorForm";
import ProductSelector from "@/components/ProductSelector";
import { Button } from "@/components/ui/button";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

export default function CreateDatasheetPage() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div
        className={`
          transition-all duration-300 ease-in-out
          ${isSidebarOpen ? "w-80" : "w-0"}
          overflow-hidden bg-background border-r
        `}
      >
        <div className="h-full p-4">
          <ProductSelector
            onProductSelect={setSelectedProduct}
            className="h-full"
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Toggle Button */}
        <div className="p-4 border-b bg-background">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="flex items-center gap-2"
          >
            {isSidebarOpen ? (
              <>
                <PanelLeftClose className="h-4 w-4" />
                Hide Products
              </>
            ) : (
              <>
                <PanelLeftOpen className="h-4 w-4" />
                Show Products
              </>
            )}
          </Button>
        </div>

        {/* Form Content */}
        <div className="flex-1 p-4 md:p-6 overflow-auto">
          <Suspense fallback={<FormSkeleton />}>
            <DatasheetGeneratorForm selectedProduct={selectedProduct} />
          </Suspense>
        </div>
      </div>
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
