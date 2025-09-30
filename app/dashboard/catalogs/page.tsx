"use client"; // Needs to be client component for interactions

import React, {
  useState,
  useEffect,
  startTransition,
  useCallback,
} from "react";
import { Button } from "@/components/ui/button";
import {
  PlusCircle,
  Loader2,
  PackageIcon,
  EditIcon,
  TrashIcon,
} from "lucide-react";
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
import {
  fetchCatalogsForOrg,
  createCatalog,
  updateCatalog,
  deleteCatalog,
  updateCatalogOrder,
} from "../actions";

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
import { DeleteCatalogDialog } from "@/components/delete-catalog"; // Import the new component

// Import drag and drop components
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// --------------------------------

// --- Define Catalog interface locally ---
interface Catalog {
  id: string;
  name: string;
  image_path: string | null; // Keep original path if needed elsewhere, though maybe not
  signedImageUrl?: string | null; // Expect signed URL from action
  display_order?: number | null; // Add display order for drag and drop
}

// Add Profile type for state
interface Profile {
  role: string | null;
  organization_id: string | null;
}

// --- Sortable Catalog Card Component ---
interface SortableCatalogCardProps {
  catalog: Catalog;
  isOwner: boolean;
  onEdit: (catalog: Catalog) => void;
  onDeleteSuccess: () => void;
  isDragging?: boolean;
  isSavingOrder?: boolean;
}

function SortableCatalogCard({
  catalog,
  isOwner,
  onEdit,
  onDeleteSuccess,
  isDragging,
  isSavingOrder,
}: SortableCatalogCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: catalog.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging || isSortableDragging ? 0.5 : 1,
    cursor:
      isOwner && !isSavingOrder
        ? isDragging || isSortableDragging
          ? "grabbing"
          : "grab"
        : "pointer",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative group"
      {...(isOwner && !isSavingOrder ? { ...attributes, ...listeners } : {})}
    >
      <Link
        href={`/dashboard/catalogs/${catalog.id}`}
        passHref
        className="block h-full"
        onClick={(e) => {
          // Prevent navigation while dragging
          if (isDragging || isSortableDragging) {
            e.preventDefault();
          }
        }}
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
      {/* --- Add Edit/Delete Buttons for Owners --- */}
      {isOwner && (
        <div className="absolute top-2 right-2 flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <Button
            variant="secondary"
            size="icon"
            className="h-7 w-7 rounded-full shadow-md bg-background/80 backdrop-blur-sm hover:bg-background"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(catalog);
            }}
            title="Edit Catalog"
          >
            <EditIcon className="h-3.5 w-3.5" />
          </Button>
          <DeleteCatalogDialog
            catalogId={catalog.id}
            catalogName={catalog.name}
            onDeleteSuccess={onDeleteSuccess}
            triggerButton={
              <Button
                variant="secondary"
                size="icon"
                className="h-7 w-7 rounded-full shadow-md bg-background/80 backdrop-blur-sm text-destructive hover:bg-destructive/10 hover:text-destructive"
                title="Delete Catalog"
                onClick={(e) => e.stopPropagation()}
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </Button>
            }
          />
        </div>
      )}
      {/* --- End Edit/Delete Buttons --- */}
    </div>
  );
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
  const [activeId, setActiveId] = useState<string | null>(null); // For drag overlay
  const [isSavingOrder, setIsSavingOrder] = useState(false); // For saving order state

  // --- State for Edit Catalog Dialog ---
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingCatalog, setEditingCatalog] = useState<Catalog | null>(null);
  const [editCatalogName, setEditCatalogName] = useState("");
  const [editUploadedImagePath, setEditUploadedImagePath] = useState<
    string | null
  >(null);
  const [editUploadedFileName, setEditUploadedFileName] = useState<
    string | null
  >(null);
  const [isUpdating, setIsUpdating] = useState(false); // Separate state for update pending
  // ------------------------------------

  // --- Drag and Drop Sensors ---
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Prevents accidental drags
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  // -----------------------------

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

  // --- Upload Hooks (Need one for Create and one for Edit) ---
  const createUploadProps = useSupabaseUpload({
    bucketName: "datasheet-assets",
    path: profile?.organization_id
      ? `organizations/${profile.organization_id}/catalog_images/`
      : undefined,
    allowedMimeTypes: ["image/*"],
    maxFiles: 1,
  });
  const editUploadProps = useSupabaseUpload({
    bucketName: "datasheet-assets",
    path: profile?.organization_id
      ? `organizations/${profile.organization_id}/catalog_images/`
      : undefined,
    allowedMimeTypes: ["image/*"],
    maxFiles: 1,
  });
  // --- End Upload Hooks ---

  // --- useEffect to handle Create upload completion ---
  useEffect(() => {
    if (!createUploadProps.loading && profile?.organization_id) {
      if (createUploadProps.successes.length > 0) {
        const successFileName =
          createUploadProps.successes[createUploadProps.successes.length - 1];
        if (successFileName !== uploadedFileName) {
          setUploadedFileName(successFileName);
          const fullPath = `organizations/${profile.organization_id}/catalog_images/${successFileName}`;
          setUploadedImagePath(fullPath);
          console.log(
            "(Create) Catalog image uploaded, path stored:",
            fullPath
          );
          toast.success(
            `Image "${successFileName}" ready for catalog creation.`
          );
        }
      } else if (createUploadProps.errors.length > 0) {
        const lastError =
          createUploadProps.errors[createUploadProps.errors.length - 1];
        if (createUploadProps.files.find((f) => f.name === lastError.name)) {
          toast.error(
            `Create: Image upload failed - ${
              lastError.message || "Please try again."
            }`
          );
        }
      }
    }
    // Depend on createUploadProps properties
  }, [
    createUploadProps.loading,
    createUploadProps.successes,
    createUploadProps.errors,
    profile,
    uploadedFileName,
    createUploadProps.files,
  ]);
  // --- End Create upload handler ---

  // --- useEffect to handle Edit upload completion ---
  useEffect(() => {
    if (!editUploadProps.loading && profile?.organization_id) {
      if (editUploadProps.successes.length > 0) {
        const successFileName =
          editUploadProps.successes[editUploadProps.successes.length - 1];
        // Update edit state directly
        if (successFileName !== editUploadedFileName) {
          setEditUploadedFileName(successFileName);
          const fullPath = `organizations/${profile.organization_id}/catalog_images/${successFileName}`;
          setEditUploadedImagePath(fullPath);
          console.log("(Edit) Catalog image uploaded, path stored:", fullPath);
          toast.success(`Image "${successFileName}" ready for catalog update.`);
        }
      } else if (editUploadProps.errors.length > 0) {
        const lastError =
          editUploadProps.errors[editUploadProps.errors.length - 1];
        if (editUploadProps.files.find((f) => f.name === lastError.name)) {
          toast.error(
            `Edit: Image upload failed - ${
              lastError.message || "Please try again."
            }`
          );
        }
      }
    }
    // Depend on editUploadProps properties
  }, [
    editUploadProps.loading,
    editUploadProps.successes,
    editUploadProps.errors,
    profile,
    editUploadedFileName,
    editUploadProps.files,
  ]);
  // --- End Edit upload handler ---

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

  // --- Drag and Drop Event Handlers ---
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) {
      return;
    }

    // Prevent concurrent saves
    if (isSavingOrder) {
      return;
    }

    // Only allow owners to reorder
    if (profile?.role !== "owner") {
      toast.error("Only organization owners can reorder catalogs.");
      return;
    }

    // Reorder catalogs locally first for immediate feedback
    setCatalogs((items) => {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      const newOrder = arrayMove(items, oldIndex, newIndex);

      // Save the new order to the server
      saveNewOrder(newOrder);

      return newOrder;
    });
  };

  const saveNewOrder = async (orderedCatalogs: Catalog[]) => {
    setIsSavingOrder(true);
    const catalogOrders = orderedCatalogs.map((catalog, index) => ({
      id: catalog.id,
      display_order: index + 1,
    }));

    startTransition(async () => {
      const { error } = await updateCatalogOrder(catalogOrders);
      if (error) {
        toast.error(`Failed to save catalog order: ${error.message}`);
        // Reload catalogs to restore original order
        loadCatalogs();
      } else {
        toast.success("Catalog order updated successfully!");
      }
      setIsSavingOrder(false);
    });
  };
  // ------------------------------------

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
        createUploadProps.setFiles([]);
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
      if (createUploadProps.files.length > 0) {
        // Only call setFiles if there are files to clear
        createUploadProps.setFiles([]);
      }
      // It might also be useful to clear errors from the hook if they persist
      // if (createUploadProps.errors.length > 0) {
      //   createUploadProps.setErrors([]);
      // }
    }
  }, [
    isDialogOpen,
    createUploadProps.setFiles,
    createUploadProps.files,
    createUploadProps.errors,
  ]); // More specific dependencies

  // --- handleUpdateCatalog (uses editUploadProps) ---
  const handleUpdateCatalog = async () => {
    if (!editingCatalog) {
      toast.error("No catalog selected for editing.");
      return;
    }
    if (!editCatalogName.trim()) {
      toast.warning("Catalog name cannot be empty.");
      return;
    }
    setIsUpdating(true);
    // Pass the editUploadedImagePath. If it's null, the action retains the old path.
    // If it's explicitly set to null (e.g., by a remove image button), pass undefined or handle in action.
    // For now, we assume editUploadedImagePath holds the *new* path or null if no *new* image was uploaded.
    const imagePathToUpdate = editUploadedImagePath; // Path from edit upload

    startTransition(async () => {
      const { data, error } = await updateCatalog(
        editingCatalog.id,
        editCatalogName.trim(),
        imagePathToUpdate
      );
      if (error) {
        console.error("Error updating catalog via action:", error);
        toast.error(`Failed to update catalog: ${error.message}`);
      } else {
        toast.success(`Catalog "${editCatalogName.trim()}" updated!`);
        setIsEditDialogOpen(false); // Close dialog
        setEditingCatalog(null); // Clear editing state
        loadCatalogs(); // Reload catalogs
      }
      setIsUpdating(false);
    });
  };
  // --- End handleUpdateCatalog ---

  // --- handleDeleteCatalog ---
  const handleDeleteCatalog = async (
    catalogId: string,
    catalogName: string
  ) => {
    const deleteToastId = toast.loading(`Deleting catalog "${catalogName}"...`);
    startTransition(async () => {
      const result = await deleteCatalog(catalogId);
      toast.dismiss(deleteToastId);
      if (result.error) {
        toast.error(
          `Failed to delete catalog "${catalogName}": ${result.error.message}`
        );
      } else {
        toast.success(`Catalog "${catalogName}" deleted successfully!`);
        loadCatalogs(); // Reload catalogs
      }
    });
  };
  // --- End handleDeleteCatalog ---

  // --- useEffect for Dialog Closing Resets ---
  useEffect(() => {
    if (!isDialogOpen) {
      // Reset Create Dialog state
      setNewCatalogName("");
      setUploadedImagePath(null);
      setUploadedFileName(null);
      if (createUploadProps.files.length > 0) createUploadProps.setFiles([]);
    }
  }, [isDialogOpen, createUploadProps.files, createUploadProps.setFiles]);

  useEffect(() => {
    if (!isEditDialogOpen) {
      // Reset Edit Dialog state
      setEditingCatalog(null);
      setEditCatalogName("");
      setEditUploadedImagePath(null);
      setEditUploadedFileName(null);
      if (editUploadProps.files.length > 0) editUploadProps.setFiles([]);
    }
  }, [isEditDialogOpen, editUploadProps.files, editUploadProps.setFiles]);
  // --- End Dialog Closing Resets ---

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
                      createUploadProps.loading ||
                      !profile?.organization_id
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="catalog-image">Image (Optional)</Label>
                  {profile?.organization_id ? (
                    <Dropzone
                      {...createUploadProps}
                      className="mt-1 border-border"
                    >
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
                  {uploadedFileName && !createUploadProps.loading && (
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
                    disabled={isCreating || createUploadProps.loading}
                  >
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  onClick={handleCreateCatalog}
                  disabled={
                    isCreating ||
                    createUploadProps.loading ||
                    !profile?.organization_id ||
                    (!newCatalogName.trim() && !uploadedImagePath)
                  }
                >
                  {isCreating ||
                  (createUploadProps.loading && !uploadedImagePath) ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {isCreating
                    ? "Creating..."
                    : createUploadProps.loading && !uploadedImagePath
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">Existing Catalogs</h2>
          {isSavingOrder && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving order...
            </div>
          )}
        </div>
        {isLoadingCatalogs || isLoadingProfile ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <Card key={i} className="overflow-hidden">
                  <div className="aspect-[16/10] w-full bg-muted">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground m-4" />
                  </div>
                  <CardHeader className="p-4">
                    <CardTitle className="text-md font-medium">
                      <div className="h-4 w-2/3 bg-muted rounded" />
                    </CardTitle>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        ) : catalogs.length === 0 ? (
          <p className="text-muted-foreground">No catalogs created yet.</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={catalogs.map((c) => c.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {catalogs.map((catalog) => (
                  <SortableCatalogCard
                    key={catalog.id}
                    catalog={catalog}
                    isOwner={!isLoadingProfile && profile?.role === "owner"}
                    onEdit={(catalog) => {
                      setEditingCatalog(catalog);
                      setEditCatalogName(catalog.name);
                      setEditUploadedImagePath(null);
                      setEditUploadedFileName(null);
                      editUploadProps.setFiles([]);
                      setIsEditDialogOpen(true);
                    }}
                    onDeleteSuccess={loadCatalogs}
                    isDragging={activeId === catalog.id}
                    isSavingOrder={isSavingOrder}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay>
              {activeId ? (
                <div className="cursor-grabbing opacity-80">
                  {(() => {
                    const catalog = catalogs.find((c) => c.id === activeId);
                    if (!catalog) return null;
                    return (
                      <Card className="shadow-2xl h-full flex flex-col overflow-hidden border">
                        <div className="aspect-[16/10] w-full bg-muted relative overflow-hidden">
                          {catalog.signedImageUrl ? (
                            <Image
                              src={catalog.signedImageUrl}
                              alt={catalog.name}
                              fill
                              className="object-cover"
                              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                            />
                          ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground/50">
                              <PackageIcon className="h-16 w-16" />
                            </div>
                          )}
                        </div>
                        <CardHeader className="p-4">
                          <CardTitle className="text-md font-medium truncate">
                            {catalog.name}
                          </CardTitle>
                        </CardHeader>
                      </Card>
                    );
                  })()}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* --- Edit Catalog Dialog --- */}
      {editingCatalog && (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Catalog</DialogTitle>
              <DialogDescription>
                Update the name and optionally the image for "
                <strong>{editingCatalog.name}</strong>".
              </DialogDescription>
            </DialogHeader>
            {/* Using simple handler, not action state for simplicity here */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleUpdateCatalog();
              }}
            >
              <div className="grid gap-4 py-4">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-catalog-name">Name</Label>
                  <Input
                    id="edit-catalog-name"
                    value={editCatalogName}
                    onChange={(e) => setEditCatalogName(e.target.value)}
                    disabled={isUpdating || editUploadProps.loading}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Image</Label>
                  {/* Display current image (optional) */}
                  {editingCatalog.signedImageUrl && !editUploadedImagePath && (
                    <div className="text-xs text-muted-foreground mb-2">
                      Current image set. Upload a new one to replace it.
                    </div>
                  )}
                  {/* Dropzone for new image */}
                  {profile?.organization_id ? (
                    <Dropzone
                      {...editUploadProps}
                      className="mt-1 border-border"
                    >
                      <DropzoneEmptyState />
                      <DropzoneContent />
                    </Dropzone>
                  ) : (
                    <div>Org details missing</div>
                  )}
                  {editUploadedFileName && !editUploadProps.loading && (
                    <div className="mt-2 text-xs text-green-600">
                      New image selected: "{editUploadedFileName}"
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button
                    variant="outline"
                    disabled={isUpdating || editUploadProps.loading}
                  >
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  disabled={
                    isUpdating ||
                    editUploadProps.loading ||
                    !editCatalogName.trim()
                  }
                >
                  {isUpdating ||
                  (editUploadProps.loading && !editUploadedImagePath) ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {isUpdating
                    ? "Saving..."
                    : editUploadProps.loading && !editUploadedImagePath
                    ? "Uploading..."
                    : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
      {/* --- End Edit Catalog Dialog --- */}
    </div>
  );
}
