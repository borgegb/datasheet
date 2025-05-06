"use client"; // Needs to be client component for interactions

import React, {
  useState,
  useEffect,
  startTransition,
  useCallback,
} from "react";
import { Button } from "@/components/ui/button";
import { PlusCircle, Loader2, PackageIcon } from "lucide-react";
// Import Dialog components, Input, Label
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose, // Import DialogClose
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
// Import Server Actions
import { fetchCatalogsForOrg, createCatalog } from "../actions";

// --- Add Card and Link imports ---
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import Image from "next/image"; // Import Next Image
import { createClient } from "@/lib/supabase/client"; // For client-side user fetching
import type { User } from "@supabase/supabase-js";
import {
  Dropzone,
  DropzoneContent,
  DropzoneEmptyState,
} from "@/components/dropzone";
import { useSupabaseUpload } from "@/hooks/use-supabase-upload";
// --------------------------------

// --- Define Catalog interface locally ---
interface Catalog {
  id: string;
  name: string;
  image_path: string | null; // Keep original path if needed elsewhere, though maybe not
  signedImageUrl?: string | null; // Expect signed URL from action
}

// Add Profile type for state
interface Profile {
  role: string | null;
  organization_id: string | null;
}
// --------------------------------------

export default function CatalogsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newCatalogName, setNewCatalogName] = useState("");
  const [uploadedImagePath, setUploadedImagePath] = useState<string | null>(
    null
  );
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [isLoadingCatalogs, setIsLoadingCatalogs] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null); // State for profile
  const [isLoadingProfile, setIsLoadingProfile] = useState(true); // For profile loading state

  // Fetch user and their profile on component mount
  useEffect(() => {
    const supabase = createClient();
    const fetchUserAndProfile = async () => {
      setIsLoadingProfile(true);
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        setUser(userData.user);
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("role, organization_id")
          .eq("id", userData.user.id)
          .single();
        if (profileError) {
          console.error("Error fetching profile:", profileError);
          toast.error("Could not load user profile.");
          setProfile(null);
        } else {
          setProfile(profileData);
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      setIsLoadingProfile(false);
    };
    fetchUserAndProfile();
  }, []);

  const uploadProps = useSupabaseUpload({
    bucketName: "datasheet-assets",
    // Use organization_id for the path if available
    path: profile?.organization_id
      ? `organizations/${profile.organization_id}/catalog_images/`
      : undefined,
    allowedMimeTypes: ["image/*"],
    maxFiles: 1,
  });

  // useEffect to handle upload completion (uses profile.organization_id in path)
  useEffect(() => {
    if (!uploadProps.loading && profile?.organization_id) {
      if (uploadProps.successes.length > 0) {
        const successFileName =
          uploadProps.successes[uploadProps.successes.length - 1];
        if (successFileName !== uploadedFileName) {
          setUploadedFileName(successFileName);
          // Construct path using organization_id
          const fullPath = `organizations/${profile.organization_id}/catalog_images/${successFileName}`;
          setUploadedImagePath(fullPath);
          console.log("Catalog image uploaded, path stored:", fullPath);
          toast.success(`Image "${successFileName}" uploaded successfully.`);
        }
      } else if (uploadProps.errors.length > 0) {
        const lastError = uploadProps.errors[uploadProps.errors.length - 1];
        if (uploadProps.files.find((f) => f.name === lastError.name)) {
          toast.error(
            `Image upload failed for ${lastError.name}: ${
              lastError.message || "Please try again."
            }
             `
          );
        }
      }
    }
  }, [
    uploadProps.loading,
    uploadProps.successes,
    uploadProps.errors,
    profile,
    uploadedFileName,
    uploadProps.files,
  ]);

  // Function to load catalogs
  const loadCatalogs = useCallback(() => {
    // useCallback to prevent re-creation if passed as prop later
    setIsLoadingCatalogs(true);
    startTransition(async () => {
      const { data, error } = await fetchCatalogsForOrg();
      if (error) {
        console.error("Error fetching catalogs via action:", error);
        toast.error(`Failed to fetch catalogs: ${error.message}`);
        setCatalogs([]);
      } else {
        setCatalogs(data || []);
      }
      setIsLoadingCatalogs(false);
    });
  }, []);

  useEffect(() => {
    loadCatalogs();
  }, [loadCatalogs]);

  const handleCreateCatalog = async () => {
    if (!newCatalogName.trim()) {
      toast.warning("Please enter a catalog name.");
      return;
    }
    setIsCreating(true);
    startTransition(async () => {
      const { data, error } = await createCatalog(
        newCatalogName.trim(),
        uploadedImagePath
      );
      if (error) {
        console.error("Error creating catalog via action:", error);
        toast.error(`Failed to create catalog: ${error.message}`);
      } else {
        toast.success(`Catalog "${newCatalogName.trim()}" created!`);
        setNewCatalogName("");
        setUploadedImagePath(null);
        setUploadedFileName(null);
        uploadProps.setFiles([]);
        setIsDialogOpen(false);
        loadCatalogs();
      }
      setIsCreating(false);
    });
  };

  // Reset form state when dialog is closed
  useEffect(() => {
    if (!isDialogOpen) {
      setNewCatalogName("");
      setUploadedImagePath(null);
      setUploadedFileName(null);
      if (uploadProps.files.length > 0) {
        // Only call setFiles if there are files to clear
        uploadProps.setFiles([]);
      }
      // It might also be useful to clear errors from the hook if they persist
      // if (uploadProps.errors.length > 0) {
      //   uploadProps.setErrors([]);
      // }
    }
  }, [
    isDialogOpen,
    uploadProps.setFiles,
    uploadProps.files,
    uploadProps.errors,
  ]); // More specific dependencies

  return (
    <div className="flex flex-col flex-1 p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Manage Catalogs</h1>

        {/* Conditionally render Create button for owners & when profile loaded */}
        {!isLoadingProfile && profile?.role === "owner" && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              {/* Disable button if org_id not available for path generation */}
              <Button disabled={!profile?.organization_id}>
                <PlusCircle className="mr-2 h-4 w-4" /> Create New Catalog
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Catalog</DialogTitle>
                <DialogDescription>
                  Enter a name and optionally upload an image for your new
                  catalog.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-1.5">
                  <Label htmlFor="catalog-name">Name</Label>
                  <Input
                    id="catalog-name"
                    value={newCatalogName}
                    onChange={(e) => setNewCatalogName(e.target.value)}
                    placeholder="e.g., 2025 Products"
                    disabled={
                      isCreating ||
                      uploadProps.loading ||
                      !profile?.organization_id
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="catalog-image">Image (Optional)</Label>
                  {profile?.organization_id ? (
                    <Dropzone {...uploadProps} className="mt-1 border-border">
                      <DropzoneEmptyState />
                      <DropzoneContent />
                    </Dropzone>
                  ) : (
                    <div className="mt-1 flex items-center justify-center h-32 border-2 border-dashed border-gray-300 rounded-lg bg-muted">
                      <p className="text-sm text-muted-foreground">
                        Organization details loading or not available for
                        upload.
                      </p>
                    </div>
                  )}
                  {uploadedFileName && !uploadProps.loading && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Selected: "{uploadedFileName}"
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button
                    variant="outline"
                    disabled={isCreating || uploadProps.loading}
                  >
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  onClick={handleCreateCatalog}
                  disabled={
                    isCreating ||
                    uploadProps.loading ||
                    !profile?.organization_id ||
                    (!newCatalogName.trim() && !uploadedImagePath)
                  }
                >
                  {isCreating || (uploadProps.loading && !uploadedImagePath) ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {isCreating
                    ? "Creating..."
                    : uploadProps.loading && !uploadedImagePath
                    ? "Uploading..."
                    : "Create Catalog"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Display Catalogs as Cards */}
      <div className="mt-6">
        <h2 className="text-lg font-medium mb-4">Existing Catalogs</h2>
        {isLoadingCatalogs || isLoadingProfile ? (
          <div className="flex justify-center items-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : catalogs.length === 0 ? (
          <p className="text-muted-foreground">No catalogs created yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {catalogs.map((catalog) => (
              <Link
                key={catalog.id}
                href={`/dashboard/catalogs/${catalog.id}`}
                passHref
                className="block h-full group"
              >
                <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full flex flex-col overflow-hidden border group-hover:border-primary">
                  <div className="aspect-[16/10] w-full bg-muted relative overflow-hidden">
                    {catalog.signedImageUrl ? (
                      <Image
                        src={catalog.signedImageUrl}
                        alt={catalog.name}
                        layout="fill"
                        objectFit="cover"
                        className="transition-transform duration-300 group-hover:scale-105"
                        unoptimized
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground/50">
                        <PackageIcon className="h-16 w-16" />
                      </div>
                    )}
                  </div>
                  <CardHeader className="p-4">
                    <CardTitle className="text-md font-medium truncate group-hover:text-primary">
                      {catalog.name}
                    </CardTitle>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
