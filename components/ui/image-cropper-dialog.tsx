import React, { useCallback, useState } from "react";
import Cropper from "react-easy-crop";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ImageCropperDialogProps {
  open: boolean;
  file: File | null;
  onCancel: () => void;
  onSave: (file: File) => void;
}

async function getCroppedBlob(
  imageSrc: string,
  crop: { x: number; y: number },
  zoom: number,
  aspect: number,
  fileType: string
): Promise<Blob | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.src = imageSrc;
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);

      const naturalWidth = image.naturalWidth;
      const naturalHeight = image.naturalHeight;

      const cropPx = {
        x: (crop.x * naturalWidth) / 100,
        y: (crop.y * naturalHeight) / 100,
        width: (naturalWidth / zoom) * (aspect >= 1 ? 1 : aspect),
        height: (naturalHeight / zoom) * (aspect >= 1 ? 1 / aspect : 1),
      };

      canvas.width = cropPx.width;
      canvas.height = cropPx.height;

      ctx.drawImage(
        image,
        cropPx.x,
        cropPx.y,
        cropPx.width,
        cropPx.height,
        0,
        0,
        cropPx.width,
        cropPx.height
      );

      canvas.toBlob((blob) => resolve(blob), fileType || "image/jpeg");
    };
  });
}

export const ImageCropperDialog: React.FC<ImageCropperDialogProps> = ({
  open,
  file,
  onCancel,
  onSave,
}) => {
  const PORTRAIT = 3 / 4;
  const LANDSCAPE = 4 / 3;
  const [aspect, setAspect] = useState<number>(PORTRAIT);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  const handleSave = useCallback(async () => {
    if (!file) return;
    const imgUrl = URL.createObjectURL(file);
    const blob = await getCroppedBlob(imgUrl, crop, zoom, aspect, file.type);
    if (!blob) return;
    const newFile = new File([blob], file.name, { type: file.type });
    onSave(newFile);
  }, [file, crop, zoom, aspect, onSave]);

  if (!file) return null;
  const imageUrl = URL.createObjectURL(file);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-3xl w-full">
        <DialogHeader className="flex flex-col gap-2">
          <span>Crop Image</span>
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
