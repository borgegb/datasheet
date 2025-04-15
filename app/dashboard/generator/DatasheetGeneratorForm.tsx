"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Loader2, Download } from "lucide-react";

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

// Define props if needed in the future (e.g., initial data for editing)
// interface DatasheetGeneratorFormProps {}

export default function DatasheetGeneratorForm(/* props: DatasheetGeneratorFormProps */) {
  // State for form fields
  const [productTitle, setProductTitle] = useState("");
  const [productCode, setProductCode] = useState("");
  const [description, setDescription] = useState("");
  const [techSpecs, setTechSpecs] = useState("");
  const [price, setPrice] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedImagePath, setUploadedImagePath] = useState<string | null>(
    null
  );

  // Generation/Download state
  const [isGenerating, setIsGenerating] = useState(false);
  const [pdfDownloadUrl, setPdfDownloadUrl] = useState<string | null>(null);
  const [wordDownloadUrl, setWordDownloadUrl] = useState<string | null>(null);

  // Fetch user session on component mount
  useEffect(() => {
    const fetchUser = async () => {
      const supabase = createClient();
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.error("Error fetching user:", error);
      } else {
        setUser(data.user);
      }
    };
    fetchUser();
  }, []);

  // Determine path based on user state
  const uploadPathPrefix = user ? `${user.id}/images/` : undefined;

  // Configure the upload hook
  const uploadProps = useSupabaseUpload({
    bucketName: "datasheet-assets",
    path: uploadPathPrefix,
    allowedMimeTypes: ["image/*"],
    maxFiles: 1,
  });

  useEffect(() => {
    if (
      !uploadProps.loading &&
      uploadProps.successes.length > 0 &&
      uploadPathPrefix
    ) {
      const lastSuccessFileName =
        uploadProps.successes[uploadProps.successes.length - 1];
      console.log("Upload success, filename stored:", lastSuccessFileName);
      setUploadedFileName(lastSuccessFileName);
      // Construct and store the full path
      const fullPath = `${uploadPathPrefix}${lastSuccessFileName}`;
      setUploadedImagePath(fullPath);
      console.log("Stored image path:", fullPath);
      // uploadProps.setSuccesses([]);
    }
  }, [uploadProps.loading, uploadProps.successes, uploadPathPrefix]);

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

  // Function to get a safe filename
  const getSafeFilename = (name: string, extension: string) => {
    const safeName =
      name.replace(/[^a-z0-9]/gi, "_").toLowerCase() || "datasheet";
    return `${safeName}.${extension}`;
  };

  return (
    <Card className="w-full max-w-3xl mx-auto">
      {" "}
      {/* Center form with max-width */}
      <CardHeader>
        <CardTitle className="text-2xl">Create New Datasheet</CardTitle>
        <CardDescription>
          Enter the product details below to generate a datasheet.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-6">
            {/* Product Title */}
            <div className="col-span-full sm:col-span-3">
              <Label htmlFor="product-title">
                Product Title <span className="text-red-500">*</span>
              </Label>
              <Input
                type="text"
                id="product-title"
                value={productTitle}
                onChange={(e) => setProductTitle(e.target.value)}
                placeholder="e.g., Super Widget Model X"
                className="mt-1"
                required
              />
            </div>

            {/* Product Code */}
            <div className="col-span-full sm:col-span-3">
              <Label htmlFor="product-code">
                Product Code <span className="text-red-500">*</span>
              </Label>
              <Input
                type="text"
                id="product-code"
                value={productCode}
                onChange={(e) => setProductCode(e.target.value)}
                placeholder="e.g., SW-MDLX-001"
                className="mt-1"
                required
              />
            </div>

            {/* Price */}
            <div className="col-span-full sm:col-span-3">
              <Label htmlFor="price">Price</Label>
              <Input
                type="text" // Use text for flexibility (e.g., $99.99, €100)
                id="price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="e.g., $99.99"
                className="mt-1"
              />
            </div>

            {/* Description */}
            <div className="col-span-full">
              <Label htmlFor="description">
                Description <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the product..."
                className="mt-1"
                rows={4}
                required
              />
            </div>

            {/* Image Upload Dropzone */}
            <div className="col-span-full">
              <Label htmlFor="product-image">Product Image</Label>
              {uploadPathPrefix ? (
                <Dropzone {...uploadProps} className="mt-1">
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

            {/* Technical Specifications */}
            <div className="col-span-full">
              <Label htmlFor="tech-specs">Technical Specifications</Label>
              <Textarea
                id="tech-specs"
                value={techSpecs}
                onChange={(e) => setTechSpecs(e.target.value)}
                placeholder="Enter specifications (e.g., Dimension: 10x5x2 cm, Weight: 500g)..."
                className="mt-1"
                rows={6}
              />
            </div>
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
                {/* Uncomment when Word generation is added */}
                {/* {wordDownloadUrl && (
                  <Button asChild variant="outline">
                    <a href={wordDownloadUrl} download={getSafeFilename(productCode || productTitle, 'docx')}>
                      <Download className="mr-2 h-4 w-4" />
                      Download Word
                    </a>
                  </Button>
                )} */}
              </div>
            </div>
          )}
        </div>
        <CardFooter className="flex justify-end pt-8 px-0">
          <Button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || uploadProps.loading}
          >
            {isGenerating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {isGenerating ? "Generating..." : "Generate Datasheet"}
          </Button>
        </CardFooter>
      </CardContent>
    </Card>
  );
}
