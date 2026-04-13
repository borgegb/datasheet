"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { deleteProductionKanbanCards } from "../actions";

interface ProductionKanbanViewActionsProps {
  cardId: string;
  partNo: string;
  userRole: string;
}

export default function ProductionKanbanViewActions({
  cardId,
  partNo,
  userRole,
}: ProductionKanbanViewActionsProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  if (userRole === "viewer") {
    return null;
  }

  const handleDelete = async () => {
    setIsDeleting(true);
    const toastId = toast.loading(`Deleting "${partNo}"...`);

    try {
      const { error } = await deleteProductionKanbanCards([cardId]);
      if (error) {
        toast.error(`Failed to delete card: ${error.message}`, { id: toastId });
        return;
      }

      toast.success("Production Kanban deleted successfully.", { id: toastId });
      router.push("/dashboard/production-kanban");
      router.refresh();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Production Kanban</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the Production Kanban for{" "}
            <strong>{partNo}</strong>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
