import React from 'react';
import { createClient } from '@/lib/supabase/server';
import { fetchOrgMembers } from '../actions';
import OrganizationClient from './OrganizationClient';
import { redirect } from 'next/navigation';

export default async function OrganizationPage() {
  const supabase = await createClient();

  // Fetch current user and their profile
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    redirect('/auth/login');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, organization_id') // Need role and org_id
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    console.error("Error fetching user profile for org page:", profileError);
    // Handle error appropriately - maybe redirect or show error message
    // For now, pass null/empty data to client to handle display
    return (
      <OrganizationClient
        userRole={null}
        initialMembers={[]}
        errorMsg="Failed to load user profile."
      />
    );
  }
  
  if (!profile.organization_id) {
      console.error("User does not belong to an organization.");
       return (
         <OrganizationClient
           userRole={profile.role}
           initialMembers={[]}
           errorMsg="You do not seem to belong to an organization."
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
           errorMsg={`Failed to load organization members: ${membersError.message}`}
         />
       );
  }

  return (
    <OrganizationClient 
      userRole={profile.role || 'member'} // Pass user's role
      initialMembers={members || []}     // Pass fetched members
    />
  );
} 