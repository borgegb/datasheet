"use client";

import React, { useState, useEffect, useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Dropzone,
  DropzoneContent,
  DropzoneEmptyState,
} from "@/components/dropzone";
import { useSupabaseUpload } from "@/hooks/use-supabase-upload";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { Loader2, Save, Download } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { saveKanbanCard } from "../actions";
import type { KanbanCard } from "../actions";
import ColorSelector from "./ColorSelector";

interface KanbanCardFormProps {
  initialData?: Partial<KanbanCard> | null;
  editingCardId?: string | null;
}

interface Profile {
  organization_id: string | null;
}

export default function KanbanCardForm({
  initialData = null,
  editingCardId = null,
}: KanbanCardFormProps) {
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
    initialData?.header_color || "red"
  );
  const [uploadedImagePath, setUploadedImagePath] = useState<string | null>(
    initialData?.image_path || null
  );
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  // User and profile state
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const router = useRouter();

  // Server action for form submission
  const [saveState, saveFormAction, isSavePending] = useActionState(
    async (prevState: any, formData: FormData) => {
      try {
        // Add editingCardId to FormData if we're editing
        if (editingCardId) {
          formData.append("editingCardId", editingCardId);
        }

        const result = await saveKanbanCard(null, formData);

        if (result.error) {
          toast.error(`Failed to save card: ${result.error.message}`);
          return { error: result.error, data: null };
        }

        toast.success(
          `Card ${editingCardId ? "updated" : "created"} successfully!`
        );

        // Redirect to the card view page
        const cardId = editingCardId || result.data?.id;
        if (cardId) {
          router.push(`/dashboard/kanban/${cardId}`);
        } else {
          router.push("/dashboard/kanban");
        }

        return { error: null, data: result.data };
      } catch (error: any) {
        toast.error(`Unexpected error: ${error.message}`);
        return { error: { message: error.message }, data: null };
      }
    },
    null
  );

  // Fetch user and profile
  useEffect(() => {
    const fetchUserData = async () => {
      setIsLoadingData(true);
      const supabase = createClient();

      const { data: userData, error: userError } =
        await supabase.auth.getUser();
      if (userError || !userData?.user) {
        console.error("Error fetching user:", userError);
        setUser(null);
        setProfile(null);
        setIsLoadingData(false);
        return;
      }
      setUser(userData.user);

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", userData.user.id)
        .single();

      if (profileError || !profileData) {
        console.error("Error fetching profile:", profileError);
        setProfile(null);
      } else {
        setProfile(profileData);
      }

      setIsLoadingData(false);
    };

    fetchUserData();
  }, []);

  // Setup upload hook
  const uploadProps = useSupabaseUpload({
    bucketName: "datasheet-assets",
    path: profile?.organization_id
      ? `${profile.organization_id}/kanban/images/`
      : undefined,
    allowedMimeTypes: ["image/*"],
    maxFiles: 1,
  });

  // Handle upload completion
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
      console.log("Kanban image uploaded, path stored:", fullPath);
    }
  }, [uploadProps.loading, uploadProps.successes, profile?.organization_id]);

  // Extract filename from initial image path
  useEffect(() => {
    if (initialData?.image_path) {
      const filename = initialData.image_path.split("/").pop();
      setUploadedFileName(filename || null);
    }
  }, [initialData?.image_path]);

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    // Check if there are files added but not uploaded
    const hasUnuploadedFiles =
      uploadProps.files.length > 0 &&
      uploadProps.successes.length === 0 &&
      !uploadProps.loading;

    if (hasUnuploadedFiles) {
      e.preventDefault();
      toast.error("Please upload your image before saving the card", {
        description:
          "Click the 'Upload image' button to upload your selected file.",
        duration: 6000,
      });
      return;
    }
  };

  if (isLoadingData) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>
          {editingCardId ? "Edit Kanban Card" : "Create New Kanban Card"}
        </CardTitle>
        <CardDescription>
          {editingCardId
            ? "Modify the card details below."
            : "Enter the details for your new kanban card."}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form action={saveFormAction} onSubmit={handleFormSubmit}>
          {/* Hidden inputs */}
          <input
            type="hidden"
            name="imagePath"
            value={uploadedImagePath || ""}
          />

          <div className="space-y-6">
            {/* Basic Information */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <Label htmlFor="part-no">
                  Part Number <span className="text-red-500">*</span>
                </Label>
                <Input
                  name="partNo"
                  id="part-no"
                  value={partNo}
                  onChange={(e) => setPartNo(e.target.value)}
                  placeholder="e.g., SP100041"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="location">
                  Location <span className="text-red-500">*</span>
                </Label>
                <Input
                  name="location"
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g., UA11-04-11"
                  required
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                name="description"
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., 1/4 inch BSP M x 1/8 inch BSP M Adaptor"
                rows={3}
              />
            </div>

            {/* Order Details */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="space-y-1.5">
                <Label htmlFor="order-quantity">Order Quantity</Label>
                <Input
                  name="orderQuantity"
                  id="order-quantity"
                  type="number"
                  value={orderQuantity}
                  onChange={(e) => setOrderQuantity(e.target.value)}
                  placeholder="200"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="preferred-supplier">Preferred Supplier</Label>
                <Input
                  name="preferredSupplier"
                  id="preferred-supplier"
                  value={preferredSupplier}
                  onChange={(e) => setPreferredSupplier(e.target.value)}
                  placeholder="e.g., Beijing Dantec"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="lead-time">Lead Time</Label>
                <Input
                  name="leadTime"
                  id="lead-time"
                  value={leadTime}
                  onChange={(e) => setLeadTime(e.target.value)}
                  placeholder="e.g., 3 Months"
                />
              </div>
            </div>

            {/* Header Color */}
            <div className="space-y-1.5">
              <Label>Header Color</Label>
              <ColorSelector
                value={headerColor}
                onChange={setHeaderColor}
                name="headerColor"
              />
            </div>

            {/* Image Upload */}
            <div className="space-y-1.5">
              <Label htmlFor="product-image">Product Image</Label>
              {profile?.organization_id ? (
                <Dropzone {...uploadProps} className="mt-1 border-border">
                  <DropzoneEmptyState />
                  <DropzoneContent />
                </Dropzone>
              ) : (
                <div className="mt-1 flex items-center justify-center h-32 border-2 border-dashed border-gray-300 rounded-lg bg-muted">
                  <p className="text-sm text-muted-foreground">
                    Loading organization info...
                  </p>
                </div>
              )}
              {uploadedFileName && (
                <div className="mt-2 text-sm text-green-600">
                  Image "{uploadedFileName}" ready.
                </div>
              )}
            </div>
          </div>

          <CardFooter className="flex justify-end pt-8 gap-x-3 px-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={isSavePending}
            >
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
                : `${editingCardId ? "Update" : "Create"} Card`}
            </Button>
          </CardFooter>
        </form>
      </CardContent>
    </Card>
  );
}
