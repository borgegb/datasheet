"use client";

import {
  useState,
  useEffect,
  useCallback,
  useActionState,
  useRef,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dropzone,
  DropzoneContent,
  DropzoneEmptyState,
} from "@/components/dropzone";
import { useSupabaseUpload } from "@/hooks/use-supabase-upload";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Download, Save } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveDatasheet } from "../actions";

// Define type for Catalog
interface Catalog {
  id: string;
  name: string;
}

// Re-add definition for Profile type used in state
interface Profile {
  organization_id: string | null;
  full_name?: string | null; // Make optional if not always selected/present
  avatar_url?: string | null; // Make optional
}

// --- ADD ProductData Interface ---
interface ProductData {
  id: string;
  product_title: string;
  product_code: string;
  description: string | null;
  tech_specs: string | null;
  price: string | null;
  image_path: string | null;
  weight: string | null;
  key_features: string | null;
  warranty: string | null;
  shipping_info: string | null;
  image_orientation: "portrait" | "landscape" | null;
  optional_logos: any | null; // Use 'any' or a specific type for JSONB
  catalog_id: string | null;
  catalog_category?: string | null; // Add optional category if used
}
// ---------------------------------

// Helper function to create Data URL for download
function createDataUrlLink(
  base64Data: string,
  mimeType: string
): string | null {
  try {
    // Construct the Data URL string directly
    const dataUrl = `data:${mimeType};base64,${base64Data}`;
    return dataUrl;
  } catch (error) {
    console.error("Error creating data URL link:", error);
    toast.error("Failed to process generated file data.");
    return null;
  }
}

// Define props interface
interface DatasheetGeneratorFormProps {
  initialData?: Partial<ProductData> | null; // Make optional, allow partial data
  editingProductId?: string | null; // Pass the ID for context
}

export default function DatasheetGeneratorForm({
  initialData = null,
  editingProductId = null,
}: DatasheetGeneratorFormProps) {
  // --- State Initialization using initialData prop ---
  const [productTitle, setProductTitle] = useState(
    initialData?.product_title || ""
  );
  const [productCode, setProductCode] = useState(
    initialData?.product_code || ""
  );
  const [description, setDescription] = useState(
    initialData?.description || ""
  );
  const [techSpecs, setTechSpecs] = useState(initialData?.tech_specs || "");
  const [price, setPrice] = useState(initialData?.price || "");
  const [weight, setWeight] = useState(initialData?.weight || "");
  const [keyFeatures, setKeyFeatures] = useState(
    initialData?.key_features || ""
  );
  const [warranty, setWarranty] = useState(initialData?.warranty || "");
  const [shippingInfo, setShippingInfo] = useState(
    initialData?.shipping_info || ""
  );
  const [imageOrientation, setImageOrientation] = useState(
    initialData?.image_orientation || "portrait"
  );
  const [includeCeLogo, setIncludeCeLogo] = useState(
    initialData?.optional_logos?.ceMark || false
  );
  const [includeOriginLogo, setIncludeOriginLogo] = useState(
    initialData?.optional_logos?.origin || false
  );
  const [selectedCatalogId, setSelectedCatalogId] = useState(
    initialData?.catalog_id || ""
  );
  const [catalogCategory, setCatalogCategory] = useState(
    initialData?.catalog_category || ""
  );
  const [uploadedImagePath, setUploadedImagePath] = useState<string | null>(
    initialData?.image_path || null
  );
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  // --- Other State ---
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [isLoadingCatalogs, setIsLoadingCatalogs] = useState<boolean>(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [pdfDownloadUrl, setPdfDownloadUrl] = useState<string | null>(null);
  const [wordDownloadUrl, setWordDownloadUrl] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // --- Server Action State with useActionState ---
  const [saveState, saveFormAction, isSavePending] = useActionState(
    saveDatasheet,
    null
  );
  // ---------------------------------------------

  // useEffect to fetch USER, PROFILE, CATALOGS (Needed for save logic & dropdowns)
  useEffect(() => {
    let isMounted = true;
    const fetchStaticData = async () => {
      setIsLoadingCatalogs(true);
      // Reset states related to loading
      setCatalogs([]);
      setProfile(null); // Reset profile initially
      setUser(null); // Reset user initially

      const supabase = createClient();
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (!isMounted) return;
      if (userError || !userData?.user) {
        console.error("Error fetching user:", userError);
        setUser(null);
        setProfile(null);
        setCatalogs([]);
        setIsLoadingCatalogs(false);
        return;
      }
      setUser(userData.user);

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("organization_id, full_name, avatar_url")
        .eq("id", userData.user.id)
        .single();

      if (!isMounted) return;
      if (profileError || !profileData) {
        console.error("Error fetching profile:", { profileError });
        setProfile(null);
        setIsLoadingCatalogs(false);
      } else {
        setProfile(profileData);
        if (profileData.organization_id) {
          const { data: catalogData, error: catalogError } = await supabase
            .from("catalogs")
            .select("id, name")
            .eq("organization_id", profileData.organization_id)
            .order("name", { ascending: true });

          if (!isMounted) return;
          if (catalogError) {
            console.error("Error fetching catalogs:", catalogError);
            setCatalogs([]);
          } else {
            setCatalogs(catalogData || []);
          }
          setIsLoadingCatalogs(false);
        } else {
          setIsLoadingCatalogs(false);
        }
      }
    };

    fetchStaticData();

    return () => {
      isMounted = false;
    }; // Cleanup function
  }, []);

  // useEffect to extract filename from initialData or uploadedImagePath
  useEffect(() => {
    const pathSource = initialData?.image_path || uploadedImagePath;
    if (pathSource) {
      try {
        const url = new URL(pathSource, "http://dummybase");
        const filename = decodeURIComponent(
          url.pathname.split("/").pop() || ""
        );
        setUploadedFileName(filename || null);
      } catch {
        const filename = pathSource.split("/").pop();
        setUploadedFileName(filename || null);
      }
    } else {
      setUploadedFileName(null);
    }
  }, [initialData?.image_path, uploadedImagePath]);

  // Setup upload hook (pass user ID when available)
  const uploadProps = useSupabaseUpload({
    bucketName: "datasheet-assets",
    path: user ? `${user.id}/images/` : undefined,
    allowedMimeTypes: ["image/*"],
    maxFiles: 1,
  });

  // Effect to handle upload completion (updates uploadedImagePath/Name state)
  useEffect(() => {
    if (!uploadProps.loading && uploadProps.successes.length > 0 && user) {
      const lastSuccessFileName =
        uploadProps.successes[uploadProps.successes.length - 1];
      setUploadedFileName(lastSuccessFileName);
      const fullPath = `${user.id}/images/${lastSuccessFileName}`;
      setUploadedImagePath(fullPath);
      console.log("New image uploaded, path stored:", fullPath);
    }
  }, [uploadProps.loading, uploadProps.successes, user]);

  const handleGenerate = async () => {
    if (isGenerating || !user) return;

    setIsGenerating(true);
    setPdfDownloadUrl(null);
    setWordDownloadUrl(null);

    const supabase = createClient();
    const formData = {
      productTitle,
      productCode,
      description,
      techSpecs,
      price,
      imagePath: uploadedImagePath,
      weight,
      keyFeatures,
      warranty,
      shippingInfo,
      imageOrientation,
      optionalLogos: {
        ceMark: includeCeLogo,
        origin: includeOriginLogo,
      },
      catalogId: selectedCatalogId || null,
    };

    console.log("Invoking function with data:", formData);
    toast.info("Generating datasheet...", { id: "generation-toast" });

    const { data, error } = await supabase.functions.invoke(
      "generate-datasheet",
      { body: formData }
    );

    if (error) {
      console.error("Edge Function Error:", error);
      toast.error(`Datasheet generation failed: ${error.message}`, {
        id: "generation-toast",
      });
      setIsGenerating(false);
      return;
    }

    console.log("Edge Function Response:", data);

    if (data.error) {
      console.error("Error from function logic:", data.error);
      toast.error(`Datasheet generation failed: ${data.error}`, {
        id: "generation-toast",
      });
    } else if (data.pdfData) {
      toast.success("Datasheet generated successfully!", {
        id: "generation-toast",
      });
      const pdfUrl = createDataUrlLink(data.pdfData, "application/pdf");
      setPdfDownloadUrl(pdfUrl);
    } else {
      toast.error("Generation function returned incomplete data.", {
        id: "generation-toast",
      });
    }

    setIsGenerating(false);
  };

  // Show toasts based on the server action state
  useEffect(() => {
    if (saveState?.error) {
      toast.error(`Save failed: ${saveState.error.message}`);
    }
    if (saveState?.data) {
      toast.success(
        editingProductId ? "Datasheet updated!" : "Datasheet saved!"
      );
      if (!editingProductId && formRef.current) {
        // formRef.current.reset(); // Standard HTML reset
        // Or manually reset state if needed for controlled components
      }
    }
  }, [saveState, editingProductId]); // Depend on saveState

  // Function to get a safe filename
  const getSafeFilename = (name: string, extension: string) => {
    const safeName =
      name.replace(/[^a-z0-9]/gi, "_").toLowerCase() || "datasheet";
    return `${safeName}.${extension}`;
  };

  // Log rendering state (use isSavePending now)
  console.log("Rendering form, states:", {
    isGenerating,
    isSavePending,
    isLoadingCatalogs,
  });

  return (
    <Card className="w-full max-w-3xl mx-auto">
      {" "}
      {/* Center form with max-width */}
      <CardHeader>
        <CardTitle className="text-2xl">
          {editingProductId ? "Edit Datasheet" : "Create New Datasheet"}
        </CardTitle>
        <CardDescription>
          {editingProductId
            ? "Modify the details below."
            : "Enter the product details below to generate a datasheet."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Wrap content in a form tag */}
        <form ref={formRef} action={saveFormAction}>
          {/* Pass necessary data if needed via hidden fields, although action gets FormData */}
          {editingProductId && (
            <input
              type="hidden"
              name="editingProductId"
              value={editingProductId}
            />
          )}
          {/* Hidden input to pass imagePath */}
          <input
            type="hidden"
            name="imagePath"
            value={uploadedImagePath || ""}
          />

          <div className="space-y-8">
            {/* Section 1: Basic Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* All input fields need a `name` attribute matching formData expected by action */}
              <div className="space-y-1.5">
                <Label htmlFor="product-title">
                  Product Title <span className="text-red-500">*</span>
                </Label>
                <Input
                  name="productTitle"
                  id="product-title"
                  value={productTitle}
                  onChange={(e) => setProductTitle(e.target.value)}
                  placeholder="e.g., Super Widget Model X"
                  className="mt-1"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="product-code">
                  Product Code <span className="text-red-500">*</span>
                </Label>
                <Input
                  name="productCode"
                  id="product-code"
                  value={productCode}
                  onChange={(e) => setProductCode(e.target.value)}
                  placeholder="e.g., SW-MDLX-001"
                  className="mt-1"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="price">Price</Label>
                <Input
                  name="price"
                  id="price"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="e.g., $99.99"
                  className="mt-1"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="weight">Weight</Label>
                <Input
                  name="weight"
                  id="weight"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="e.g., 2 kg, 5 lbs"
                />
              </div>
            </div>

            {/* Section 2: Descriptions & Specs */}
            <div className="space-y-6">
              <div className="space-y-1.5">
                <Label htmlFor="description">
                  Description <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  name="description"
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the product..."
                  className="mt-1"
                  rows={4}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="key-features">Key Features</Label>
                <Textarea
                  name="keyFeatures"
                  id="key-features"
                  value={keyFeatures}
                  onChange={(e) => setKeyFeatures(e.target.value)}
                  placeholder="Enter key features, one per line (will be bulleted)"
                  rows={5}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tech-specs">Technical Specifications</Label>
                <Textarea
                  name="techSpecs"
                  id="tech-specs"
                  value={techSpecs}
                  onChange={(e) => setTechSpecs(e.target.value)}
                  placeholder="Enter specs, e.g., Label: Value per line (will be tabled)"
                  rows={6}
                />
              </div>
            </div>

            {/* Section 3: Options & Categorization */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-8">
              <div className="space-y-1.5">
                <Label htmlFor="warranty">Warranty</Label>
                <Select
                  name="warranty"
                  value={warranty}
                  onValueChange={setWarranty}
                >
                  <SelectTrigger id="warranty">
                    <SelectValue placeholder="Select warranty..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="1y">1 Year Limited</SelectItem>
                    <SelectItem value="2y">2 Year Limited</SelectItem>
                    <SelectItem value="lifetime">Lifetime Limited</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shipping-info">Shipping Info</Label>
                <Select
                  name="shippingInfo"
                  value={shippingInfo}
                  onValueChange={setShippingInfo}
                >
                  <SelectTrigger id="shipping-info">
                    <SelectValue placeholder="Select shipping..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="std">Standard</SelectItem>
                    <SelectItem value="expedited">Expedited</SelectItem>
                    <SelectItem value="freight">Freight</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Image Orientation</Label>
                <input
                  type="hidden"
                  name="imageOrientation"
                  value={imageOrientation}
                />
                <RadioGroup
                  name="imageOrientation"
                  defaultValue={imageOrientation}
                  onValueChange={(value: "portrait" | "landscape") =>
                    setImageOrientation(value)
                  }
                  className="flex space-x-4 pt-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="portrait" id="orient-p" />
                    <Label
                      htmlFor="orient-p"
                      className="font-normal cursor-pointer"
                    >
                      Portrait
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="landscape" id="orient-l" />
                    <Label
                      htmlFor="orient-l"
                      className="font-normal cursor-pointer"
                    >
                      Landscape
                    </Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="space-y-1.5">
                <Label>Optional Logos/Certs</Label>
                <div className="flex flex-col space-y-2 pt-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      name="includeCeLogo"
                      id="logo-ce"
                      checked={includeCeLogo}
                      onCheckedChange={(checked) =>
                        setIncludeCeLogo(Boolean(checked))
                      }
                    />
                    <Label
                      htmlFor="logo-ce"
                      className="font-normal cursor-pointer"
                    >
                      Include CE Mark
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      name="includeOriginLogo"
                      id="logo-origin"
                      checked={includeOriginLogo}
                      onCheckedChange={(checked) =>
                        setIncludeOriginLogo(Boolean(checked))
                      }
                    />
                    <Label
                      htmlFor="logo-origin"
                      className="font-normal cursor-pointer"
                    >
                      Include Origin Logo
                    </Label>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5 sm:col-span-1">
                <Label htmlFor="catalog">Assign to Catalog</Label>
                <Select
                  name="catalogId"
                  value={selectedCatalogId}
                  onValueChange={setSelectedCatalogId}
                  disabled={isLoadingCatalogs}
                >
                  <SelectTrigger id="catalog">
                    <SelectValue
                      placeholder={
                        isLoadingCatalogs
                          ? "Loading catalogs..."
                          : "Select catalog..."
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingCatalogs ? (
                      <SelectItem value="loading" disabled>
                        Loading...
                      </SelectItem>
                    ) : catalogs.length === 0 ? (
                      <SelectItem value="no-catalogs" disabled>
                        No catalogs found
                      </SelectItem>
                    ) : (
                      catalogs.map((catalog) => (
                        <SelectItem key={catalog.id} value={catalog.id}>
                          {catalog.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-1">
                <Label htmlFor="catalog-category">
                  Catalog Section/Category
                </Label>
                <Input
                  name="catalogCategory"
                  value={catalogCategory}
                  onChange={(e) => setCatalogCategory(e.target.value)}
                />
              </div>
            </div>

            {/* Section 4: Image Upload */}
            <div className="space-y-1.5">
              <Label htmlFor="product-image">Product Image</Label>
              {user ? (
                <Dropzone {...uploadProps} className="mt-1 border-border">
                  <DropzoneEmptyState />
                  <DropzoneContent />
                </Dropzone>
              ) : (
                <div className="mt-1 flex items-center justify-center h-32 border-2 border-dashed border-gray-300 rounded-lg bg-muted">
                  <p className="text-sm text-muted-foreground">
                    Loading user info...
                  </p>
                </div>
              )}
              {uploadedFileName && (
                <div className="mt-2 text-sm text-green-600">
                  Image "{uploadedFileName}" uploaded.
                </div>
              )}
              {uploadProps.errors.length > 0 && (
                <div className="mt-2 text-sm text-destructive">
                  {/* Errors handled by DropzoneContent or toasts */}
                </div>
              )}
            </div>

            {/* Download Links Area */}
            {(pdfDownloadUrl || wordDownloadUrl) && (
              <div className="col-span-full mt-6 p-4 border rounded-md bg-muted/50">
                <h3 className="text-lg font-medium mb-2">Downloads:</h3>
                <div className="flex flex-col sm:flex-row gap-4">
                  {pdfDownloadUrl && (
                    <Button asChild variant="outline">
                      <a
                        href={pdfDownloadUrl}
                        download={getSafeFilename(
                          productCode || productTitle,
                          "pdf"
                        )}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Download PDF
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          <CardFooter className="flex justify-end pt-8 gap-x-3">
            {/* Submit button triggers form action */}
            <Button
              type="submit"
              variant="outline"
              disabled={isSavePending || isGenerating || isLoadingCatalogs}
            >
              {isSavePending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {isSavePending
                ? "Saving..."
                : editingProductId
                ? "Update Datasheet"
                : "Save Datasheet"}
            </Button>
            {/* Generate button remains type="button" */}
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={
                isSavePending ||
                isGenerating ||
                uploadProps.loading ||
                isLoadingCatalogs
              }
            >
              {isGenerating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {isGenerating ? "Generating..." : "Generate Datasheet"}
            </Button>
          </CardFooter>
        </form>
      </CardContent>
    </Card>
  );
}
