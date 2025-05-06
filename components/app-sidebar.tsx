"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { ArrowUpCircleIcon, BuildingIcon } from "lucide-react";
import Link from "next/link";

import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";

interface Profile {
  organization_id: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

interface Organization {
  id: string;
  name: string;
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      const supabase = createClient();

      const { data: userData, error: userError } =
        await supabase.auth.getUser();
      if (userError || !userData?.user) {
        console.error("Error fetching user:", userError);
        setUser(null);
        setProfile(null);
        setOrganization(null);
        setIsLoading(false);
        return;
      }
      setUser(userData.user);

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("organization_id, full_name, avatar_url")
        .eq("id", userData.user.id)
        .single();

      if (profileError || !profileData) {
        console.error("Error fetching profile:", profileError);
        setProfile(null);
        setOrganization(null);
      } else {
        setProfile(profileData);

        if (profileData.organization_id) {
          const { data: orgData, error: orgError } = await supabase
            .from("organizations")
            .select("id, name")
            .eq("id", profileData.organization_id)
            .single();

          if (orgError || !orgData) {
            console.error("Error fetching organization:", orgError);
            setOrganization(null);
          } else {
            setOrganization(orgData);
          }
        }
      }

      setIsLoading(false);
    };
    fetchData();
  }, []);

  const navUserProps = user
    ? {
        email: user.email || "No Email",
        avatar: profile?.avatar_url || "",
        name: profile?.full_name || user.email?.split("@")[0] || "User",
      }
    : { email: "", avatar: "", name: "" };

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <Link href="/dashboard">
                <ArrowUpCircleIcon className="h-5 w-5" />
                <span className="text-base font-semibold">Applied Studio</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {isLoading ? (
          <div className="p-2">
            <Skeleton className="h-8 w-full rounded-md" />
          </div>
        ) : organization ? (
          <SidebarGroup>
            <SidebarGroupLabel>Organization</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className="opacity-100 hover:bg-transparent"
                    disabled
                  >
                    <BuildingIcon className="h-4 w-4 text-muted-foreground" />
                    <span>{organization.name}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
        <NavMain />
      </SidebarContent>
      <SidebarFooter>
        {isLoading ? (
          <div className="flex items-center gap-2 p-2">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-20 rounded-md" />
              <Skeleton className="h-3 w-32 rounded-md" />
            </div>
          </div>
        ) : user ? (
          <NavUser user={navUserProps} />
        ) : null}
      </SidebarFooter>
    </Sidebar>
  );
}
