import React from "react";
import { createClient } from "@/lib/supabase/server";
import { fetchOrgMembers, fetchCategories } from "../actions";
import OrganizationClient from "./OrganizationClient";
import { redirect } from "next/navigation";

// Define a simple type for Category if not already defined elsewhere for props
interface Category {
  id: string;
  name: string;
}

export default async function OrganizationPage() {
  const supabase = await createClient();

  // Fetch current user and their profile
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    redirect("/auth/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, organization_id") // Need role and org_id
    .eq("id", user.id)
    .single();

  // --- Fetch Categories ---
  const { data: categoriesData, error: categoriesError } =
    await fetchCategories();
  // ----------------------

  if (profileError || !profile) {
    console.error("Error fetching user profile for org page:", profileError);
    return (
      <OrganizationClient
        userRole={null}
        initialMembers={[]}
        initialCategories={[]} // Pass empty array
        errorMsg="Failed to load user profile."
        categoriesErrorMsg={categoriesError?.message} // Pass category fetch error
      />
    );
  }

  if (!profile.organization_id) {
    console.error("User does not belong to an organization.");
    return (
      <OrganizationClient
        userRole={profile.role}
        initialMembers={[]}
        initialCategories={categoriesData || []} // Pass fetched categories
        errorMsg="You do not seem to belong to an organization."
        categoriesErrorMsg={categoriesError?.message} // Pass category fetch error
      />
    );
  }

  // Fetch organization members
  const { data: members, error: membersError } = await fetchOrgMembers();

  if (membersError) {
    console.error("Error fetching members:", membersError);
    return (
      <OrganizationClient
        userRole={profile.role}
        initialMembers={[]}
        initialCategories={categoriesData || []} // Pass fetched categories
        errorMsg={`Failed to load organization members: ${membersError.message}`}
        categoriesErrorMsg={categoriesError?.message} // Pass category fetch error
      />
    );
  }

  return (
    <OrganizationClient
      userRole={profile.role || "member"} // Pass user's role
      initialMembers={members || []} // Pass fetched members
      initialCategories={categoriesData || []} // Pass fetched categories
      categoriesErrorMsg={categoriesError?.message} // Pass category fetch error
    />
  );
}
