"use client";

import { useId, useState, useEffect } from "react";
import { CircleAlertIcon, TrashIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteCatalog } from "@/app/dashboard/actions";
import { toast } from "sonner";

interface DeleteCatalogDialogProps {
  catalogId: string;
  catalogName: string;
  onDeleteSuccess: () => void;
  triggerButton?: React.ReactNode;
}

export function DeleteCatalogDialog({
  catalogId,
  catalogName,
  onDeleteSuccess,
  triggerButton,
}: DeleteCatalogDialogProps) {
  const id = useId();
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setInputValue("");
      setIsDeleting(false);
    }
  }, [isOpen]);

  const handleConfirmDelete = async () => {
    if (inputValue !== catalogName) return;

    setIsDeleting(true);
    const deleteToastId = toast.loading(`Deleting catalog "${catalogName}"...`);

    const result = await deleteCatalog(catalogId);

    toast.dismiss(deleteToastId);
    setIsDeleting(false);

    if (result.error) {
      toast.error(
        `Failed to delete catalog "${catalogName}": ${result.error.message}`
      );
    } else {
      toast.success(`Catalog "${catalogName}" deleted successfully!`);
      setIsOpen(false);
      onDeleteSuccess();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {triggerButton ? (
          triggerButton
        ) : (
          <Button
            variant="outline"
            className="text-destructive border-destructive hover:bg-destructive/10 hover:text-destructive-foreground focus-visible:ring-destructive"
          >
            <TrashIcon className="mr-2 h-4 w-4" /> Delete Catalog
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <div className="flex flex-col items-center gap-2">
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-destructive bg-destructive/10 text-destructive"
            aria-hidden="true"
          >
            <CircleAlertIcon className="opacity-80" size={16} />
          </div>
          <DialogHeader>
            <DialogTitle className="sm:text-center">
              Delete Catalog Confirmation
            </DialogTitle>
            <DialogDescription className="sm:text-center">
              This action cannot be undone. This will permanently delete the
              catalog{" "}
              <span className="font-medium text-foreground">{catalogName}</span>{" "}
              and its associated image (if any). To confirm, please enter the
              catalog name below.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-5 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor={id}>Catalog name</Label>
            <Input
              id={id}
              type="text"
              placeholder={`Type "${catalogName}" to confirm`}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isDeleting}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={isDeleting}
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              className="flex-1"
              disabled={inputValue !== catalogName || isDeleting}
              onClick={handleConfirmDelete}
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isDeleting ? "Deleting..." : "Delete Catalog"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
