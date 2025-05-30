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
import { saveDatasheet, fetchCategories } from "../actions";
import { useSearchParams } from "next/navigation";

// Define type for Category (if not already defined)
interface Category {
  id: string;
  name: string;
}

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
  catalog_id: string | null; // ADD BACK
  category_ids?: string[] | null; // ADD (as array of strings)
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
  const [weightValue, setWeightValue] = useState("");
  const [weightUnit, setWeightUnit] = useState("kg");
  const [keyFeatures, setKeyFeatures] = useState(
    initialData?.key_features || ""
  );
  const [warranty, setWarranty] = useState(initialData?.warranty || "");
  const [shippingUnits, setShippingUnits] = useState("4");
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
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(
    // Initialize from initialData if editing
    initialData?.category_ids || []
  );
  const [uploadedImagePath, setUploadedImagePath] = useState<string | null>(
    initialData?.image_path || null
  );
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  // --- Restore Catalog State ---
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>(
    // Prioritize initialData, then URL param (for new sheets), then empty
    initialData?.catalog_id || (editingProductId ? "" : catalogIdFromUrl) || ""
  );
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  // --- End Restore Catalog State ---

  // --- Other State ---
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [availableCategories, setAvailableCategories] = useState<Category[]>(
    []
  );
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true); // Combined loading state
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

  // Character and line limits
  const DESCRIPTION_MAX_CHARS = 500;
  const KEY_FEATURES_MAX_CHARS = 1000;
  const KEY_FEATURES_MAX_LINES = 7;

  // Helper function to count lines
  const countLines = (text: string): number => {
    return text.split("\n").filter((line) => line.trim().length > 0).length;
  };

  // Helper function to generate shipping text
  const generateShippingText = (): string => {
    const productName = productTitle || "[Product Name]";
    const units = shippingUnits || "4";
    return `The ${productName} is shipped securely mounted on a wooden pallet measuring 1200mm×1000mm. Up to ${units} units can be shipped on a single pallet, and it is recommended to ship the full quantity per pallet to maximize value and efficiency.`;
  };

  // useEffect to fetch USER, PROFILE, and CATEGORIES
  useEffect(() => {
    let isMounted = true;
    const fetchStaticData = async () => {
      setIsLoadingData(true); // Start loading
      // Reset states related to loading
      setAvailableCategories([]); // Reset categories
      setCatalogs([]); // Reset catalogs too
      setProfile(null);
      setUser(null);

      const supabase = createClient();
      // Fetch User
      const { data: userData, error: userError } =
        await supabase.auth.getUser();
      if (!isMounted) return;
      if (userError || !userData?.user) {
        console.error("Error fetching user:", userError);
        setUser(null);
        setProfile(null);
        setIsLoadingData(false);
        return;
      }
      setUser(userData.user);

      // Fetch Profile (needed for org context if categories become org-specific later)
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("organization_id, full_name, avatar_url")
        .eq("id", userData.user.id)
        .single();

      if (!isMounted) return;
      if (profileError || !profileData) {
        console.error("Error fetching profile:", { profileError });
        setProfile(null);
      } else {
        setProfile(profileData);
        // --- Fetch Catalogs if Org ID exists ---
        if (profileData.organization_id) {
          const { data: catalogData, error: catalogError } = await supabase
            .from("catalogs")
            .select("id, name")
            .eq("organization_id", profileData.organization_id)
            .order("name", { ascending: true });

          if (!isMounted) return;
          if (catalogError) {
            console.error("Error fetching catalogs:", catalogError);
            toast.error("Failed to load catalogs.");
            setCatalogs([]);
          } else {
            setCatalogs(catalogData || []);
          }
        }
        // -----------------------------------------
      }

      // Fetch Categories (using server action)
      const { data: categoryData, error: categoryError } =
        await fetchCategories();
      if (!isMounted) return;
      if (categoryError) {
        console.error("Error fetching categories:", categoryError);
        toast.error("Failed to load categories.");
        setAvailableCategories([]);
      } else {
        setAvailableCategories(categoryData || []);
      }

      setIsLoadingData(false); // Finish loading
    };

    fetchStaticData();

    return () => {
      isMounted = false;
    };
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

  // --- Update useEffect to initialize form state including categories ---
  useEffect(() => {
    if (initialData) {
      // Set standard fields
      setProductTitle(initialData.product_title || "");
      setProductCode(initialData.product_code || "");
      setDescription(initialData.description || "");
      // Parse weight value and unit
      if (initialData.weight) {
        const weightParts = initialData.weight.split(" ");
        setWeightValue(weightParts[0] || "");
        setWeightUnit(weightParts[1] || "kg");
      } else {
        setWeightValue("");
        setWeightUnit("kg");
      }
      setKeyFeatures(initialData.key_features || "");
      setWarranty(initialData.warranty || "");
      // Parse shipping units from existing shipping_info if it contains a number
      if (initialData.shipping_info) {
        const unitsMatch = initialData.shipping_info.match(
          /Up to\s+(\d+)\s+units/
        );
        setShippingUnits(unitsMatch ? unitsMatch[1] : "4");
      } else {
        setShippingUnits("4");
      }
      setImageOrientation(initialData.image_orientation || "portrait");
      setUploadedImagePath(initialData.image_path || null);
      // Logos need careful handling of null/undefined optional_logos
      const logos = initialData.optional_logos || {};
      setIncludeCeLogo(logos.ceMark || false);
      setIncludeOriginLogo(logos.origin || false);
      setIncludeIrelandLogo(logos.includeIrelandLogo || false);
      // Restore selected catalog ID
      setSelectedCatalogId(initialData.catalog_id || "");

      // Initialize selected categories
      if (initialData.category_ids && Array.isArray(initialData.category_ids)) {
        setSelectedCategoryIds(initialData.category_ids);
      } else {
        setSelectedCategoryIds([]);
      }

      // Initialize specs (with improved parsing)
      if (initialData.tech_specs) {
        let parsedSpecsArray = [];
        try {
          // Attempt 1: Parse directly
          parsedSpecsArray = JSON.parse(initialData.tech_specs);
        } catch (e1) {
          // Attempt 2: Check for double-quoted string "[...]"
          if (
            typeof initialData.tech_specs === "string" &&
            initialData.tech_specs.startsWith('"') &&
            initialData.tech_specs.endsWith('"')
          ) {
            try {
              // Remove outer quotes and try parsing the inner content
              const innerJson = initialData.tech_specs.slice(1, -1);
              parsedSpecsArray = JSON.parse(innerJson);
            } catch (e2) {
              console.error("Error parsing inner JSON for tech_specs:", e2);
              parsedSpecsArray = []; // Fallback if inner parse fails
            }
          } else {
            // Attempt 3: Try parsing as legacy text format (Label: Value)
            if (typeof initialData.tech_specs === "string") {
              console.log(
                "Attempting to parse tech_specs as legacy text format."
              );
              const lines = initialData.tech_specs
                .split("\n")
                .map((l) => l.trim())
                .filter((l) => l.includes(":"));

              if (lines.length > 0) {
                parsedSpecsArray = lines.map((line) => {
                  const parts = line.split(":");
                  return {
                    // id: index, // ID will be added below
                    label: parts[0]?.trim() || "",
                    value: parts.slice(1).join(":")?.trim() || "",
                  };
                });
                console.log("Parsed tech_specs from legacy text format.");
              } else {
                console.warn(
                  "Tech_specs string did not match JSON, double-quoted JSON, or legacy format."
                );
              }
            } else {
              console.warn(
                "Tech_specs was not a string and initial JSON parse failed."
              );
            }
          }
        }

        // Ensure it's an array before mapping and setting state
        if (Array.isArray(parsedSpecsArray)) {
          setSpecs(
            parsedSpecsArray.map((spec: any, index: number) => ({
              id: index, // Assign stable ID during mapping
              label: spec.label || "",
              value: spec.value || "",
            }))
          );
        } else {
          console.warn(
            "Final parsed tech_specs data is not an array:",
            parsedSpecsArray
          );
          setSpecs([]); // Fallback to empty array if parsing resulted in non-array
        }
      } else {
        setSpecs([]); // Initialize empty if no initial tech_specs data
      }
    } else {
      // Reset all fields if initialData becomes null (e.g., switching from edit to create)
      setProductTitle("");
      setProductCode("");
      setDescription("");
      setSpecs([]);
      setWeightValue("");
      setWeightUnit("kg");
      setKeyFeatures("");
      setWarranty("");
      setShippingUnits("4");
      setImageOrientation("portrait");
      setIncludeCeLogo(false);
      setIncludeOriginLogo(false);
      setIncludeIrelandLogo(false);
      setSelectedCategoryIds([]);
      setUploadedImagePath(null);
      setUploadedFileName(null);
      setSelectedCatalogId("");
    }
  }, [initialData]);
  // --------------------------------------------------------------------

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
        if (!user) {
          toast.error("You must be logged in to generate a PDF.");
          return;
        }
        if (!savedProductId) {
          toast.error(
            "Please save the datasheet first before generating the PDF."
          );
          return;
        }

        setIsGeneratingPdf(true); // Use the new state for Vercel generation
        toast.info("🚀 Your PDF is being generated...", { duration: 10000 }); // Longer duration

        try {
          // Prepare payload - ensure it matches what the Vercel function expects
          const payload = {
            productId: savedProductId,
            // userId: user.id, // Optional: Vercel function might not need userId if product ID is enough
            // any other data needed by buildPdf, if not fetched via productId by the Vercel function
          };

          console.log("Payload for Vercel function:", payload);

          // NEW — calls the Vercel route
          const res = await fetch("/api/generate-pdf", {
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
            // toast.success("✅ PDF ready! Opening in a new tab.");
            // window.open(url, "_blank"); // Don't open automatically

            // --- Show success toast with View Button (Re-added) ---
            toast.success("✅ PDF generated successfully!", {
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
            // -----------------------------------------------------
          } else {
            throw new Error("PDF URL not found in response.");
          }
        } catch (error: any) {
          console.error("Error generating or opening PDF:", error);
          toast.error(
            `Failed to generate PDF: ${error.message || "Unknown error"}`
          );
        } finally {
          setIsGeneratingPdf(false);
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
      weight: weightValue && weightUnit ? `${weightValue} ${weightUnit}` : "",
      warranty,
      shippingInfo: shippingUnits,
      imagePath: uploadedImagePath,
      imageOrientation,
      optionalLogos: {
        ceMark: includeCeLogo,
        origin: includeOriginLogo,
      },
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
    isLoadingData,
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

  // --- Handler for Category Checkbox Change ---
  const handleCategoryChange = (categoryId: string, checked: boolean) => {
    setSelectedCategoryIds((prevIds) => {
      if (checked) {
        // Add ID if not already present
        return prevIds.includes(categoryId)
          ? prevIds
          : [...prevIds, categoryId];
      } else {
        // Remove ID
        return prevIds.filter((id) => id !== categoryId);
      }
    });
  };
  // -------------------------------------------

  // --- Restore useEffect to handle catalogIdFromUrl if needed ---
  useEffect(() => {
    // Only set from URL if we are NOT editing (no initialData.catalog_id)
    // and a catalogId exists in the URL and is different from current state
    if (
      !editingProductId && // Check if editing
      !initialData?.catalog_id &&
      catalogIdFromUrl &&
      catalogIdFromUrl !== selectedCatalogId
    ) {
      console.log("Setting catalog ID from URL param:", catalogIdFromUrl);
      setSelectedCatalogId(catalogIdFromUrl);
    }
  }, [
    catalogIdFromUrl,
    initialData?.catalog_id,
    editingProductId,
    selectedCatalogId,
  ]);
  // ------------------------------------------------------------

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

          {/* --- Hidden input for selected category IDs --- */}
          <input
            type="hidden"
            name="categoryIdsJson"
            value={JSON.stringify(selectedCategoryIds)}
          />
          {/* -------------------------------------------- */}

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
                <Label htmlFor="weight">Weight</Label>
                <div className="flex gap-2">
                  <Input
                    name="weightValue"
                    id="weight"
                    type="number"
                    value={weightValue}
                    onChange={(e) => setWeightValue(e.target.value)}
                    placeholder="42"
                    className="flex-1"
                  />
                  <Select
                    name="weightUnit"
                    value={weightUnit}
                    onValueChange={setWeightUnit}
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kg">kg</SelectItem>
                      <SelectItem value="g">g</SelectItem>
                      <SelectItem value="lbs">lbs</SelectItem>
                      <SelectItem value="oz">oz</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {/* Hidden input to combine weight value and unit */}
                <input
                  type="hidden"
                  name="weight"
                  value={
                    weightValue && weightUnit
                      ? `${weightValue} ${weightUnit}`
                      : ""
                  }
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
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value.length <= DESCRIPTION_MAX_CHARS) {
                      setDescription(value);
                    }
                  }}
                  placeholder="Describe the product..."
                  className="mt-1"
                  rows={4}
                  maxLength={DESCRIPTION_MAX_CHARS}
                  required
                />
                <div className="text-sm text-muted-foreground text-right">
                  {description.length}/{DESCRIPTION_MAX_CHARS} characters
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="key-features">Key Features</Label>
                <Textarea
                  name="keyFeatures"
                  id="key-features"
                  value={keyFeatures}
                  onChange={(e) => {
                    const value = e.target.value;
                    const lineCount = countLines(value);
                    if (
                      value.length <= KEY_FEATURES_MAX_CHARS &&
                      lineCount <= KEY_FEATURES_MAX_LINES
                    ) {
                      setKeyFeatures(value);
                    }
                  }}
                  placeholder="Enter key features, one per line (will be bulleted)"
                  rows={5}
                  maxLength={KEY_FEATURES_MAX_CHARS}
                />
                <div className="text-sm text-muted-foreground text-right">
                  {keyFeatures.length}/{KEY_FEATURES_MAX_CHARS} characters •{" "}
                  {countLines(keyFeatures)}/{KEY_FEATURES_MAX_LINES} lines
                </div>
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
                  name="catalogId" // Ensure name matches what saveDatasheet expects if using FormData directly
                  value={selectedCatalogId}
                  onValueChange={setSelectedCatalogId}
                  disabled={isLoadingData} // Use combined loading state
                >
                  <SelectTrigger id="catalog">
                    <SelectValue
                      placeholder={
                        isLoadingData
                          ? "Loading catalogs..."
                          : "Select catalog..."
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingData ? (
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
              <div className="sm:col-span-2 space-y-2">
                <Label>Assign Categories</Label>
                {isLoadingData && (
                  <p className="text-sm text-muted-foreground">
                    Loading categories...
                  </p>
                )}
                {!isLoadingData && availableCategories.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No categories available. An owner needs to create them in
                    the Organization settings.
                  </p>
                )}
                {!isLoadingData && availableCategories.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-1">
                    {availableCategories.map((category) => (
                      <div
                        key={category.id}
                        className="flex items-center space-x-2"
                      >
                        <Checkbox
                          id={`category-${category.id}`}
                          checked={selectedCategoryIds.includes(category.id)}
                          onCheckedChange={(checked) => {
                            handleCategoryChange(category.id, Boolean(checked));
                          }}
                        />
                        <Label
                          htmlFor={`category-${category.id}`}
                          className="font-normal cursor-pointer"
                        >
                          {category.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Section 4: Shipping Info - Full Width */}
            <div className="space-y-1.5">
              <Label htmlFor="shipping-info">Shipping Info</Label>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Label htmlFor="shipping-units" className="text-sm">
                    Units per pallet:
                  </Label>
                  <Input
                    name="shippingUnits"
                    id="shipping-units"
                    type="number"
                    value={shippingUnits}
                    onChange={(e) => setShippingUnits(e.target.value)}
                    placeholder="4"
                    className="w-20"
                    min="1"
                    max="1000"
                  />
                </div>
                {/* Preview of shipping text */}
                <div className="bg-muted p-3 rounded-md border">
                  <Label className="text-sm font-medium text-muted-foreground">
                    Preview:
                  </Label>
                  <p className="text-sm mt-1">{generateShippingText()}</p>
                </div>
                {/* Hidden input for form submission */}
                <input
                  type="hidden"
                  name="shippingInfo"
                  value={shippingUnits}
                />
              </div>
            </div>

            {/* Section 5: Image Upload */}
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
                isLoadingData ||
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
