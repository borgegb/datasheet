"use client";

import React, { useState, useActionState } from "react";
import { OrgMember, columns } from "./columns";
import ProductsDataTable from "@/components/ProductsDataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { inviteUserToOrg } from "../actions";
import { toast } from "sonner";
import { Mail, Loader2 } from "lucide-react";

interface OrganizationClientProps {
  userRole: string | null;
  initialMembers: OrgMember[];
  errorMsg?: string;
}

export default function OrganizationClient({
  userRole,
  initialMembers,
  errorMsg,
}: OrganizationClientProps) {
  const [inviteEmail, setInviteEmail] = useState("");

  // Use useActionState for the invite form
  const [inviteState, submitInvite, isInvitePending] = useActionState(
    async (
      previousState: { error: string | null } | null,
      formData: FormData
    ) => {
      const email = formData.get("email") as string;
      if (!email) {
        return { error: "Email is required." };
      }
      const result = await inviteUserToOrg(email);
      if (result.error) {
        toast.error(`Invite failed: ${result.error.message}`);
        return { error: result.error.message };
      } else {
        toast.success(`Invitation sent successfully to ${email}!`);
        setInviteEmail(""); // Clear input on success
        return { error: null };
      }
    },
    null // Initial state
  );

  // Display initial error if fetching failed on server
  if (errorMsg) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center p-4 md:p-6">
        <p className="text-destructive">{errorMsg}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Organization Management</h1>
        <p className="text-muted-foreground">
          View members and invite new users to your organization.
        </p>
      </div>

      {/* Conditionally render Invite Section only for owners */}
      {userRole === "owner" && (
        <Card>
          <CardHeader>
            <CardTitle>Invite New Member</CardTitle>
            <CardDescription>
              Enter the email address of the user you want to invite. They will
              receive an email with instructions to join.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={submitInvite} className="flex items-end gap-4">
              <div className="flex-grow space-y-1.5">
                <Label htmlFor="invite-email">Email Address</Label>
                <Input
                  type="email"
                  id="invite-email"
                  name="email" // Name matches formData key
                  placeholder="user@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  disabled={isInvitePending}
                />
              </div>
              <Button type="submit" disabled={isInvitePending}>
                {isInvitePending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="mr-2 h-4 w-4" />
                )}
                {isInvitePending ? "Sending..." : "Send Invite"}
              </Button>
            </form>
            {inviteState?.error && (
              <p className="text-sm text-destructive mt-2">
                {inviteState.error}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Members Table */}
      <Card>
        <CardHeader>
          <CardTitle>Current Members</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Use a generic DataTable component - requires columns prop */}
          {/* Pass initialMembers directly, assuming DataTable handles display */}
          {/* Note: Search/filter functionality might need DataTable adjustments */}
          <ProductsDataTable
            columns={columns}
            data={initialMembers}
            searchColumnId="email" // Allow searching by email
            hideCatalogFilter={true} // Keep hiding catalog filter
            hideAddButton={true} // <-- Add prop to hide Add button
            // Optional: Add other props like onDeleteRow if needed later
          />
        </CardContent>
      </Card>
    </div>
  );
}
