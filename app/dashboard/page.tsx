// Removed imports for AppSidebar, SiteHeader, SidebarInset, SidebarProvider
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import {
  FileTextIcon,
  PackageIcon,
  UsersIcon,
  DatabaseIcon,
  PlusIcon,
  ArrowRightIcon,
} from "lucide-react";
import {
  fetchProductCountForOrg,
  fetchCatalogCountForOrg,
  fetchRecentProductsForOrg,
} from "./actions"; // Corrected import path
import { RecentProductList } from "@/components/RecentProductList"; // Import the new component
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

// Type for recent product data
interface RecentProduct {
  id: string;
  product_title: string | null;
  product_code: string | null;
  updated_at: string | null;
}

export default async function Page() {
  // Get user role for conditional UI
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  
  if (userError || !user) {
    redirect("/auth/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const userRole = profile?.role || "viewer"; // Default to viewer if no role found

  // Fetch data server-side
  const productCountPromise = fetchProductCountForOrg();
  const catalogCountPromise = fetchCatalogCountForOrg();
  const recentProductsPromise = fetchRecentProductsForOrg(5); // Fetch top 5

  // Wait for all promises to resolve
  const [productCountResult, catalogCountResult, recentProductsResult] =
    await Promise.all([
      productCountPromise,
      catalogCountPromise,
      recentProductsPromise,
    ]);

  // Extract data (handle potential errors gracefully in UI)
  const productCount = productCountResult.error
    ? "Error"
    : productCountResult.count;
  const catalogCount = catalogCountResult.error
    ? "Error"
    : catalogCountResult.count;
  const recentProducts = recentProductsResult.data || [];
  const recentProductsError = recentProductsResult.error;

  return (
    // The surrounding layout is now handled by app/dashboard/layout.tsx
    <div className="flex flex-col flex-1 p-4 md:p-6 space-y-6">
      {/* Main dashboard content area */}
      <div>
        <h1 className="text-2xl font-semibold">Dashboard Overview</h1>
        <p className="text-muted-foreground">
          Welcome back! Use the quick actions below or the sidebar to navigate.
        </p>
      </div>

      {/* Stats Cards Section */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Datasheets
            </CardTitle>
            <DatabaseIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{productCount}</div>
            <p className="text-xs text-muted-foreground">
              Saved in your organization
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Catalogs
            </CardTitle>
            <PackageIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{catalogCount}</div>
            <p className="text-xs text-muted-foreground">
              Available product catalogs
            </p>
          </CardContent>
        </Card>
        {/* Add more cards later if needed */}
      </div>

      {/* Quick Actions Section */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          {/* Only show Create New Datasheet for owners and members */}
          {userRole !== "viewer" && (
            <Button asChild variant="outline">
              <Link href="/dashboard/generator">
                <PlusIcon className="mr-2 h-4 w-4" /> Create New Datasheet
              </Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href="/dashboard/products">
              <DatabaseIcon className="mr-2 h-4 w-4" /> View All Datasheets
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/catalogs">
              <PackageIcon className="mr-2 h-4 w-4" /> {userRole === "viewer" ? "View" : "Manage"} Catalogs
            </Link>
          </Button>
          {/* Only show Manage Organization for owners */}
          {userRole === "owner" && (
            <Button asChild variant="outline">
              <Link href="/dashboard/organization">
                <UsersIcon className="mr-2 h-4 w-4" /> Manage Organization
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Recent Activity Section */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Recent Activity</h2>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Recently Updated Datasheets
            </CardTitle>
            <CardDescription>
              Your organization's most recently created or modified items.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentProductsError && (
              <p className="text-sm text-destructive">
                Error loading recent activity: {recentProductsError.message}
              </p>
            )}
            {!recentProductsError && (
              <RecentProductList items={recentProducts} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
