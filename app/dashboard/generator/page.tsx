"use client";

import { Suspense, useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import DatasheetGeneratorForm from "./DatasheetGeneratorForm";
import ProductSelector from "@/components/ProductSelector";
import { Button } from "@/components/ui/button";
import { PanelLeftClose, PanelLeftOpen, ShieldX } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default function CreateDatasheetPage() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check user role on component mount
  useEffect(() => {
    const supabase = createClient();
    const fetchUserAndRole = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        setUser(userData.user);
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", userData.user.id)
          .single();
        if (profileData && !profileError) {
          setUserRole(profileData.role || "viewer");
        }
      }
      setIsLoading(false);
    };
    fetchUserAndRole();
  }, []);

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center p-4 md:p-6">
        <div className="text-center space-y-2">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-4 w-64 mx-auto" />
        </div>
      </div>
    );
  }

  // Show unauthorized message for viewers
  if (userRole === "viewer") {
    return (
      <div className="flex flex-col flex-1 items-center justify-center p-4 md:p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <ShieldX className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle>Access Restricted</CardTitle>
            <CardDescription>
              You don't have permission to create datasheets. Only organization owners and members can create content.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button asChild variant="outline">
              <Link href="/dashboard/products">
                View Existing Datasheets
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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
