import React, { useCallback, useState } from "react";
import Cropper from "react-easy-crop";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ImageCropperDialogProps {
  open: boolean;
  file: File | null;
  aspect?: number; // aspect ratio e.g. 4/3
  onCancel: () => void;
  onSave: (file: File) => void;
}

async function getCroppedBlob(
  imageSrc: string,
  cropAreaPixels: { width: number; height: number; x: number; y: number },
  fileType: string
): Promise<Blob> {
  const image: HTMLImageElement = await new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", () => reject());
    img.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  canvas.width = cropAreaPixels.width;
  canvas.height = cropAreaPixels.height;
  const ctx = canvas.getContext("2d");

  if (!ctx) throw new Error("Failed to get canvas context");

  ctx.drawImage(
    image,
    cropAreaPixels.x,
    cropAreaPixels.y,
    cropAreaPixels.width,
    cropAreaPixels.height,
    0,
    0,
    cropAreaPixels.width,
    cropAreaPixels.height
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas is empty"));
    }, fileType || "image/jpeg");
  });
}

export const ImageCropperDialog: React.FC<ImageCropperDialogProps> = ({
  open,
  file,
  aspect = 4 / 3,
  onCancel,
  onSave,
}) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<{
    width: number;
    height: number;
    x: number;
    y: number;
  } | null>(null);

  const onCropComplete = useCallback((_area, areaPixels) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleSave = useCallback(async () => {
    if (!file || !croppedAreaPixels) return;
    const previewUrl = URL.createObjectURL(file);
    try {
      const blob = await getCroppedBlob(
        previewUrl,
        croppedAreaPixels,
        file.type
      );
      const croppedFile = new File([blob], file.name, { type: file.type });
      URL.revokeObjectURL(previewUrl);
      onSave(croppedFile);
    } catch (err) {
      console.error("Crop failed", err);
    }
  }, [file, croppedAreaPixels, onSave]);

  if (!file) return null;
  const imageUrl = URL.createObjectURL(file);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-3xl w-full">
        <DialogHeader>Crop Image</DialogHeader>
        <div className="relative w-full h-[400px] bg-black/80">
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <DialogFooter className="pt-4">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave}>
            Save crop
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
