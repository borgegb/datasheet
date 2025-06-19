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
import {
  Loader2,
  Download,
  Save,
  Eye,
  X,
  Plus,
  Sparkles,
  Wand2,
  RefreshCw,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveDatasheet, fetchCategories } from "../actions";
import { useSearchParams, useRouter } from "next/navigation";

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
  selectedProduct?: any; // Product selected from sidebar
}

export default function DatasheetGeneratorForm({
  initialData = null,
  editingProductId = null,
  selectedProduct,
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

  // --- Enhanced Shipping State ---
  const [shippingMethod, setShippingMethod] = useState<"pallet" | "package">(
    "pallet"
  );
  const [shippingUnits, setShippingUnits] = useState("4");
  const [shippingUnitType, setShippingUnitType] = useState("unit");
  // Package dimensions state
  const [packageLength, setPackageLength] = useState("");
  const [packageWidth, setPackageWidth] = useState("");
  const [packageHeight, setPackageHeight] = useState("");
  const [packageWeight, setPackageWeight] = useState("");
  const [packageDimensionUnit, setPackageDimensionUnit] = useState("mm");
  const [packageWeightUnit, setPackageWeightUnit] = useState("kg");
  // Editable shipping text
  const [customShippingText, setCustomShippingText] = useState("");
  const [useCustomShippingText, setUseCustomShippingText] = useState(false);
  // --- End Enhanced Shipping State ---

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
  const router = useRouter();

  // --- Add flag to track form initialization ---
  const [hasFormBeenInitialized, setHasFormBeenInitialized] = useState(false);
  // ----------------------------------------

  // --- Add state for new flow ---
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  // -----------------------------

  // --- AI Generation State ---
  const [isGeneratingFeatures, setIsGeneratingFeatures] = useState(false);
  const [isGeneratingSpecs, setIsGeneratingSpecs] = useState(false);
  const [isEnhancingDescription, setIsEnhancingDescription] = useState(false);
  // -------------------------

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

    if (shippingMethod === "package") {
      // Package shipping text
      const dimensions =
        packageLength && packageWidth && packageHeight
          ? `${packageLength} × ${packageWidth} × ${packageHeight} ${packageDimensionUnit}`
          : "[dimensions]";
      const weight = packageWeight
        ? `${packageWeight} ${packageWeightUnit}`
        : "[weight]";

      return `The ${productName} is shipped as an individual package measuring ${dimensions} with a weight of ${weight}. Each unit is carefully packaged to ensure safe delivery.`;
    } else {
      // Pallet shipping text with special case for single unit
      const units = shippingUnits || "1";
      const label = shippingUnitType;

      if (units === "1") {
        // Special case for single unit - use "One" and singular form
        return `The ${productName} is shipped securely mounted on a wooden pallet measuring 1200 mm × 1000 mm. One ${label} is shipped per pallet.`;
      } else {
        // Multiple units - use existing logic
        const plural = label === "box" ? "boxes" : `${label}s`;
        return `The ${productName} is shipped securely mounted on a wooden pallet measuring 1200 mm × 1000 mm. Up to ${units} ${plural} can be shipped on a single pallet, and it is recommended to ship the full quantity per pallet to maximize value and efficiency.`;
      }
    }
  };

  // --- AI Generation Functions ---
  const handleGenerateFeatures = async () => {
    if (!productTitle && !description) {
      toast.error("Please enter a product title or description first.");
      return;
    }

    setIsGeneratingFeatures(true);
    toast.info("🤖 Generating key features...", { duration: 10000 });

    try {
      const response = await fetch("/api/generate-features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productTitle,
          productCode,
          description,
          currentKeyFeatures: keyFeatures, // Send current features so AI can build upon them
          specifications: specs, // Send specs for additional context
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate features");
      }

      const { features } = await response.json();

      if (features && Array.isArray(features)) {
        setKeyFeatures(features.join("\n"));
        toast.success("✨ Key features generated!", { duration: 5000 });
      } else {
        throw new Error("Invalid response format");
      }
    } catch (error: any) {
      console.error("Error generating features:", error);
      toast.error(`Failed to generate features: ${error.message}`);
    } finally {
      setIsGeneratingFeatures(false);
    }
  };

  const handleGenerateSpecs = async () => {
    if (!productTitle && !description) {
      toast.error("Please enter a product title or description first.");
      return;
    }

    setIsGeneratingSpecs(true);
    toast.info("🤖 Generating specifications...", { duration: 10000 });

    try {
      const response = await fetch("/api/generate-specifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productTitle,
          productCode,
          description,
          currentSpecifications: specs, // Send current specs so AI can build upon them
          keyFeatures, // Send features for additional context
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate specifications");
      }

      const { specifications } = await response.json();

      if (specifications && Array.isArray(specifications)) {
        // Convert to the format expected by the form
        const formattedSpecs = specifications.map(
          (spec: any, index: number) => ({
            id: index,
            label: spec.label,
            value: spec.value,
          })
        );
        setSpecs(formattedSpecs);
        toast.success("✨ Specifications generated!", { duration: 5000 });
      } else {
        throw new Error("Invalid response format");
      }
    } catch (error: any) {
      console.error("Error generating specifications:", error);
      toast.error(`Failed to generate specifications: ${error.message}`);
    } finally {
      setIsGeneratingSpecs(false);
    }
  };

  const handleEnhanceDescription = async () => {
    if (!description?.trim()) {
      toast.error("Please enter a description first.");
      return;
    }

    setIsEnhancingDescription(true);
    toast.info("🤖 Enhancing description...", { duration: 10000 });

    try {
      const response = await fetch("/api/enhance-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentDescription: description,
          productTitle,
          productCode,
          specifications: specs,
          keyFeatures,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to enhance description");
      }

      const { enhancedDescription, characterCount } = await response.json();

      if (enhancedDescription) {
        setDescription(enhancedDescription);

        // Show warning if close to or at the character limit
        if (characterCount >= 497) {
          toast.success("✨ Description enhanced!", {
            description: `⚠️ Generated ${characterCount}/500 characters (at limit)`,
            duration: 7000,
          });
        } else {
          toast.success("✨ Description enhanced!", {
            description: `Generated ${characterCount}/500 characters`,
            duration: 5000,
          });
        }
      } else {
        throw new Error("Invalid response format");
      }
    } catch (error: any) {
      console.error("Error enhancing description:", error);
      toast.error(`Failed to enhance description: ${error.message}`);
    } finally {
      setIsEnhancingDescription(false);
    }
  };

  // --- Product Selection Handler ---
  const handleProductSelect = (product: any) => {
    console.log("Selected product:", product); // Debug log

    // Map product data to form fields
    setProductTitle(product.title);
    setProductCode(product.item_number !== "N/A" ? product.item_number : "");
    setDescription(product.description);

    // Map key features
    if (
      product.key_features &&
      Array.isArray(product.key_features) &&
      product.key_features.length > 0
    ) {
      setKeyFeatures(product.key_features.join("\n"));
    } else {
      setKeyFeatures("");
    }

    // Map specifications with better parsing
    if (
      product.specifications &&
      Array.isArray(product.specifications) &&
      product.specifications.length > 0
    ) {
      console.log("Original specifications:", product.specifications); // Debug log

      const formattedSpecs = product.specifications.map(
        (spec: string, index: number) => {
          // Try to split by colon if it exists
          const colonIndex = spec.indexOf(":");
          if (colonIndex > 0) {
            return {
              id: index,
              label: spec.substring(0, colonIndex).trim(),
              value: spec.substring(colonIndex + 1).trim(),
            };
          } else {
            // If no colon, treat the whole string as the label
            return {
              id: index,
              label: spec.trim(),
              value: "",
            };
          }
        }
      );

      console.log("Formatted specifications:", formattedSpecs); // Debug log
      setSpecs(formattedSpecs);
    } else {
      console.log("No specifications found or empty array"); // Debug log
      setSpecs([]);
    }

    // Clear image and other fields that don't have mappings
    setUploadedImagePath(null);
    setUploadedFileName(null);
    setWeightValue("");
    setWarranty("");

    toast.success(`Populated form with "${product.title}"`);
  };
  // -------------------------------

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

      // Parse shipping info - enhanced to handle new shipping structure
      if (initialData.shipping_info) {
        try {
          // Try to parse as JSON first (new format)
          const shippingData = JSON.parse(initialData.shipping_info);
          if (shippingData.method) {
            setShippingMethod(shippingData.method);
            if (shippingData.method === "pallet") {
              setShippingUnits(shippingData.units || "4");
              setShippingUnitType(shippingData.unitType || "unit");
            } else if (shippingData.method === "package") {
              setPackageLength(shippingData.length || "");
              setPackageWidth(shippingData.width || "");
              setPackageHeight(shippingData.height || "");
              setPackageWeight(shippingData.weight || "");
              setPackageDimensionUnit(shippingData.dimensionUnit || "mm");
              setPackageWeightUnit(shippingData.weightUnit || "kg");
            }
            if (shippingData.customText) {
              setCustomShippingText(shippingData.customText);
              setUseCustomShippingText(true);
            }
          }
        } catch {
          // Fallback: parse legacy format (existing behavior)
          const match = initialData.shipping_info.match(/(\d+)\s+(\w+)/);
          if (match) {
            setShippingUnits(match[1]);
            setShippingUnitType(match[2].replace(/s$/, ""));
            setShippingMethod("pallet");
          } else {
            // Treat as custom text if no pattern matches
            setCustomShippingText(initialData.shipping_info);
            setUseCustomShippingText(true);
            setShippingMethod("pallet");
          }
        }
      } else {
        setShippingUnits("4");
        setShippingUnitType("unit");
        setShippingMethod("pallet");
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

      // Mark form as initialized after loading data for editing
      setHasFormBeenInitialized(true);
    } else if (!hasFormBeenInitialized) {
      // Only reset all fields on the very first load when creating a new datasheet
      // Don't reset if user has already interacted with the form
      setProductTitle("");
      setProductCode("");
      setDescription("");
      setSpecs([]);
      setWeightValue("");
      setWeightUnit("kg");
      setKeyFeatures("");
      setWarranty("");
      setShippingMethod("pallet");
      setShippingUnits("4");
      setShippingUnitType("unit");
      setPackageLength("");
      setPackageWidth("");
      setPackageHeight("");
      setPackageWeight("");
      setPackageDimensionUnit("mm");
      setPackageWeightUnit("kg");
      setCustomShippingText("");
      setUseCustomShippingText(false);
      setImageOrientation("portrait");
      setIncludeCeLogo(false);
      setIncludeOriginLogo(false);
      setIncludeIrelandLogo(false);
      setSelectedCategoryIds([]);
      setUploadedImagePath(null);
      setUploadedFileName(null);
      setSelectedCatalogId("");

      // Mark form as initialized after setting default values
      setHasFormBeenInitialized(true);
    }
  }, [initialData, hasFormBeenInitialized]);
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

            // After generation success, if this was a NEW datasheet (no editingProductId),
            // navigate to its dedicated edit page so the form is loaded with persisted data.
            if (!editingProductId) {
              router.replace(`/dashboard/generator/${savedProductId}`);
            }
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
  }, [saveState, user, router]); // Add user and router dependencies as they're used inside
  // ----------------------------------------------------------------------

  // --- Handle selectedProduct from sidebar ---
  useEffect(() => {
    if (selectedProduct) {
      handleProductSelect(selectedProduct);
    }
  }, [selectedProduct]);
  // ----------------------------------------

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
                <div className="flex items-center justify-between">
                  <Label htmlFor="description">
                    Description <span className="text-red-500">*</span>
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleEnhanceDescription}
                    disabled={isEnhancingDescription || !description?.trim()}
                    className="h-7 px-2 text-xs"
                  >
                    {isEnhancingDescription ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1 h-3 w-3" />
                    )}
                    {isEnhancingDescription ? "Enhancing..." : "Enhance"}
                  </Button>
                </div>
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
                <div className="flex items-center justify-between">
                  <Label htmlFor="key-features">Key Features</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateFeatures}
                    disabled={
                      isGeneratingFeatures || (!productTitle && !description)
                    }
                    className="h-7 px-2 text-xs"
                  >
                    {isGeneratingFeatures ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="mr-1 h-3 w-3" />
                    )}
                    {isGeneratingFeatures ? "Generating..." : "AI Generate"}
                  </Button>
                </div>
                <Textarea
                  name="keyFeatures"
                  id="key-features"
                  value={keyFeatures}
                  onChange={(e) => {
                    const value = e.target.value;
                    const lineCount = countLines(value);

                    // Allow the change if within limits
                    if (
                      value.length <= KEY_FEATURES_MAX_CHARS &&
                      lineCount <= KEY_FEATURES_MAX_LINES
                    ) {
                      setKeyFeatures(value);
                      return;
                    }

                    // If over limits, try to truncate intelligently
                    let truncatedValue = value;

                    // First, truncate by character count if needed
                    if (value.length > KEY_FEATURES_MAX_CHARS) {
                      truncatedValue = value.substring(
                        0,
                        KEY_FEATURES_MAX_CHARS
                      );
                    }

                    // Then, truncate by line count if needed
                    const lines = truncatedValue.split("\n");
                    const nonEmptyLines = lines.filter(
                      (line) => line.trim().length > 0
                    );

                    if (nonEmptyLines.length > KEY_FEATURES_MAX_LINES) {
                      // Keep only the first N non-empty lines, preserving empty lines in between
                      let keptNonEmptyCount = 0;
                      const truncatedLines = [];

                      for (const line of lines) {
                        if (line.trim().length > 0) {
                          if (keptNonEmptyCount < KEY_FEATURES_MAX_LINES) {
                            truncatedLines.push(line);
                            keptNonEmptyCount++;
                          } else {
                            break;
                          }
                        } else {
                          // Keep empty lines if we haven't reached the limit yet
                          if (keptNonEmptyCount < KEY_FEATURES_MAX_LINES) {
                            truncatedLines.push(line);
                          }
                        }
                      }
                      truncatedValue = truncatedLines.join("\n");
                    }

                    // Set the truncated value
                    setKeyFeatures(truncatedValue);

                    // Show a toast notification if content was truncated
                    if (truncatedValue !== value) {
                      toast.info(
                        "Content was automatically trimmed to fit the character and line limits."
                      );
                    }
                  }}
                  onPaste={(e) => {
                    e.preventDefault();

                    // Get pasted text
                    const pastedText = e.clipboardData.getData("text");
                    if (!pastedText) return;

                    console.log("Raw pasted text:", JSON.stringify(pastedText));

                    // Get current cursor position
                    const textarea = e.target as HTMLTextAreaElement;
                    const cursorStart = textarea.selectionStart;
                    const cursorEnd = textarea.selectionEnd;

                    // Get current value and insert pasted text at cursor
                    const currentValue = keyFeatures;
                    const beforeCursor = currentValue.substring(0, cursorStart);
                    const afterCursor = currentValue.substring(cursorEnd);

                    // Clean and format pasted text to preserve line breaks
                    // Handle different line break styles more aggressively
                    const cleanedPastedText = pastedText
                      .replace(/\r\n/g, "\n") // Convert Windows line breaks
                      .replace(/\r/g, "\n") // Convert Mac line breaks
                      .split("\n") // Split on newlines
                      .map((line) => line.trim()) // Trim whitespace
                      .filter((line) => line.length > 0) // Remove empty lines
                      .join("\n"); // Rejoin with single line breaks

                    console.log(
                      "Cleaned pasted text:",
                      JSON.stringify(cleanedPastedText)
                    );

                    const newValue =
                      beforeCursor + cleanedPastedText + afterCursor;
                    console.log("Final new value:", JSON.stringify(newValue));

                    // Apply the same validation logic as onChange
                    const lineCount = countLines(newValue);
                    console.log("Line count:", lineCount);

                    if (
                      newValue.length <= KEY_FEATURES_MAX_CHARS &&
                      lineCount <= KEY_FEATURES_MAX_LINES
                    ) {
                      console.log("Set features directly (within limits)");
                      setTimeout(() => {
                        setKeyFeatures(newValue);
                      }, 0);
                      return;
                    }

                    // If over limits, truncate intelligently
                    let truncatedValue = newValue;

                    // First, truncate by character count if needed
                    if (newValue.length > KEY_FEATURES_MAX_CHARS) {
                      truncatedValue = newValue.substring(
                        0,
                        KEY_FEATURES_MAX_CHARS
                      );
                    }

                    // Then, truncate by line count if needed
                    const lines = truncatedValue.split("\n");
                    const nonEmptyLines = lines.filter(
                      (line) => line.trim().length > 0
                    );

                    if (nonEmptyLines.length > KEY_FEATURES_MAX_LINES) {
                      // Keep only the first N non-empty lines, preserving line structure
                      let keptNonEmptyCount = 0;
                      const truncatedLines = [];

                      for (const line of lines) {
                        if (line.trim().length > 0) {
                          if (keptNonEmptyCount < KEY_FEATURES_MAX_LINES) {
                            truncatedLines.push(line);
                            keptNonEmptyCount++;
                          } else {
                            break;
                          }
                        } else {
                          // Keep empty lines if we haven't reached the limit yet
                          if (keptNonEmptyCount < KEY_FEATURES_MAX_LINES) {
                            truncatedLines.push(line);
                          }
                        }
                      }
                      truncatedValue = truncatedLines.join("\n");
                    }

                    console.log(
                      "Final truncated value:",
                      JSON.stringify(truncatedValue)
                    );

                    // Use setTimeout to ensure state update happens after event processing
                    setTimeout(() => {
                      setKeyFeatures(truncatedValue);

                      // Show notification if content was truncated
                      if (truncatedValue !== newValue) {
                        const originalLines = countLines(newValue);
                        const keptLines = countLines(truncatedValue);
                        toast.info(
                          `Pasted content trimmed: kept ${keptLines} of ${originalLines} lines to fit limits.`
                        );
                      }
                    }, 0);
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
                <div className="flex items-center justify-between">
                  <Label>Technical Specifications</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateSpecs}
                    disabled={
                      isGeneratingSpecs || (!productTitle && !description)
                    }
                    className="h-7 px-2 text-xs"
                  >
                    {isGeneratingSpecs ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Wand2 className="mr-1 h-3 w-3" />
                    )}
                    {isGeneratingSpecs ? "Generating..." : "AI Generate"}
                  </Button>
                </div>
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

                {/* Logo Layout Preview */}
                <div className="mt-4 p-3 bg-muted/50 rounded-md border">
                  <Label className="text-sm font-medium text-muted-foreground mb-2 block">
                    Logo Layout Preview:
                  </Label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {(() => {
                      const isClientTemplate =
                        !includeIrelandLogo &&
                        ((includeOriginLogo && !includeCeLogo) ||
                          (includeCeLogo && !includeOriginLogo));

                      if (isClientTemplate) {
                        return (
                          <>
                            {includeOriginLogo && (
                              <div className="flex items-center gap-2 px-3 py-2 bg-white border rounded-md shadow-sm">
                                <img
                                  src="/logos/ped-logo.png"
                                  alt="PED Certification"
                                  className="w-6 h-6 object-contain"
                                />
                                <span className="text-xs font-medium text-gray-700">
                                  PED
                                </span>
                              </div>
                            )}
                            {includeCeLogo && (
                              <div className="flex items-center gap-2 px-3 py-2 bg-white border rounded-md shadow-sm">
                                <img
                                  src="/logos/ce-logo.png"
                                  alt="CE Certification"
                                  className="w-6 h-6 object-contain"
                                />
                                <span className="text-xs font-medium text-gray-700">
                                  CE
                                </span>
                              </div>
                            )}
                            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-md">
                              <img
                                src="/logos/applied-genuine-parts.png"
                                alt="Applied Genuine Parts"
                                className="w-6 h-6 object-contain"
                              />
                              <span className="text-xs font-medium text-blue-700">
                                Applied Genuine Parts
                              </span>
                            </div>
                          </>
                        );
                      } else {
                        return (
                          <>
                            {includeOriginLogo && (
                              <div className="flex items-center gap-2 px-3 py-2 bg-white border rounded-md shadow-sm">
                                <img
                                  src="/logos/ped-logo.png"
                                  alt="PED Certification"
                                  className="w-6 h-6 object-contain"
                                />
                                <span className="text-xs font-medium text-gray-700">
                                  PED
                                </span>
                              </div>
                            )}
                            {includeCeLogo && (
                              <div className="flex items-center gap-2 px-3 py-2 bg-white border rounded-md shadow-sm">
                                <img
                                  src="/logos/ce-logo.png"
                                  alt="CE Certification"
                                  className="w-6 h-6 object-contain"
                                />
                                <span className="text-xs font-medium text-gray-700">
                                  CE
                                </span>
                              </div>
                            )}
                            {includeIrelandLogo && (
                              <div className="flex items-center gap-2 px-3 py-2 bg-white border rounded-md shadow-sm">
                                <img
                                  src="/logos/ireland-logo.png"
                                  alt="Designed & Manufactured in Ireland"
                                  className="w-6 h-6 object-contain"
                                />
                                <span className="text-xs font-medium text-gray-700">
                                  Ireland
                                </span>
                              </div>
                            )}
                          </>
                        );
                      }
                    })()}
                    {!includeOriginLogo &&
                      !includeCeLogo &&
                      !includeIrelandLogo && (
                        <div className="text-xs text-muted-foreground italic">
                          No logos selected
                        </div>
                      )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    {(() => {
                      const isClientTemplate =
                        !includeIrelandLogo &&
                        ((includeOriginLogo && !includeCeLogo) ||
                          (includeCeLogo && !includeOriginLogo));

                      if (isClientTemplate) {
                        return "Using client logo layout (Applied Genuine Parts replaces Ireland position)";
                      } else if (
                        includeIrelandLogo ||
                        (includeOriginLogo && includeCeLogo)
                      ) {
                        return "Using standard logo layout";
                      } else if (
                        !includeOriginLogo &&
                        !includeCeLogo &&
                        !includeIrelandLogo
                      ) {
                        return "No certification or origin logos will be displayed";
                      } else {
                        return "Using standard logo layout";
                      }
                    })()}
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

            {/* Section 4: Enhanced Shipping/Packaging Info - Full Width */}
            <div className="space-y-1.5">
              <Label htmlFor="shipping-info">Shipping / Packaging Info</Label>
              <div className="space-y-4">
                {/* Shipping Method Selection */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Shipping Method</Label>
                  <RadioGroup
                    value={shippingMethod}
                    onValueChange={(value: "pallet" | "package") => {
                      setShippingMethod(value);
                      // Populate dummy data when switching to package mode
                      if (
                        value === "package" &&
                        !packageLength &&
                        !packageWidth &&
                        !packageHeight &&
                        !packageWeight
                      ) {
                        setPackageLength("250");
                        setPackageWidth("200");
                        setPackageHeight("150");
                        setPackageWeight("3.5");
                        setPackageDimensionUnit("mm");
                        setPackageWeightUnit("kg");
                      }
                    }}
                    className="flex space-x-6"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="pallet" id="ship-pallet" />
                      <Label
                        htmlFor="ship-pallet"
                        className="font-normal cursor-pointer"
                      >
                        Ship via Pallet
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="package" id="ship-package" />
                      <Label
                        htmlFor="ship-package"
                        className="font-normal cursor-pointer"
                      >
                        Ship via Package
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Conditional UI based on shipping method */}
                {shippingMethod === "pallet" ? (
                  // Pallet shipping configuration (existing)
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Select
                        name="shippingUnitType"
                        value={shippingUnitType}
                        onValueChange={setShippingUnitType}
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unit">unit(s)</SelectItem>
                          <SelectItem value="package">package(s)</SelectItem>
                          <SelectItem value="bag">bag(s)</SelectItem>
                          <SelectItem value="box">box(es)</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="text-sm">per pallet:</span>
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
                  </div>
                ) : (
                  // Package shipping configuration (new)
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">
                      Package Dimensions
                    </Label>
                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <Label
                          htmlFor="pkg-length"
                          className="text-xs text-muted-foreground"
                        >
                          Length
                        </Label>
                        <Input
                          id="pkg-length"
                          type="number"
                          value={packageLength}
                          onChange={(e) => setPackageLength(e.target.value)}
                          placeholder="100"
                        />
                      </div>
                      <div>
                        <Label
                          htmlFor="pkg-width"
                          className="text-xs text-muted-foreground"
                        >
                          Width
                        </Label>
                        <Input
                          id="pkg-width"
                          type="number"
                          value={packageWidth}
                          onChange={(e) => setPackageWidth(e.target.value)}
                          placeholder="50"
                        />
                      </div>
                      <div>
                        <Label
                          htmlFor="pkg-height"
                          className="text-xs text-muted-foreground"
                        >
                          Height
                        </Label>
                        <Input
                          id="pkg-height"
                          type="number"
                          value={packageHeight}
                          onChange={(e) => setPackageHeight(e.target.value)}
                          placeholder="30"
                        />
                      </div>
                      <div>
                        <Label
                          htmlFor="pkg-unit"
                          className="text-xs text-muted-foreground"
                        >
                          Unit
                        </Label>
                        <Select
                          value={packageDimensionUnit}
                          onValueChange={setPackageDimensionUnit}
                        >
                          <SelectTrigger id="pkg-unit">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="mm">mm</SelectItem>
                            <SelectItem value="cm">cm</SelectItem>
                            <SelectItem value="in">in</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label
                          htmlFor="pkg-weight"
                          className="text-xs text-muted-foreground"
                        >
                          Package Weight
                        </Label>
                        <Input
                          id="pkg-weight"
                          type="number"
                          value={packageWeight}
                          onChange={(e) => setPackageWeight(e.target.value)}
                          placeholder="2.5"
                        />
                      </div>
                      <div>
                        <Label
                          htmlFor="pkg-weight-unit"
                          className="text-xs text-muted-foreground"
                        >
                          Unit
                        </Label>
                        <Select
                          value={packageWeightUnit}
                          onValueChange={setPackageWeightUnit}
                        >
                          <SelectTrigger id="pkg-weight-unit">
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
                    </div>
                  </div>
                )}

                {/* Generated text preview and custom text option */}
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="custom-shipping"
                      checked={useCustomShippingText}
                      onCheckedChange={(checked) => {
                        setUseCustomShippingText(Boolean(checked));
                        if (!checked) {
                          setCustomShippingText("");
                        } else {
                          setCustomShippingText(generateShippingText());
                        }
                      }}
                    />
                    <Label
                      htmlFor="custom-shipping"
                      className="text-sm font-medium cursor-pointer"
                    >
                      Customize shipping text
                    </Label>
                  </div>

                  {useCustomShippingText ? (
                    <Textarea
                      value={customShippingText}
                      onChange={(e) => setCustomShippingText(e.target.value)}
                      placeholder="Enter custom shipping information..."
                      rows={3}
                    />
                  ) : (
                    <div className="bg-muted p-3 rounded-md border">
                      <Label className="text-sm font-medium text-muted-foreground">
                        Preview:
                      </Label>
                      <p className="text-sm mt-1">{generateShippingText()}</p>
                    </div>
                  )}
                </div>

                {/* Hidden inputs for form submission */}
                <input
                  type="hidden"
                  name="shippingInfo"
                  value={JSON.stringify({
                    method: shippingMethod,
                    ...(shippingMethod === "pallet"
                      ? {
                          units: shippingUnits,
                          unitType: shippingUnitType,
                        }
                      : {
                          length: packageLength,
                          width: packageWidth,
                          height: packageHeight,
                          weight: packageWeight,
                          dimensionUnit: packageDimensionUnit,
                          weightUnit: packageWeightUnit,
                        }),
                    ...(useCustomShippingText
                      ? { customText: customShippingText }
                      : {}),
                  })}
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
                isEnhancingDescription || // Disable while enhancing description
                uploadProps.loading // Disable while uploading image
              }
            >
              {isSavePending ||
              isGeneratingPdf ||
              isDownloadingPdf ||
              isEnhancingDescription ? (
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
                : isEnhancingDescription
                ? "Enhancing Text..."
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
