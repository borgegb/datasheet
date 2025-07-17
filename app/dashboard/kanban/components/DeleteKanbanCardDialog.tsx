"use client";

import React, { useState, startTransition } from "react";
import { Button } from "@/components/ui/button";
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
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteKanbanCards } from "../actions";

interface DeleteKanbanCardDialogProps {
  cardId: string;
  partNo: string;
  children: React.ReactNode;
}

export default function DeleteKanbanCardDialog({
  cardId,
  partNo,
  children,
}: DeleteKanbanCardDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
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
        setIsOpen(false);
      }
    });
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Kanban Card</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete the kanban card for "{partNo}"? This
            action cannot be undone and will also delete any associated PDF.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
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
  );
}
