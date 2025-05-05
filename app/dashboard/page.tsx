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
} from "lucide-react";

export default function Page() {
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
            <div className="text-2xl font-bold">--</div> {/* Placeholder */}
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
            <div className="text-2xl font-bold">--</div> {/* Placeholder */}
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
          <Button asChild variant="outline">
            <Link href="/dashboard/generator">
              <PlusIcon className="mr-2 h-4 w-4" /> Create New Datasheet
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/products">
              <DatabaseIcon className="mr-2 h-4 w-4" /> View All Datasheets
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/catalogs">
              <PackageIcon className="mr-2 h-4 w-4" /> Manage Catalogs
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/organization">
              <UsersIcon className="mr-2 h-4 w-4" /> Manage Organization
            </Link>
          </Button>
        </div>
      </div>

      {/* Recent Activity Section (Placeholder) */}
      {/* TODO: Implement fetching and displaying recent datasheets */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Recent Activity</h2>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Recently Updated Datasheets
            </CardTitle>
            <CardDescription>
              Your most recently created or modified items.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground italic">
              Recent activity list coming soon...
            </p>
            {/* Later: Map over fetched recent datasheets here */}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
