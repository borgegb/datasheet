import React, { useState, useCallback, useRef } from "react";
import ReactCrop, {
  type Crop,
  centerCrop,
  makeAspectCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
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

export const ImageCropperDialog: React.FC<ImageCropperDialogProps> = ({
  open,
  file,
  onCancel,
  onSave,
}) => {
  const PORTRAIT = 3 / 4;
  const LANDSCAPE = 4 / 3;
  const [aspect, setAspect] = useState<number | undefined>(PORTRAIT);

  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<Crop | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Initialize crop once image loads
  const onImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const { width, height } = e.currentTarget;
      const initial = centerCrop(
        makeAspectCrop({ unit: "%", width: 90 }, aspect ?? width / height),
        width,
        height
      );
      setCrop(initial);
    },
    [aspect]
  );

  const getCroppedBlob = async (): Promise<Blob | null> => {
    if (!completedCrop || !imgRef.current) return null;
    const image = imgRef.current;
    const canvas = document.createElement("canvas");
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    canvas.width = completedCrop.width! * scaleX;
    canvas.height = completedCrop.height! * scaleY;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(
      image,
      completedCrop.x! * scaleX,
      completedCrop.y! * scaleY,
      completedCrop.width! * scaleX,
      completedCrop.height! * scaleY,
      0,
      0,
      canvas.width,
      canvas.height
    );

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob || null);
      }, file?.type || "image/jpeg");
    });
  };

  const handleSave = useCallback(async () => {
    if (!file) return;
    const blob = await getCroppedBlob();
    if (!blob) return;
    const croppedFile = new File([blob], file.name, { type: file.type });
    onSave(croppedFile);
  }, [file, onSave, completedCrop]);

  if (!file) return null;
  const imgUrl = URL.createObjectURL(file);

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
          <ReactCrop
            crop={crop}
            aspect={aspect}
            onChange={(c) => setCrop(c)}
            onComplete={(c) => setCompletedCrop(c)}
            minWidth={50}
          >
            <img
              ref={imgRef}
              src={imgUrl}
              onLoad={onImageLoad}
              alt="crop source"
            />
          </ReactCrop>
        </div>

        <DialogFooter className="pt-4">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!completedCrop?.width}
          >
            Save crop
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
