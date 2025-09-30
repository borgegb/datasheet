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
import ImageLibrarySheet from "./ImageLibrarySheet";
import { ImageIcon } from "lucide-react";

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
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

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

        return { error: null, data: result.data };
      } catch (error: any) {
        toast.error(`Unexpected error: ${error.message}`);
        return { error: { message: error.message }, data: null };
      }
    },
    null
  );

  // Add useEffect to handle PDF generation after successful save
  useEffect(() => {
    // Check if save was successful and we have the card data (including ID)
    // Only auto-generate PDF for new cards, not when editing
    if (saveState?.data?.id && !saveState.error && !editingCardId) {
      const savedCardId = saveState.data.id;
      const savedPartNo = saveState.data.part_no || "card";
      console.log(
        `Save successful for ${savedCardId}, starting PDF generation...`
      );

      // Define async function inside useEffect to chain async calls
      const generateAndShowPdf = async () => {
        setIsGeneratingPdf(true);
        toast.info("🚀 Your Kanban card PDF is being generated...", {
          duration: 10000,
        });

        try {
          const payload = {
            kanbanCardIds: [savedCardId],
          };

          console.log("Payload for Kanban PDF generation:", payload);

          const res = await fetch("/api/generate-kanban-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          if (!res.ok) {
            const errorData = await res.json().catch(() => ({
              error: `Request failed with status ${res.status}`,
            }));
            throw new Error(
              errorData.error || `PDF generation failed: ${res.statusText}`
            );
          }

          const { url, error: apiError } = await res.json();

          if (apiError) {
            throw new Error(apiError.message || apiError);
          }

          if (url) {
            // Show success toast with View Button (similar to DatasheetGeneratorForm)
            toast.success("✅ Kanban card PDF generated successfully!", {
              description: "Click the button to view your generated PDF.",
              action: (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(url, "_blank")}
                >
                  View PDF
                </Button>
              ),
              duration: 15000, // Keep toast longer so user can click
            });

            // After generation success, navigate to the card view page
            router.push(`/dashboard/kanban/${savedCardId}`);
          } else {
            throw new Error("PDF URL not found in response.");
          }
        } catch (error: any) {
          console.error("Error generating Kanban card PDF:", error);
          toast.error(
            `Failed to generate PDF: ${error.message || "Unknown error"}`
          );

          // Still navigate to the card even if PDF generation failed
          router.push(`/dashboard/kanban/${savedCardId}`);
        } finally {
          setIsGeneratingPdf(false);
        }
      };

      // Trigger the async function
      generateAndShowPdf();
    } else if (saveState?.data?.id && !saveState.error && editingCardId) {
      // For editing, just navigate without auto-generating PDF
      router.push(`/dashboard/kanban/${editingCardId}`);
    }
  }, [saveState, router, editingCardId]);

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

  // Handle image selection from library
  const handleImageSelection = (imagePath: string, fileName: string) => {
    setUploadedImagePath(imagePath);
    setUploadedFileName(fileName);
    // Note: User will need to manually clear dropzone files if any were added
  };

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
    <>
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
                <div className="flex items-center justify-between">
                  <Label htmlFor="product-image">Product Image</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsLibraryOpen(true)}
                    disabled={!profile?.organization_id}
                  >
                    <ImageIcon className="mr-2 h-4 w-4" />
                    Library
                  </Button>
                </div>
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
                  isGeneratingPdf ||
                  uploadProps.loading ||
                  (uploadProps.files.length > 0 &&
                    uploadProps.successes.length === 0 &&
                    !uploadProps.loading)
                }
              >
                {isSavePending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : isGeneratingPdf ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {isSavePending
                  ? "Saving..."
                  : isGeneratingPdf
                  ? "Generating PDF..."
                  : uploadProps.files.length > 0 &&
                    uploadProps.successes.length === 0 &&
                    !uploadProps.loading
                  ? "Upload Image First"
                  : editingCardId
                  ? "Update Card"
                  : "Create Card & Generate PDF"}
              </Button>
            </CardFooter>
          </form>
        </CardContent>
      </Card>

      {/* Image Library Sheet */}
      {profile?.organization_id && (
        <ImageLibrarySheet
          open={isLibraryOpen}
          onOpenChange={setIsLibraryOpen}
          onSelectImage={handleImageSelection}
          organizationId={profile.organization_id}
        />
      )}
    </>
  );
}
