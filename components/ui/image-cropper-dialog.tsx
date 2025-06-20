import React, { useCallback, useState, useEffect } from "react";
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
  onCancel: () => void;
  onSave: (file: File) => void;
}

async function getCroppedBlob(
  image: HTMLImageElement,
  cropAreaPixels: { width: number; height: number; x: number; y: number },
  fileType: string
): Promise<Blob> {
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

  // Aspect ratio selector: portrait (3/4), landscape (4/3), free (undefined)
  const PORTRAIT = 3 / 4;
  const LANDSCAPE = 4 / 3;
  const [aspect, setAspect] = useState<number | undefined>(PORTRAIT);

  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);

  // preload image once when file changes
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImgEl(img);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [file]);

  const onCropComplete = useCallback((_area, areaPixels) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleSave = useCallback(async () => {
    if (!file || !croppedAreaPixels || !imgEl) return;
    try {
      const blob = await getCroppedBlob(imgEl, croppedAreaPixels, file.type);
      const croppedFile = new File([blob], file.name, { type: file.type });
      onSave(croppedFile);
    } catch (err) {
      console.error("Crop failed", err);
    }
  }, [file, croppedAreaPixels, imgEl, onSave]);

  if (!file) return null;
  const imageUrl = URL.createObjectURL(file);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-3xl w-full">
        <DialogHeader className="flex flex-col gap-2">
          <span>Crop Image</span>
          {/* Aspect ratio selector */}
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="aspect"
                value="portrait"
                checked={aspect === PORTRAIT}
                onChange={() => setAspect(PORTRAIT)}
              />
              Portrait
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="aspect"
                value="landscape"
                checked={aspect === LANDSCAPE}
                onChange={() => setAspect(LANDSCAPE)}
              />
              Landscape
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="aspect"
                value="free"
                checked={aspect === undefined}
                onChange={() => setAspect(undefined)}
              />
              Free
            </label>
          </div>
        </DialogHeader>
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
 