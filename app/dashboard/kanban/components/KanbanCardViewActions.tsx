"use client";

import React, { useState, startTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { MoreHorizontal, Edit, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteKanbanCards } from "../actions";

interface KanbanCardViewActionsProps {
  cardId: string;
  partNo: string;
}

export default function KanbanCardViewActions({
  cardId,
  partNo,
}: KanbanCardViewActionsProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    setIsDeleting(true);
    const toastId = toast.loading(`Deleting card "${partNo}"...`);

    startTransition(async () => {
      try {
        const { error } = await deleteKanbanCards([cardId]);

        if (error) {
          toast.error(`Failed to delete card: ${error.message}`, {
            id: toastId,
          });
        } else {
          toast.success("Card deleted successfully", { id: toastId });
          router.push("/dashboard/kanban");
        }
      } catch (error: any) {
        toast.error(
          `Failed to delete card: ${error.message || "Unknown error"}`,
          { id: toastId }
        );
      } finally {
        setIsDeleting(false);
      }
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/dashboard/kanban/${cardId}/edit`}>
            <Edit className="mr-2 h-4 w-4" />
            Edit Card
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={(e) => e.preventDefault()}
              disabled={isDeleting}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Card
            </DropdownMenuItem>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Kanban Card</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete the kanban card for "{partNo}"?
                This action cannot be undone and will also delete any associated
                PDF.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? (
                  <>
                    <Trash2 className="mr-2 h-4 w-4 animate-pulse" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Card
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
