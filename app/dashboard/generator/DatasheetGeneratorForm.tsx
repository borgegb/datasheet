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
import { Loader2, Download, Save, Eye, X, Plus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveDatasheet } from "../actions";
import { useSearchParams } from "next/navigation";

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

// Define props interface
interface DatasheetGeneratorFormProps {
  initialData?: Partial<ProductData> | null; // Make optional, allow partial data
  editingProductId?: string | null; // Pass the ID for context
}

export default function DatasheetGeneratorForm({
  initialData = null,
  editingProductId = null,
}: DatasheetGeneratorFormProps) {
  // --- Get search params ---
  const searchParams = useSearchParams();
  const catalogIdFromUrl = searchParams.get("catalogId");
  // -----------------------

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
  const [specs, setSpecs] = useState<
    { id: number; label: string; value: string }[]
  >(
    [] // Initialize empty
  );
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
  const [includeIrelandLogo, setIncludeIrelandLogo] = useState(
    initialData?.optional_logos?.includeIrelandLogo || false
  );
  const [selectedCatalogId, setSelectedCatalogId] = useState(
    // Prioritize initialData, then URL param (for new sheets), then empty
    initialData?.catalog_id || (initialData ? "" : catalogIdFromUrl) || ""
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
  const [isPreviewing, setIsPreviewing] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // --- Add state for new flow ---
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  // -----------------------------

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

  // --- Add useEffect to initialize specs state from initialData ---
  useEffect(() => {
    if (initialData?.tech_specs) {
      try {
        // Assuming tech_specs is stored as a JSON string representing the array
        const parsedSpecs = JSON.parse(initialData.tech_specs);
        if (Array.isArray(parsedSpecs)) {
          // Add a unique ID to each spec for stable key prop during rendering
          setSpecs(
            parsedSpecs.map((spec, index) => ({
              id: index, // Use index as simple ID for initial load
              label: spec.label || "",
              value: spec.value || "",
            }))
          );
        } else {
          console.warn("Initial tech_specs data is not an array:", parsedSpecs);
          setSpecs([]); // Fallback to empty array
        }
      } catch (error) {
        console.error("Error parsing initial tech_specs JSON:", error);
        // Attempt to parse as old text format (Label: Value)
        if (typeof initialData.tech_specs === "string") {
          const lines = initialData.tech_specs
            .split("\n")
            .filter((l) => l.includes(":"));
          setSpecs(
            lines.map((line, index) => {
              const parts = line.split(":");
              return {
                id: index,
                label: parts[0].trim(),
                value: parts.slice(1).join(":").trim(),
              };
            })
          );
          console.log("Parsed tech_specs from legacy text format.");
        } else {
          setSpecs([]); // Fallback if parsing fails
        }
      }
    } else {
      setSpecs([]); // Initialize empty if no initial data
    }
  }, [initialData]); // Rerun only if initialData changes
  // ----------------------------------------------------------

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

  // --- ADD useEffect to handle generation/download AFTER successful save ---
  useEffect(() => {
    // Check if save was successful and we have the product data (including ID)
    if (saveState?.data?.id && !saveState.error && user) {
      const savedProductId = saveState.data.id;
      const savedProductName = saveState.data.product_title || "datasheet"; // For filename
      const savedProductCode = saveState.data.product_code || "";
      console.log(
        `Save successful for ${savedProductId}, starting PDF generation...`
      );

      // Define async function inside useEffect to chain async calls
      const generateAndOpenPdf = async () => {
        setIsGeneratingPdf(true);
        const supabase = createClient();
        const generationToastId = toast.loading("Generating PDF...");

        try {
          // Call Edge function
          const { data: generateData, error: generateError } =
            await supabase.functions.invoke("generate-datasheet", {
              body: { productId: savedProductId, userId: user.id },
            });

          if (generateError)
            throw new Error(
              `Generation function error: ${generateError.message}`
            );
          if (generateData.error)
            throw new Error(`PDF generation failed: ${generateData.error}`);
          if (!generateData.pdfStoragePath)
            throw new Error("PDF storage path not returned from function.");

          console.log("PDF generated, path:", generateData.pdfStoragePath);

          // --- Generate Signed URL ---
          const expiresIn = 60; // URL valid for 60 seconds
          const { data: signedUrlData, error: signedUrlError } =
            await supabase.storage
              .from("datasheet-assets")
              .createSignedUrl(generateData.pdfStoragePath, expiresIn);

          if (signedUrlError)
            throw new Error(
              `Could not create signed URL: ${signedUrlError.message}`
            );
          if (!signedUrlData?.signedUrl)
            throw new Error("Signed URL data is missing.");

          const signedUrl = signedUrlData.signedUrl;
          console.log("Generated Signed URL:", signedUrl);
          // ---------------------------

          // --- Show success toast with View Button ---
          toast.success("PDF generated successfully!", {
            id: generationToastId, // Use ID to dismiss previous loading toast
            description: "Click the button to view your generated PDF.",
            action: (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(signedUrl, "_blank")}
              >
                View PDF
              </Button>
            ),
            duration: 15000, // Keep toast longer so user can click
          });
          // -----------------------------------------
        } catch (error: any) {
          console.error("Error during PDF generation/download:", error);
          toast.dismiss(generationToastId);
          toast.error(`Failed to generate or open PDF: ${error.message}`);
        } finally {
          setIsGeneratingPdf(false);
          setIsDownloadingPdf(false);
        }
      };

      // Trigger the async function
      generateAndOpenPdf();
    }
    // We ONLY want this effect to run when saveState changes specifically to a success state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveState, user]); // Add user dependency as it's used inside
  // ----------------------------------------------------------------------

  // --- handlePreview remains the same ---
  const handlePreview = async () => {
    if (isPreviewing || isGenerating || !user) {
      toast.error("Cannot preview: Please wait or ensure user is loaded.");
      return;
    }

    setIsPreviewing(true);
    toast.info("Generating preview...", { id: "preview-toast" });

    const supabase = createClient();
    // Gather current form data for preview
    const previewData = {
      isPreview: true,
      productTitle,
      productCode,
      description,
      keyFeatures,
      specs,
      weight,
      warranty,
      shippingInfo,
      imagePath: uploadedImagePath,
      imageOrientation,
      optionalLogos: {
        ceMark: includeCeLogo,
        origin: includeOriginLogo,
      },
      catalogCategory,
      userId: user.id,
    };

    console.log("Invoking preview function with data:", previewData);

    try {
      const { data, error } = await supabase.functions.invoke(
        "generate-datasheet",
        { body: previewData }
      );

      if (error) {
        throw new Error(error.message);
      }

      if (data.error) {
        throw new Error(data.error);
      }

      if (data.pdfData) {
        // Decode base64 and open in new tab
        const pdfBlob = await fetch(
          `data:application/pdf;base64,${data.pdfData}`
        ).then((res) => res.blob());
        const dataUrl = URL.createObjectURL(pdfBlob);
        window.open(dataUrl, "_blank");
        URL.revokeObjectURL(dataUrl); // Clean up the object URL after opening
        toast.success("Preview generated!", { id: "preview-toast" });
      } else {
        throw new Error(
          "Preview function returned unexpected or incomplete data."
        );
      }
    } catch (previewError: any) {
      console.error("Preview Error:", previewError);
      toast.error(`Preview failed: ${previewError.message}`, {
        id: "preview-toast",
      });
    } finally {
      setIsPreviewing(false);
    }
  };
  // ---                          ---

  // Show toasts based on the server action state
  useEffect(() => {
    if (saveState?.error) {
      // Error toast is now handled within the generateAndOpenPdf catch block if save succeeds but gen fails
      // Only show save-specific errors here
      if (!saveState.data) {
        // Ensure it's a pure save error
        toast.error(`Save failed: ${saveState.error.message}`);
      }
    }
    // Success toast moved to generateAndOpenPdf to indicate full process success
    // if (saveState?.data) { ... }
  }, [saveState]);

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
    isPreviewing,
    isLoadingCatalogs,
  });

  const handleSpecChange = (
    index: number,
    field: "label" | "value",
    value: string
  ) => {
    const newSpecs = specs.map((spec, i) => {
      if (i === index) {
        // Explicitly update based on field
        if (field === "label") {
          return { ...spec, label: value };
        } else {
          // field === 'value'
          return { ...spec, value: value };
        }
      }
      return spec;
    });
    setSpecs(newSpecs);
  };

  const addSpec = () => {
    setSpecs([...specs, { id: specs.length, label: "", value: "" }]);
  };

  const removeSpec = (index: number) => {
    const newSpecs = specs.filter((_, i) => i !== index);
    setSpecs(newSpecs);
  };

  // --- Add useEffect to handle URL param if initialData loads later ---
  // This handles cases where initialData might be null initially then populated
  useEffect(() => {
    // Only set from URL if we are NOT editing (no initialData.catalog_id)
    // and a catalogId exists in the URL and is different from current state
    if (
      !initialData?.catalog_id &&
      catalogIdFromUrl &&
      catalogIdFromUrl !== selectedCatalogId
    ) {
      console.log("Setting catalog ID from URL param:", catalogIdFromUrl);
      setSelectedCatalogId(catalogIdFromUrl);
    }
    // Don't run if selectedCatalogId changes, only if URL param or initialData changes
  }, [catalogIdFromUrl, initialData?.catalog_id]);
  // ---------------------------------------------------------------------

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
              <div className="space-y-4 sm:col-span-2">
                {" "}
                {/* Span across both columns */}
                <Label>Technical Specifications</Label>
                <div className="space-y-3">
                  {specs.map((spec, index) => (
                    <div key={spec.id} className="flex items-center gap-2">
                      <Input
                        value={spec.label}
                        onChange={(e) =>
                          handleSpecChange(index, "label", e.target.value)
                        }
                        placeholder="Label (e.g., Voltage)"
                        className="flex-1"
                      />
                      <Input
                        value={spec.value}
                        onChange={(e) =>
                          handleSpecChange(index, "value", e.target.value)
                        }
                        placeholder="Value (e.g., 24V)"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeSpec(index)}
                        aria-label="Remove specification"
                        className="text-destructive hover:bg-destructive/10"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addSpec}
                >
                  <Plus className="mr-2 h-4 w-4" /> Add Specification
                </Button>
                {/* Hidden input to store JSON string for form submission */}
                <input
                  type="hidden"
                  name="techSpecs"
                  value={JSON.stringify(specs.map(({ id, ...rest }) => rest))}
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
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      name="includeIrelandLogo"
                      id="logo-ireland"
                      checked={includeIrelandLogo}
                      onCheckedChange={(checked) =>
                        setIncludeIrelandLogo(Boolean(checked))
                      }
                    />
                    <Label
                      htmlFor="logo-ireland"
                      className="font-normal cursor-pointer"
                    >
                      Include "Designed & Manufactured in Ireland" Logo
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
          </div>

          <CardFooter className="flex justify-end pt-8 gap-x-3">
            {/* --- This is now the main "Generate & Save" Button --- */}
            <Button
              type="submit"
              variant="default" // Make it primary variant
              disabled={
                isSavePending || // Disable while saving
                isGeneratingPdf || // Disable while generating
                isDownloadingPdf || // Disable while downloading
                isPreviewing ||
                isLoadingCatalogs ||
                uploadProps.loading // Disable while uploading image
              }
            >
              {isSavePending || isGeneratingPdf || isDownloadingPdf ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" /> // Use Download icon?
              )}
              {isSavePending
                ? "Saving..."
                : isGeneratingPdf
                ? "Generating PDF..."
                : isDownloadingPdf
                ? "Downloading..."
                : "Generate & Save Datasheet"}
            </Button>

            {/* Preview Button (Keep as is) */}
            {/* <Button
              type="button"
              variant="secondary"
              onClick={handlePreview}
              disabled={
                isGeneratingPdf ||
                isDownloadingPdf ||
                isSavePending ||
                isPreviewing
              }
            >
              {isPreviewing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Eye className="mr-2 h-4 w-4" />
              )}
              {isPreviewing ? "Previewing..." : "Preview PDF"}
            </Button> */}
          </CardFooter>
        </form>
      </CardContent>
    </Card>
  );
}
