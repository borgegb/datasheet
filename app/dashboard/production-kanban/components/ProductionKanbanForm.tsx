"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import {
  normalizeProductionKanbanBackRows,
  type ProductionKanbanBackRow,
} from "@/lib/production-kanban/back-rows";
import { printPdfFromUrl } from "@/lib/client/print-pdf";
import ImageLibrarySheet from "@/app/dashboard/kanban/components/ImageLibrarySheet";
import { saveProductionKanbanCard } from "../actions";
import type { ProductionKanbanCard } from "../actions";
import ProductionKanbanGridEditor from "./ProductionKanbanGridEditor";
import ProductionKanbanImageUpload from "./ProductionKanbanImageUpload";

interface ProductionKanbanFormProps {
  initialData?: Partial<ProductionKanbanCard> | null;
  editingCardId?: string | null;
}

interface Profile {
  organization_id: string | null;
}

interface ProductionKanbanFormValues {
  partNo: string;
  description: string;
  location: string;
  orderQuantity: string;
  preferredSupplier: string;
  leadTime: string;
}

export default function ProductionKanbanForm({
  initialData = null,
  editingCardId = null,
}: ProductionKanbanFormProps) {
  const router = useRouter();
  const [formValues, setFormValues] = useState<ProductionKanbanFormValues>({
    partNo: initialData?.part_no || "",
    description: initialData?.description || "",
    location: initialData?.location || "",
    orderQuantity: initialData?.order_quantity?.toString() || "",
    preferredSupplier: initialData?.preferred_supplier || "",
    leadTime: initialData?.lead_time || "",
  });
  const [backRows, setBackRows] = useState(() =>
    normalizeProductionKanbanBackRows(initialData?.back_rows)
  );
  const [uploadedImagePath, setUploadedImagePath] = useState<string | null>(
    initialData?.image_path || null
  );
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [hasPendingImageUpload, setHasPendingImageUpload] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const [saveState, saveFormAction, isSavePending] = useActionState(
    async (_prevState: any, formData: FormData) => {
      try {
        if (editingCardId) {
          formData.append("editingCardId", editingCardId);
        }

        const result = await saveProductionKanbanCard(null, formData);
        if (result.error) {
          toast.error(`Failed to save card: ${result.error.message}`);
          return { error: result.error, data: null };
        }

        toast.success(
          `Production Kanban ${editingCardId ? "updated" : "created"} successfully!`
        );
        return { error: null, data: result.data };
      } catch (error: any) {
        toast.error(`Unexpected error: ${error.message}`);
        return { error: { message: error.message }, data: null };
      }
    },
    null
  );

  const updateField = useCallback(
    (field: keyof ProductionKanbanFormValues, value: string) => {
      setFormValues((currentValues) => ({
        ...currentValues,
        [field]: value,
      }));
    },
    []
  );

  const handleBackRowChange = useCallback(
    (rowIndex: number, field: keyof ProductionKanbanBackRow, value: string) => {
      setBackRows((currentRows) =>
        currentRows.map((row, index) =>
          index === rowIndex ? { ...row, [field]: value } : row
        )
      );
    },
    []
  );

  useEffect(() => {
    if (saveState?.data?.id && !saveState.error && !editingCardId) {
      const savedCardId = saveState.data.id;
      const savedPartNo = saveState.data.part_no || "production-kanban";

      const generateAndShowPdf = async () => {
        setIsGeneratingPdf(true);
        toast.info("Your A6 duplex Production Kanban PDF is being generated...", {
          duration: 10000,
        });

        try {
          const res = await fetch("/api/generate-production-kanban-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              productionKanbanCardIds: [savedCardId],
            }),
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

          if (!url) {
            throw new Error("PDF URL not found in response.");
          }

          toast.success("A6 duplex Production Kanban PDF generated successfully!", {
            description: "Click the button to print the A6 duplex PDF.",
            action: (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await printPdfFromUrl(url, `${savedPartNo}.pdf`);
                  } catch (printError: any) {
                    toast.error(
                      `Failed to open print dialog: ${printError.message}`
                    );
                  }
                }}
              >
                Print PDF
              </Button>
            ),
            duration: 15000,
          });

          router.push(`/dashboard/production-kanban/${savedCardId}`);
        } catch (error: any) {
          console.error("Error generating Production Kanban PDF:", error);
          toast.error(
            `Failed to generate PDF: ${error.message || "Unknown error"}`
          );
          router.push(`/dashboard/production-kanban/${savedCardId}`);
        } finally {
          setIsGeneratingPdf(false);
        }
      };

      generateAndShowPdf();
    } else if (saveState?.data?.id && !saveState.error && editingCardId) {
      router.push(`/dashboard/production-kanban/${editingCardId}`);
    }
  }, [editingCardId, router, saveState]);

  useEffect(() => {
    const fetchUserData = async () => {
      setIsLoadingData(true);
      const supabase = createClient();

      const { data: userData, error: userError } =
        await supabase.auth.getUser();
      if (userError || !userData?.user) {
        console.error("Error fetching user:", userError);
        setProfile(null);
        setIsLoadingData(false);
        return;
      }

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

  useEffect(() => {
    if (initialData?.image_path) {
      const filename = initialData.image_path.split("/").pop();
      setUploadedFileName(filename || null);
    }
  }, [initialData?.image_path]);

  const handleImageSelection = useCallback(
    (imagePath: string, fileName: string) => {
      setUploadedImagePath(imagePath);
      setUploadedFileName(fileName);
      setHasPendingImageUpload(false);
    },
    []
  );

  const handleImageUploaded = useCallback((imagePath: string, fileName: string) => {
    setUploadedImagePath(imagePath);
    setUploadedFileName(fileName);
  }, []);

  const handleImageUploadStateChange = useCallback(
    ({
      hasPendingUpload,
      isUploading,
    }: {
      hasPendingUpload: boolean;
      isUploading: boolean;
    }) => {
      setHasPendingImageUpload(hasPendingUpload);
      setIsUploadingImage(isUploading);
    },
    []
  );

  const handleFormSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      if (hasPendingImageUpload) {
        event.preventDefault();
        toast.error("Please upload your image before saving the card", {
          description:
            "Upload or remove the selected image before submitting.",
          duration: 6000,
        });
      }
    },
    [hasPendingImageUpload]
  );

  if (isLoadingData) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <Card className="mx-auto w-full max-w-5xl">
        <CardHeader>
          <CardTitle>
            {editingCardId
              ? "Edit Production Kanban"
              : "Create Production Kanban"}
          </CardTitle>
          <CardDescription>
            Brown front side with a location grid and A6 duplex or A5 folded PDF output.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveFormAction} onSubmit={handleFormSubmit}>
            <input type="hidden" name="imagePath" value={uploadedImagePath || ""} />
            <input type="hidden" name="backRows" value={JSON.stringify(backRows)} />

            <div className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="production-part-no">
                    Part Number <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="production-part-no"
                    name="partNo"
                    required
                    value={formValues.partNo}
                    onChange={(event) =>
                      updateField("partNo", event.target.value)
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="production-location">
                    Location <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="production-location"
                    name="location"
                    required
                    value={formValues.location}
                    onChange={(event) =>
                      updateField("location", event.target.value)
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="production-description">Description</Label>
                <Textarea
                  id="production-description"
                  name="description"
                  rows={3}
                  value={formValues.description}
                  onChange={(event) =>
                    updateField("description", event.target.value)
                  }
                />
              </div>

              <div className="grid gap-6 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="production-order-quantity">
                    Order Quantity
                  </Label>
                  <Input
                    id="production-order-quantity"
                    name="orderQuantity"
                    type="number"
                    value={formValues.orderQuantity}
                    onChange={(event) =>
                      updateField("orderQuantity", event.target.value)
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="production-preferred-supplier">
                    Preferred Supplier
                  </Label>
                  <Input
                    id="production-preferred-supplier"
                    name="preferredSupplier"
                    value={formValues.preferredSupplier}
                    onChange={(event) =>
                      updateField("preferredSupplier", event.target.value)
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="production-lead-time">Lead Time</Label>
                  <Input
                    id="production-lead-time"
                    name="leadTime"
                    value={formValues.leadTime}
                    onChange={(event) =>
                      updateField("leadTime", event.target.value)
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="production-image">Product Image</Label>
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
                <ProductionKanbanImageUpload
                  organizationId={profile?.organization_id}
                  partNumber={formValues.partNo}
                  currentFileName={uploadedFileName}
                  onUploaded={handleImageUploaded}
                  onUploadStateChange={handleImageUploadStateChange}
                />
              </div>

              <div className="space-y-3">
                <div>
                  <Label>Back Page Grid</Label>
                  <p className="text-sm text-muted-foreground">
                    Enter the 18 Location and Qty pairs. The footer code is fixed
                    to L0050.
                  </p>
                </div>
                <ProductionKanbanGridEditor
                  rows={backRows}
                  onRowChange={handleBackRowChange}
                />
              </div>
            </div>

            <CardFooter className="flex justify-end gap-x-3 px-0 pt-8">
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
                  isUploadingImage ||
                  hasPendingImageUpload
                }
              >
                {isSavePending || isGeneratingPdf || isUploadingImage ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {isSavePending
                  ? "Saving..."
                  : isGeneratingPdf
                  ? "Generating PDF..."
                  : isUploadingImage
                  ? "Uploading Image..."
                  : hasPendingImageUpload
                  ? "Upload Image First"
                  : editingCardId
                  ? "Update Production Kanban"
                  : "Create Card & Generate PDF"}
              </Button>
            </CardFooter>
          </form>
        </CardContent>
      </Card>

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
