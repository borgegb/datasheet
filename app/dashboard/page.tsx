// Removed imports for AppSidebar, SiteHeader, SidebarInset, SidebarProvider
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function Page() {
  return (
    // The surrounding layout is now handled by app/dashboard/layout.tsx
    <div className="flex flex-col flex-1 p-4 md:p-6">
      {/* Main dashboard content area */}
      <h1 className="text-2xl font-semibold mb-4">Dashboard Overview</h1>
      <p className="text-muted-foreground mb-6">
        Welcome back! Use the generator to create new datasheets.
      </p>

      {/* Optional: Add a direct link to the generator */}
      <div className="mt-4">
        <Button asChild>
          <Link href="/dashboard/generator">Go to Generator</Link>
        </Button>
      </div>
    </div>
  );
}
