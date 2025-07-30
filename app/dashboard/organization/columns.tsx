"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, Trash2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { updateUserRole } from "../actions";
import { useState, useActionState } from "react";

// Extend the TableMeta type for organization table
declare module "@tanstack/react-table" {
  interface TableMeta<TData extends unknown> {
    currentUserId?: string;
    currentUserRole?: string;
  }
}

// Type definition matching the data returned by fetchOrgMembers
export type OrgMember = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
};

// Component for role change modal
function RoleChangeModal({
  member,
  currentUserRole,
}: {
  member: OrgMember;
  currentUserRole?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState(member.role || "member");

  const [state, submitAction, isPending] = useActionState(
    async (
      previousState: { error: string | null } | null,
      formData: FormData
    ) => {
      const newRole = formData.get("newRole") as string;
      const userId = formData.get("userId") as string;

      if (!newRole || !userId) {
        return { error: "Missing required data." };
      }

      const result = await updateUserRole(userId, newRole);

      if (result.error) {
        toast.error(`Failed to update role: ${result.error.message}`);
        return { error: result.error.message };
      } else {
        toast.success(
          `Successfully updated ${
            member.full_name || member.email
          }'s role to ${newRole}`
        );
        setIsOpen(false); // Close modal on success
        return { error: null };
      }
    },
    null
  );

  // Only show modal trigger for owners
  if (currentUserRole !== "owner") {
    return (
      <Badge
        variant={member.role === "owner" ? "default" : "secondary"}
        className="capitalize"
      >
        {member.role || "member"}
      </Badge>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="h-auto p-0 justify-start">
          <Badge
            variant={member.role === "owner" ? "default" : "secondary"}
            className="capitalize cursor-pointer hover:bg-primary/80"
          >
            {member.role || "member"}
          </Badge>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Change User Role</DialogTitle>
          <DialogDescription>
            Update the role for {member.full_name || member.email}
          </DialogDescription>
        </DialogHeader>
        <form action={submitAction}>
          <input type="hidden" name="userId" value={member.id} />
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newRole">New Role</Label>
              <Select
                name="newRole"
                value={selectedRole}
                onValueChange={setSelectedRole}
                disabled={isPending}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer (read-only)</SelectItem>
                  <SelectItem value="member">Member (can edit)</SelectItem>
                  <SelectItem value="owner">Owner (full access)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {state?.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || selectedRole === member.role}
            >
              {isPending ? "Updating..." : "Update Role"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// TODO: Implement delete member functionality later if needed
// declare module "@tanstack/table-core" {
//   interface TableMeta<TData extends RowData> {
//     removeMember?: (userId: string) => void;
//   }
// }

export const columns: ColumnDef<OrgMember>[] = [
  {
    accessorKey: "full_name",
    header: "Name",
    cell: ({ row }) => {
      return (
        row.getValue("full_name") || (
          <span className="text-muted-foreground italic">No name</span>
        )
      );
    },
  },
  {
    accessorKey: "email",
    header: "Email",
  },
  {
    accessorKey: "role",
    header: "Role",
    cell: ({ row, table }) => {
      const member = row.original;
      const currentUserId = table.options.meta?.currentUserId;
      const currentUserRole = table.options.meta?.currentUserRole;
      const isCurrentUser = member.id === currentUserId;

      // Don't allow users to edit their own role
      if (isCurrentUser) {
        return (
          <Badge
            variant={member.role === "owner" ? "default" : "secondary"}
            className="capitalize"
          >
            {member.role || "member"} (You)
          </Badge>
        );
      }

      return (
        <RoleChangeModal member={member} currentUserRole={currentUserRole} />
      );
    },
  },
  // {
  //   id: "actions",
  //   cell: ({ row, table }) => {
  //     const member = row.original;

  //     // Prevent owner from deleting themselves
  //     // Need access to current user ID here (maybe via meta?)
  //     const isSelf = false; // Replace with actual check

  //     return (
  //       <DropdownMenu>
  //         <DropdownMenuTrigger asChild>
  //           <Button variant="ghost" className="h-8 w-8 p-0">
  //             <span className="sr-only">Open menu</span>
  //             <MoreHorizontal className="h-4 w-4" />
  //           </Button>
  //         </DropdownMenuTrigger>
  //         <DropdownMenuContent align="end">
  //           <DropdownMenuLabel>Actions</DropdownMenuLabel>
  //           <DropdownMenuItem
  //             className="text-destructive focus:text-destructive cursor-pointer"
  //             disabled={isSelf || member.role === 'owner'} // Can't remove self or other owners
  //             onSelect={() => table.options.meta?.removeMember?.(member.id)}
  //           >
  //             <Trash2 className="mr-2 h-4 w-4" /> Remove Member
  //           </DropdownMenuItem>
  //         </DropdownMenuContent>
  //       </DropdownMenu>
  //     );
  //   },
  // },
];
