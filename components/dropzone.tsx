"use client";

import { cn } from "@/lib/utils";
import { type UseSupabaseUploadReturn } from "@/hooks/use-supabase-upload";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  CheckCircle,
  File,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useState,
  useEffect,
} from "react";
import { ImageCropperDialog } from "@/components/ui/image-cropper-dialog";
import React from "react";

export const formatBytes = (
  bytes: number,
  decimals = 2,
  size?: "bytes" | "KB" | "MB" | "GB" | "TB" | "PB" | "EB" | "ZB" | "YB"
) => {
  const k = 1000;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  if (bytes === 0 || bytes === undefined)
    return size !== undefined ? `0 ${size}` : "0 bytes";
  const i =
    size !== undefined
      ? sizes.indexOf(size)
      : Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
};

type DropzoneContextType = Omit<
  UseSupabaseUploadReturn,
  "getRootProps" | "getInputProps"
>;

const DropzoneContext = createContext<DropzoneContextType | undefined>(
  undefined
);

type DropzoneProps = UseSupabaseUploadReturn & {
  className?: string;
};

const Dropzone = ({
  className,
  children,
  getRootProps,
  getInputProps,
  ...restProps
}: PropsWithChildren<DropzoneProps>) => {
  const isSuccess = restProps.isSuccess;
  const isActive = restProps.isDragActive;
  const isInvalid =
    (restProps.isDragActive && restProps.isDragReject) ||
    (restProps.errors.length > 0 && !restProps.isSuccess) ||
    restProps.files.some((file) => file.errors.length !== 0);

  // --- Cropping state ---
  const [cropFile, setCropFile] = useState<File | null>(null);
  const prevFileCountRef = React.useRef(restProps.files.length);

  // Detect newly added file to start cropping (only first file, assumes maxFiles=1 for images)
  useEffect(() => {
    if (restProps.files.length > prevFileCountRef.current) {
      const latest = restProps.files[restProps.files.length - 1] as File & {
        __cropped?: boolean;
      };
      if (!latest.__cropped) {
        setCropFile(latest);
      }
    }
    prevFileCountRef.current = restProps.files.length;
  }, [restProps.files]);

  const handleCropCancel = () => {
    // Remove the file awaiting crop
    if (cropFile) {
      restProps.setFiles(restProps.files.filter((f) => f !== cropFile));
    }
    setCropFile(null);
  };

  const handleCropSave = (cropped: File) => {
    const newFile: any = cropped;
    (newFile as any).preview = URL.createObjectURL(cropped);
    (newFile as any).errors = [];
    (newFile as any).__cropped = true;

    // Replace original file in list
    restProps.setFiles([
      ...restProps.files.filter((f) => f !== cropFile),
      newFile,
    ]);
    setCropFile(null);
  };
  // ----------------------

  return (
    <DropzoneContext.Provider value={{ ...restProps }}>
      <div
        {...getRootProps({
          className: cn(
            "border-2 border-gray-300 rounded-lg p-6 text-center bg-card transition-colors duration-300 text-foreground",
            className,
            isSuccess ? "border-solid" : "border-dashed",
            isActive && "border-primary bg-primary/10",
            isInvalid && "border-destructive bg-destructive/10"
          ),
        })}
      >
        <input {...getInputProps()} />
        {children}
        {/* Crop dialog */}
        <ImageCropperDialog
          open={!!cropFile}
          file={cropFile}
          onCancel={handleCropCancel}
          onSave={handleCropSave}
        />
      </div>
    </DropzoneContext.Provider>
  );
};
const DropzoneContent = ({ className }: { className?: string }) => {
  const {
    files,
    setFiles,
    onUpload,
    loading,
    successes,
    errors,
    maxFileSize,
    maxFiles,
    isSuccess,
    proceedWithUpload,
  } = useDropzoneContext();

  const exceedMaxFiles = files.length > maxFiles;

  const handleRemoveFile = useCallback(
    (fileName: string) => {
      setFiles(files.filter((file) => file.name !== fileName));
    },
    [files, setFiles]
  );

  if (isSuccess) {
    return (
      <div
        className={cn(
          "flex flex-row items-center gap-x-2 justify-center",
          className
        )}
      >
        <CheckCircle size={16} className="text-primary" />
        <p className="text-primary text-sm">
          Successfully uploaded {files.length} file{files.length > 1 ? "s" : ""}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col", className)}>
      {files.map((file, idx) => {
        const fileError = errors.find((e) => e.name === file.name);
        const isCollision = fileError?.message === "already_exists";
        const isSuccessfullyUploaded = !!successes.find((e) => e === file.name);

        return (
          <div
            key={`${file.name}-${idx}`}
            className="flex items-center gap-x-4 border-b py-2 first:mt-4 last:mb-4 "
          >
            {file.type.startsWith("image/") ? (
              <div className="h-10 w-10 rounded border overflow-hidden shrink-0 bg-muted flex items-center justify-center">
                <img
                  src={file.preview}
                  alt={file.name}
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="h-10 w-10 rounded border bg-muted flex items-center justify-center">
                <File size={18} />
              </div>
            )}

            <div className="shrink grow flex flex-col items-start truncate">
              <p title={file.name} className="text-sm truncate max-w-full">
                {file.name}
              </p>
              {file.errors.length > 0 ? (
                <p className="text-xs text-destructive">
                  {file.errors
                    .map((e) =>
                      e.message.startsWith("File is larger than")
                        ? `File is larger than ${formatBytes(
                            maxFileSize,
                            2
                          )} (Size: ${formatBytes(file.size, 2)})`
                        : e.message
                    )
                    .join(", ")}
                </p>
              ) : loading && !isSuccessfullyUploaded ? (
                <p className="text-xs text-muted-foreground">
                  Uploading file...
                </p>
              ) : !!fileError && !isCollision ? (
                <p className="text-xs text-destructive">
                  Failed to upload: {fileError.message}
                </p>
              ) : isSuccessfullyUploaded ? (
                <p className="text-xs text-primary">
                  Successfully uploaded file
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {formatBytes(file.size, 2)}
                </p>
              )}
            </div>

            {!loading && !isSuccessfullyUploaded && !isCollision && (
              <Button
                type="button"
                size="icon"
                variant="link"
                className="shrink-0 justify-self-end text-muted-foreground hover:text-foreground"
                onClick={() => handleRemoveFile(file.name)}
              >
                <X />
              </Button>
            )}

            {isCollision && (
              <div className="flex items-center gap-2 mt-1 bg-amber-50 p-2 rounded text-sm w-full">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <span className="flex-1 truncate">
                  File already exists. What now?
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => proceedWithUpload(file.name, false)}
                >
                  Use existing
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => proceedWithUpload(file.name, true)}
                >
                  Replace
                </Button>
              </div>
            )}
          </div>
        );
      })}
      {exceedMaxFiles && (
        <p className="text-sm text-left mt-2 text-destructive">
          You may upload only up to {maxFiles} files, please remove{" "}
          {files.length - maxFiles} file
          {files.length - maxFiles > 1 ? "s" : ""}.
        </p>
      )}
      {files.length > 0 && !exceedMaxFiles && (
        <div className="mt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onUpload}
            disabled={files.some((file) => file.errors.length !== 0) || loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>Upload image</>
            )}
          </Button>
        </div>
      )}
    </div>
  );
};

const DropzoneEmptyState = ({ className }: { className?: string }) => {
  const { maxFiles, maxFileSize, inputRef, isSuccess } = useDropzoneContext();

  if (isSuccess) {
    return null;
  }

  return (
    <div className={cn("flex flex-col items-center gap-y-2", className)}>
      <Upload size={20} className="text-muted-foreground" />
      <p className="text-sm">
        Upload{!!maxFiles && maxFiles > 1 ? ` ${maxFiles}` : ""} file
        {!maxFiles || maxFiles > 1 ? "s" : ""}
      </p>
      <div className="flex flex-col items-center gap-y-1">
        <p className="text-xs text-muted-foreground">
          Drag and drop or{" "}
          <a
            onClick={() => inputRef.current?.click()}
            className="underline cursor-pointer transition hover:text-foreground"
          >
            select {maxFiles === 1 ? `file` : "files"}
          </a>{" "}
          to upload
        </p>
        {maxFileSize !== Number.POSITIVE_INFINITY && (
          <p className="text-xs text-muted-foreground">
            Maximum file size: {formatBytes(maxFileSize, 2)}
          </p>
        )}
      </div>
    </div>
  );
};

const useDropzoneContext = () => {
  const context = useContext(DropzoneContext);

  if (!context) {
    throw new Error("useDropzoneContext must be used within a Dropzone");
  }

  return context;
};

export { Dropzone, DropzoneContent, DropzoneEmptyState, useDropzoneContext };
