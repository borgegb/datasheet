"use client";

import {
  LayoutDashboardIcon,
  FileTextIcon,
  DatabaseIcon,
  PackageIcon,
  UsersIcon,
  TagIcon,
  type LucideIcon,
} from "lucide-react";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import Link from "next/link";

const mainNavItems = [
  {
    title: "Overview",
    href: "/dashboard",
    icon: LayoutDashboardIcon,
  },
  {
    title: "Generator",
    href: "/dashboard/generator",
    icon: FileTextIcon,
  },
  {
    title: "Datasheets",
    href: "/dashboard/products",
    icon: DatabaseIcon,
  },
  {
    title: "Catalogs",
    href: "/dashboard/catalogs",
    icon: PackageIcon,
  },
  {
    title: "Kanban Cards",
    href: "/dashboard/kanban",
    icon: TagIcon,
  },
  {
    title: "Organization",
    href: "/dashboard/organization",
    icon: UsersIcon,
  },
];

export function NavMain() {
  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-1">
        <SidebarMenu>
          {mainNavItems.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton tooltip={item.title} asChild>
                <Link href={item.href}>
                  {item.icon && <item.icon className="h-4 w-4" />}
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
