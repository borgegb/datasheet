// Removed imports for AppSidebar, SiteHeader, SidebarInset, SidebarProvider
import { SectionCards } from "@/components/section-cards";

export default function Page() {
  return (
    // The surrounding layout is now handled by app/dashboard/layout.tsx
    <div className="flex flex-col flex-1 p-4 md:p-6">
      {/* Main dashboard content area */}
      <h1 className="text-2xl font-semibold mb-4">Dashboard Overview</h1>
      <p className="text-muted-foreground mb-6">
        Welcome back! Here you can manage your datasheets.
      </p>

      {/* Keep SectionCards or replace with specific dashboard content */}
      <SectionCards />
    </div>
  );
}
