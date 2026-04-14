"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ImageCropperDialog } from "@/components/ui/image-cropper-dialog";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { getProductionKanbanImageStoragePath } from "@/lib/production-kanban/image-path";
import { ImageIcon, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

interface ProductionKanbanImageUploadProps {
  organizationId?: string | null;
  partNumber: string;
  currentFileName: string | null;
  onUploaded: (imagePath: string, fileName: string) => void;
  onUploadStateChange: (state: {
    hasPendingUpload: boolean;
    isUploading: boolean;
  }) => void;
}

function isConflictError(error: unknown) {
  const status = (error as any)?.statusCode ?? (error as any)?.status;
  const message = (error as any)?.message;
  return (
    status === 409 ||
    status === "409" ||
    message === "The resource already exists" ||
    message === "Duplicate"
  );
}

export default function ProductionKanbanImageUpload({
  organizationId,
  partNumber,
  currentFileName,
  onUploaded,
  onUploadStateChange,
}: ProductionKanbanImageUploadProps) {
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedPreviewUrl, setSelectedPreviewUrl] = useState<string | null>(
    null
  );
  const [isUploading, setIsUploading] = useState(false);
  const [isReplaceDialogOpen, setIsReplaceDialogOpen] = useState(false);

  const pendingFileName = useMemo(() => {
    if (!selectedFile || !organizationId || !partNumber.trim()) {
      return null;
    }

    return getProductionKanbanImageStoragePath({
      organizationId,
      partNumber,
      originalFileName: selectedFile.name,
      mimeType: selectedFile.type,
    }).fileName;
  }, [organizationId, partNumber, selectedFile]);

  useEffect(() => {
    onUploadStateChange({
      hasPendingUpload: Boolean(selectedFile),
      isUploading,
    });
  }, [isUploading, onUploadStateChange, selectedFile]);

  useEffect(() => {
    if (!selectedFile) {
      setSelectedPreviewUrl(null);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(selectedFile);
    setSelectedPreviewUrl(nextPreviewUrl);

    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [selectedFile]);

  const handleDrop = useCallback(
    (acceptedFiles: File[]) => {
      const nextFile = acceptedFiles[0];
      if (!nextFile) {
        return;
      }

      if (!organizationId) {
        toast.error("Organization info is still loading.");
        return;
      }

      if (!partNumber.trim()) {
        toast.error("Enter the Part Number before uploading an image.");
        return;
      }

      setSelectedFile(null);
      setIsReplaceDialogOpen(false);
      setCropFile(nextFile);
    },
    [organizationId, partNumber]
  );

  const { getRootProps, getInputProps, inputRef, isDragActive, isDragReject } =
    useDropzone({
      onDrop: handleDrop,
      noClick: true,
      multiple: false,
      maxFiles: 1,
      accept: { "image/*": [] },
    });

  const handleUpload = useCallback(
    async (replace: boolean) => {
      if (!selectedFile || !organizationId) {
        return;
      }

      if (!partNumber.trim()) {
        toast.error("Part Number is required before uploading an image.");
        return;
      }

      const supabase = createClient();
      const { fileName, storagePath } = getProductionKanbanImageStoragePath({
        organizationId,
        partNumber,
        originalFileName: selectedFile.name,
        mimeType: selectedFile.type,
      });

      setIsUploading(true);

      try {
        if (replace) {
          const { error } = await supabase.storage
            .from("datasheet-assets")
            .update(storagePath, selectedFile, {
              cacheControl: "3600",
            });

          if (error) {
            throw error;
          }
        } else {
          const { error } = await supabase.storage
            .from("datasheet-assets")
            .upload(storagePath, selectedFile, {
              cacheControl: "3600",
              upsert: false,
            });

          if (error) {
            if (isConflictError(error)) {
              setIsReplaceDialogOpen(true);
              return;
            }

            throw error;
          }
        }

        onUploaded(storagePath, fileName);
        setSelectedFile(null);
        setIsReplaceDialogOpen(false);
        toast.success(
          replace
            ? `Replaced image "${fileName}".`
            : `Uploaded image "${fileName}".`
        );
      } catch (error: any) {
        toast.error(
          `Failed to upload image: ${error.message || "Unknown error"}`
        );
      } finally {
        setIsUploading(false);
      }
    },
    [onUploaded, organizationId, partNumber, selectedFile]
  );

  return (
    <>
      <div
        {...getRootProps({
          className: cn(
            "rounded-lg border-2 border-dashed p-6 text-center transition-colors",
            isDragActive && !isDragReject
              ? "border-primary bg-primary/5"
              : "border-border",
            isDragReject && "border-destructive bg-destructive/5"
          ),
        })}
      >
        <input {...getInputProps()} />

        {selectedFile && selectedPreviewUrl ? (
          <div className="space-y-4">
            <div className="mx-auto flex h-40 w-40 items-center justify-center overflow-hidden rounded-md border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedPreviewUrl}
                alt={selectedFile.name}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="space-y-1 text-sm">
              <p className="font-medium">{selectedFile.name}</p>
              {pendingFileName && (
                <p className="text-muted-foreground">
                  Will save as <span className="font-medium">{pendingFileName}</span>
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => inputRef.current?.click()}
                disabled={isUploading}
              >
                Choose another
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedFile(null)}
                disabled={isUploading}
              >
                <X className="mr-2 h-4 w-4" />
                Remove
              </Button>
              <Button
                type="button"
                onClick={() => handleUpload(false)}
                disabled={isUploading}
              >
                {isUploading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Upload image
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-center">
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">
                Drag and drop or select an image to upload
              </p>
              <p className="text-xs text-muted-foreground">
                The image will be saved using the Part Number as the file name.
              </p>
              {currentFileName && (
                <p className="text-xs text-green-600">
                  Current image: {currentFileName}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={!organizationId}
            >
              Select image
            </Button>
          </div>
        )}
      </div>

      <ImageCropperDialog
        open={!!cropFile}
        file={cropFile}
        onCancel={() => setCropFile(null)}
        onSave={(file) => {
          setSelectedFile(file);
          setCropFile(null);
        }}
      />

      <AlertDialog
        open={isReplaceDialogOpen}
        onOpenChange={setIsReplaceDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace existing image?</AlertDialogTitle>
            <AlertDialogDescription>
              An image already exists for this Part Number. Replace it with the
              new upload, or cancel to keep the existing image.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUploading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isUploading}
              onClick={(event) => {
                event.preventDefault();
                void handleUpload(true);
              }}
            >
              {isUploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
