"use client";

import React, { useState, useEffect, useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Image from "next/image";
import {
  Dropzone,
  DropzoneContent,
  DropzoneEmptyState,
} from "@/components/dropzone";
import { useSupabaseUpload } from "@/hooks/use-supabase-upload";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { Loader2, Save, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { saveKanbanCard } from "../actions";
import type { KanbanCard } from "../actions";
import ColorSelector from "./ColorSelector";

interface KanbanCardEditFormProps {
  initialData?: Partial<KanbanCard> | null;
  editingCardId?: string | null;
}

interface Profile {
  organization_id: string | null;
}

export default function KanbanCardEditForm({
  initialData = null,
  editingCardId = null,
}: KanbanCardEditFormProps) {
  const router = useRouter();
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Form state
  const [partNo, setPartNo] = useState(initialData?.part_no || "");
  const [description, setDescription] = useState(
    initialData?.description || ""
  );
  const [location, setLocation] = useState(initialData?.location || "");
  const [orderQuantity, setOrderQuantity] = useState(
    initialData?.order_quantity?.toString() || ""
  );
  const [preferredSupplier, setPreferredSupplier] = useState(
    initialData?.preferred_supplier || ""
  );
  const [leadTime, setLeadTime] = useState(initialData?.lead_time || "");
  const [headerColor, setHeaderColor] = useState<"red" | "orange" | "green">(
    (initialData?.header_color as "red" | "orange" | "green") || "red"
  );
  const [uploadedImagePath, setUploadedImagePath] = useState(
    initialData?.image_path || ""
  );
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  // Form action
  const [saveState, saveFormAction, isSavePending] = useActionState(
    saveKanbanCard,
    null
  );

  // Upload hook
  const uploadProps = useSupabaseUpload({
    bucketName: "datasheet-assets",
    path: profile?.organization_id
      ? `${profile.organization_id}/kanban/images/`
      : undefined,
    allowedMimeTypes: ["image/*"],
    maxFiles: 1,
  });

  // Load user and profile
  useEffect(() => {
    async function loadUserData() {
      setIsLoadingData(true);
      const supabase = createClient();

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError) throw userError;
        setUser(user);

        if (user) {
          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("organization_id")
            .eq("id", user.id)
            .single();

          if (profileError) throw profileError;
          setProfile(profile);
        }
      } catch (error) {
        console.error("Error loading user data:", error);
      } finally {
        setIsLoadingData(false);
      }
    }

    loadUserData();
  }, []);

  // Handle upload success
  useEffect(() => {
    if (
      !uploadProps.loading &&
      uploadProps.successes.length > 0 &&
      profile?.organization_id
    ) {
      const lastSuccessFileName =
        uploadProps.successes[uploadProps.successes.length - 1];
      setUploadedFileName(lastSuccessFileName);
      const fullPath = `${profile.organization_id}/kanban/images/${lastSuccessFileName}`;
      setUploadedImagePath(fullPath);
    }
  }, [uploadProps.loading, uploadProps.successes, profile?.organization_id]);

  // Extract filename from initial image path
  useEffect(() => {
    if (initialData?.image_path) {
      const filename = initialData.image_path.split("/").pop();
      setUploadedFileName(filename || null);
    }
  }, [initialData?.image_path]);

  const getHeaderColor = (color: string) => {
    const colorMap = {
      red: "bg-red-600",
      orange: "bg-orange-600",
      green: "bg-green-600",
    };
    return colorMap[color as keyof typeof colorMap] || "bg-red-600";
  };

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const hasUnuploadedFiles =
      uploadProps.files.length > 0 &&
      uploadProps.successes.length === 0 &&
      !uploadProps.loading;

    if (hasUnuploadedFiles) {
      e.preventDefault();
      toast.error("Please upload your image before saving the card");
      return;
    }
  };

  // Handle successful save
  useEffect(() => {
    if (saveState?.data?.id && !saveState.error && editingCardId) {
      toast.success("Card updated successfully");
      router.push(`/dashboard/kanban/${editingCardId}`);
    }
  }, [saveState, router, editingCardId]);

  if (isLoadingData) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto bg-white shadow-lg border border-gray-200 overflow-hidden">
      <form action={saveFormAction} onSubmit={handleFormSubmit}>
        {/* Hidden inputs */}
        <input type="hidden" name="imagePath" value={uploadedImagePath || ""} />
        <input type="hidden" name="editingCardId" value={editingCardId || ""} />

        {/* Header Section */}
        <div className="space-y-4 p-6 bg-gray-50">
          <div
            className={`${getHeaderColor(
              headerColor
            )} text-white text-center py-6 rounded`}
          >
            <h1 className="text-4xl font-bold tracking-wider">KANBAN</h1>
          </div>
          <div className="space-y-2">
            <Label htmlFor="header-color">Header Color</Label>
            <ColorSelector
              value={headerColor}
              onChange={setHeaderColor}
              name="headerColor"
            />
          </div>
        </div>

        {/* Image Section */}
        <div className="p-6 bg-gray-50 border-b">
          <div className="space-y-2">
            <Label htmlFor="product-image">Product Image</Label>
            {initialData?.signedImageUrl && !uploadProps.files.length ? (
              <Image
                src={initialData.signedImageUrl}
                alt={partNo}
                width={400}
                height={300}
                className="w-full h-60 object-cover rounded"
                unoptimized
              />
            ) : null}

            {profile?.organization_id ? (
              <Dropzone
                {...uploadProps}
                className="border-dashed border-gray-300 min-h-[200px]"
              >
                <DropzoneEmptyState />
                <DropzoneContent />
              </Dropzone>
            ) : (
              <div className="flex items-center justify-center h-32 border-2 border-dashed border-gray-300 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">
                  Loading organization info...
                </p>
              </div>
            )}

            {uploadedFileName && (
              <div className="text-sm text-green-600">
                Image "{uploadedFileName}" ready.
              </div>
            )}
          </div>
        </div>

        {/* Form Fields Table Style */}
        <div className="border-collapse">
          {/* Part No */}
          <div className="grid grid-cols-2 border border-black">
            <div className="border-r border-black p-4 bg-gray-50 font-semibold text-lg">
              Part No: <span className="text-red-500">*</span>
            </div>
            <div className="p-2">
              <Input
                name="partNo"
                value={partNo}
                onChange={(e) => setPartNo(e.target.value)}
                placeholder="e.g., SP100041"
                className="border-0 text-lg text-center font-medium"
                required
              />
            </div>
          </div>

          {/* Description */}
          <div className="grid grid-cols-2 border-l border-r border-b border-black">
            <div className="border-r border-black p-4 bg-gray-50 font-semibold text-lg">
              Description:
            </div>
            <div className="p-2">
              <Textarea
                name="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Product description"
                className="border-0 text-lg text-center resize-none"
                rows={2}
              />
            </div>
          </div>

          {/* Location */}
          <div className="grid grid-cols-2 border-l border-r border-b border-black">
            <div className="border-r border-black p-4 bg-gray-50 font-semibold text-lg">
              Location: <span className="text-red-500">*</span>
            </div>
            <div className="p-2">
              <Input
                name="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., UA11-04-11"
                className="border-0 text-lg text-center"
                required
              />
            </div>
          </div>

          {/* Order Qty */}
          <div className="grid grid-cols-2 border-l border-r border-b border-black">
            <div className="border-r border-black p-4 bg-gray-50 font-semibold text-lg">
              Order Qty:
            </div>
            <div className="p-2">
              <Input
                name="orderQuantity"
                type="number"
                value={orderQuantity}
                onChange={(e) => setOrderQuantity(e.target.value)}
                placeholder="200"
                className="border-0 text-lg text-center"
              />
            </div>
          </div>

          {/* Preferred Supplier */}
          <div className="grid grid-cols-2 border-l border-r border-b border-black">
            <div className="border-r border-black p-4 bg-gray-50 font-semibold text-lg">
              Preferred Supplier:
            </div>
            <div className="p-2">
              <Input
                name="preferredSupplier"
                value={preferredSupplier}
                onChange={(e) => setPreferredSupplier(e.target.value)}
                placeholder="Supplier name"
                className="border-0 text-lg text-center"
              />
            </div>
          </div>

          {/* Lead Time */}
          <div className="grid grid-cols-2 border-l border-r border-b border-black">
            <div className="border-r border-black p-4 bg-gray-50 font-semibold text-lg">
              Lead Time:
            </div>
            <div className="p-2">
              <Input
                name="leadTime"
                value={leadTime}
                onChange={(e) => setLeadTime(e.target.value)}
                placeholder="3 Months"
                className="border-0 text-lg text-center"
              />
            </div>
          </div>

          {/* Signature */}
          <div className="grid grid-cols-2 border-l border-r border-b border-black">
            <div className="border-r border-black p-4 bg-gray-50 font-semibold text-lg">
              Signature:
            </div>
            <div className="p-4 text-lg text-center min-h-[60px] text-gray-400">
              {/* Empty signature field */}
              Available after printing
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-6 bg-gray-50 flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/dashboard/kanban/${editingCardId}`)}
            disabled={isSavePending}
          >
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={
              isSavePending ||
              uploadProps.loading ||
              (uploadProps.files.length > 0 &&
                uploadProps.successes.length === 0 &&
                !uploadProps.loading)
            }
          >
            {isSavePending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {isSavePending
              ? "Saving..."
              : uploadProps.files.length > 0 &&
                uploadProps.successes.length === 0 &&
                !uploadProps.loading
              ? "Upload Image First"
              : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
