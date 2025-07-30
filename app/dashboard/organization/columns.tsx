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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { updateUserRole } from "../actions";

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
      const role = row.getValue("role") as string;
      const member = row.original;
      const currentUserId = table.options.meta?.currentUserId;
      const currentUserRole = table.options.meta?.currentUserRole;
      const isCurrentUser = member.id === currentUserId;
      
      // Only show role selector for owners and if it's not their own row
      const canEditRole = currentUserRole === "owner" && !isCurrentUser;
      
      if (!canEditRole) {
        return (
          <Badge
            variant={role === "owner" ? "default" : "secondary"}
            className="capitalize"
          >
            {role || "member"}
          </Badge>
        );
      }

      const handleRoleChange = async (newRole: string) => {
        if (newRole === role) return; // No change
        
        const toastId = toast.loading(`Updating ${member.full_name || member.email}'s role...`);
        
        try {
          const result = await updateUserRole(member.id, newRole);
          
          if (result.error) {
            toast.error(`Failed to update role: ${result.error.message}`, { id: toastId });
          } else {
            toast.success(`Successfully updated ${member.full_name || member.email}'s role to ${newRole}`, { id: toastId });
          }
        } catch (error: any) {
          toast.error(`Failed to update role: ${error.message}`, { id: toastId });
        }
      };

      return (
        <Select value={role || "member"} onValueChange={handleRoleChange}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="viewer">Viewer</SelectItem>
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="owner">Owner</SelectItem>
          </SelectContent>
        </Select>
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
