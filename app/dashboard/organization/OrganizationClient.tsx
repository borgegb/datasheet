"use client";

import React, { useState, useActionState, useEffect } from "react";
import { OrgMember, columns } from "./columns";
import ProductsDataTable from "@/components/ProductsDataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import CertificationSettingsForm from "./CertificationSettingsForm";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  inviteUserToOrg,
  createCategory,
  updateCategory,
  deleteCategory,
  createVariantColumn,
  updateVariantColumn,
  archiveVariantColumn,
  restoreVariantColumn,
} from "../actions";
import type { OrganizationVariantColumn } from "../actions";
import type { CertificationSettings } from "@/lib/certifications/settings";
import { toast } from "sonner";
import {
  Mail,
  Loader2,
  PlusCircle,
  EditIcon,
  TrashIcon,
  ArchiveIcon,
  RotateCcw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

// Define Category type if not already imported
interface Category {
  id: string;
  name: string;
}

interface OrganizationClientProps {
  userRole: string | null;
  initialMembers: OrgMember[];
  initialCategories: Category[]; // Add new prop
  initialVariantColumns: OrganizationVariantColumn[];
  initialCertificationSettings: CertificationSettings;
  errorMsg?: string;
  categoriesErrorMsg?: string; // Add new prop
  variantColumnsErrorMsg?: string;
  certificationSettingsErrorMsg?: string;
}

export default function OrganizationClient({
  userRole,
  initialMembers,
  initialCategories, // Destructure new prop
  initialVariantColumns,
  initialCertificationSettings,
  errorMsg,
  categoriesErrorMsg, // Destructure new prop
  variantColumnsErrorMsg,
  certificationSettingsErrorMsg,
}: OrganizationClientProps) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member"); // State for selected role
  const [newCategoryName, setNewCategoryName] = useState(""); // State for new category name
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [newVariantColumnName, setNewVariantColumnName] = useState("");
  const [isVariantColumnDialogOpen, setIsVariantColumnDialogOpen] =
    useState(false);
  
  // State for current user info
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Fetch current user
  useEffect(() => {
    const fetchCurrentUser = async () => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        setCurrentUser(userData.user);
      }
    };
    
    fetchCurrentUser();
  }, []);

  // --- State for Edit Category Dialog ---
  const [isCategoryEditDialogOpen, setIsCategoryEditDialogOpen] =
    useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editCategoryName, setEditCategoryName] = useState("");
  const [isVariantColumnEditDialogOpen, setIsVariantColumnEditDialogOpen] =
    useState(false);
  const [editingVariantColumn, setEditingVariantColumn] =
    useState<OrganizationVariantColumn | null>(null);
  const [editVariantColumnName, setEditVariantColumnName] = useState("");
  // -------------------------------------

  // Use useActionState for the invite form
  const [inviteState, submitInvite, isInvitePending] = useActionState(
    async (
      previousState: { error: string | null } | null,
      formData: FormData
    ) => {
      const email = formData.get("email") as string;
      const role = formData.get("role") as string;
      if (!email) {
        return { error: "Email is required." };
      }
      if (!role || !["member", "viewer"].includes(role)) {
        return { error: "Valid role is required." };
      }
      const result = await inviteUserToOrg(email, role);
      if (result.error) {
        toast.error(`Invite failed: ${result.error.message}`);
        return { error: result.error.message };
      } else {
        toast.success(`Invitation sent successfully to ${email} as ${role}!`);
        setInviteEmail(""); // Clear input on success
        setInviteRole("member"); // Reset role to default
        // Potentially re-fetch members or rely on page refresh/revalidation if invite changes member list immediately
        return { error: null };
      }
    },
    null // Initial state
  );

  // --- useActionState for Create Category form ---
  const [, submitCreateCategory, isCategoryCreatePending] =
    useActionState(
      async (
        prevState: { error: string | null } | null,
        formData: FormData
      ) => {
        const categoryName = formData.get("categoryName") as string;
        if (!categoryName.trim()) {
          // Basic client-side check, though action does it too
          toast.warning("Category name cannot be empty.");
          return { error: "Category name is required." };
        }

        const { error } = await createCategory(categoryName.trim());
        if (error) {
          toast.error(`Failed to create category: ${error.message}`);
          return { error: error.message };
        } else {
          toast.success(`Category "${categoryName.trim()}" created!`);
          setNewCategoryName("");
          setIsCategoryDialogOpen(false);
          // Server action should revalidatePath, so UI *should* update.
          return { error: null };
        }
      },
      null
    );
  // --- End Create Category Action State ---

  // --- useActionState for Update Category form ---
  const [, submitUpdateCategory, isCategoryUpdatePending] =
    useActionState(
      async (
        prevState: { error: string | null } | null,
        formData: FormData
      ) => {
        const name = formData.get("editCategoryName") as string;
        if (!editingCategory) {
          toast.error("No category selected for editing.");
          return { error: "No category selected." };
        }
        if (!name || !name.trim()) {
          toast.warning("Category name cannot be empty.");
          return { error: "Category name is required." };
        }

        const result = await updateCategory(editingCategory.id, name.trim());
        if (result.error) {
          toast.error(`Failed to update category: ${result.error.message}`);
          return { error: result.error.message };
        } else {
          toast.success(`Category "${name.trim()}" updated!`);
          setIsCategoryEditDialogOpen(false);
          setEditingCategory(null); // Clear editing state
          // Path revalidation by server action should refresh the list
          return { error: null };
        }
      },
      null
    );
  // --- End Update Category Action State ---

  const [
    variantColumnCreateState,
    submitCreateVariantColumn,
    isVariantColumnCreatePending,
  ] = useActionState(
    async (
      prevState: { error: string | null } | null,
      formData: FormData
    ) => {
      const columnName = formData.get("variantColumnName") as string;
      if (!columnName.trim()) {
        toast.warning("Variant column name cannot be empty.");
        return { error: "Variant column name is required." };
      }

      const { error } = await createVariantColumn(columnName.trim());
      if (error) {
        toast.error(`Failed to create variant column: ${error.message}`);
        return { error: error.message };
      }

      toast.success(`Variant column "${columnName.trim()}" created!`);
      setNewVariantColumnName("");
      setIsVariantColumnDialogOpen(false);
      return { error: null };
    },
    null
  );

  const [
    variantColumnUpdateState,
    submitUpdateVariantColumn,
    isVariantColumnUpdatePending,
  ] = useActionState(
    async (
      prevState: { error: string | null } | null,
      formData: FormData
    ) => {
      const columnName = formData.get("editVariantColumnName") as string;
      if (!editingVariantColumn) {
        toast.error("No variant column selected for editing.");
        return { error: "No variant column selected." };
      }
      if (!columnName.trim()) {
        toast.warning("Variant column name cannot be empty.");
        return { error: "Variant column name is required." };
      }

      const { error } = await updateVariantColumn(
        editingVariantColumn.id,
        columnName.trim()
      );
      if (error) {
        toast.error(`Failed to update variant column: ${error.message}`);
        return { error: error.message };
      }

      toast.success(`Variant column "${columnName.trim()}" updated!`);
      setIsVariantColumnEditDialogOpen(false);
      setEditingVariantColumn(null);
      return { error: null };
    },
    null
  );

  // --- Delete Category Handler ---
  const handleDeleteCategory = async (
    categoryId: string,
    categoryName: string
  ) => {
    // Show a loading toast while the delete operation is in progress
    const deleteToastId = toast.loading(
      `Deleting category "${categoryName}"...`
    );

    const result = await deleteCategory(categoryId);

    toast.dismiss(deleteToastId); // Dismiss the loading toast

    if (result.error) {
      toast.error(
        `Failed to delete category "${categoryName}": ${result.error.message}`
      );
    } else {
      toast.success(`Category "${categoryName}" deleted successfully!`);
      // Path revalidation by the server action should refresh the list of categories.
    }
  };
  // -----------------------------

  const handleArchiveVariantColumn = async (
    columnId: string,
    columnName: string
  ) => {
    const archiveToastId = toast.loading(
      `Archiving variant column "${columnName}"...`
    );

    const result = await archiveVariantColumn(columnId);

    toast.dismiss(archiveToastId);

    if (result.error) {
      toast.error(
        `Failed to archive variant column "${columnName}": ${result.error.message}`
      );
    } else {
      toast.success(`Variant column "${columnName}" archived.`);
    }
  };

  const handleRestoreVariantColumn = async (
    columnId: string,
    columnName: string
  ) => {
    const restoreToastId = toast.loading(
      `Restoring variant column "${columnName}"...`
    );

    const result = await restoreVariantColumn(columnId);

    toast.dismiss(restoreToastId);

    if (result.error) {
      toast.error(
        `Failed to restore variant column "${columnName}": ${result.error.message}`
      );
    } else {
      toast.success(`Variant column "${columnName}" restored.`);
    }
  };

  const activeVariantColumns = initialVariantColumns.filter(
    (column) => !column.archivedAt
  );
  const archivedVariantColumns = initialVariantColumns.filter(
    (column) => column.archivedAt
  );

  // Display initial error if fetching failed on server
  if (errorMsg) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center p-4 md:p-6">
        <p className="text-destructive">{errorMsg}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Organization Management</h1>
        <p className="text-muted-foreground">
          Manage members and categories for your organization.
        </p>
      </div>

      {/* Conditionally render Invite Section only for owners */}
      {userRole === "owner" && (
        <Card>
          <CardHeader>
            <CardTitle>Invite New Member</CardTitle>
            <CardDescription>
              Enter the email address of the user you want to invite. They will
              receive an email with instructions to join.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={submitInvite} className="flex flex-col gap-4 md:flex-row md:items-end">
              <div className="flex-grow space-y-1.5">
                <Label htmlFor="invite-email">Email Address</Label>
                <Input
                  type="email"
                  id="invite-email"
                  name="email" // Name matches formData key
                  placeholder="user@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  disabled={isInvitePending}
                  className="h-10" // Ensure consistent height
                />
              </div>
              <div className="space-y-1.5 md:w-48">
                <Label htmlFor="invite-role">Role</Label>
                <Select name="role" value={inviteRole} onValueChange={setInviteRole} disabled={isInvitePending}>
                  <SelectTrigger id="invite-role" className="h-10"> {/* Match input height */}
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member (can edit)</SelectItem>
                    <SelectItem value="viewer">Viewer (read-only)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={isInvitePending} className="h-10 md:w-auto"> {/* Match height */}
                {isInvitePending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="mr-2 h-4 w-4" />
                )}
                {isInvitePending ? "Sending..." : "Send Invite"}
              </Button>
            </form>
            {inviteState?.error && (
              <p className="text-sm text-destructive mt-2">
                {inviteState.error}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Members Table */}
      <Card>
        <CardHeader>
          <CardTitle>Current Members</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Use a generic DataTable component - requires columns prop */}
          {/* Pass initialMembers directly, assuming DataTable handles display */}
          {/* Note: Search/filter functionality might need DataTable adjustments */}
          <ProductsDataTable
            columns={columns}
            data={initialMembers}
            searchColumnId="email" // Allow searching by email
            hideCatalogFilter={true} // Keep hiding catalog filter
            hideAddButton={true} // <-- Add prop to hide Add button
            meta={{
              currentUserId: currentUser?.id,
              currentUserRole: userRole,
            }}
            // Optional: Add other props like onDeleteRow if needed later
          />
        </CardContent>
      </Card>

      {/* --- Manage Categories Section (New) --- */}
      {userRole === "owner" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Manage Categories</CardTitle>
              <CardDescription>
                View and create new product categories for your organization.
              </CardDescription>
            </div>
            <Dialog
              open={isCategoryDialogOpen}
              onOpenChange={setIsCategoryDialogOpen}
            >
              <DialogTrigger asChild>
                <Button variant="outline">
                  <PlusCircle className="mr-2 h-4 w-4" /> Create Category
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Create New Category</DialogTitle>
                  <DialogDescription>
                    Enter a name for the new product category.
                  </DialogDescription>
                </DialogHeader>
                <form action={submitCreateCategory}>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="category-name" className="text-right">
                        Name
                      </Label>
                      <Input
                        id="category-name"
                        name="categoryName" // For FormData
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        className="col-span-3"
                        placeholder="e.g., Electronics"
                        required
                        disabled={isCategoryCreatePending}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button
                        variant="outline"
                        disabled={isCategoryCreatePending}
                      >
                        Cancel
                      </Button>
                    </DialogClose>
                    <Button type="submit" disabled={isCategoryCreatePending}>
                      {isCategoryCreatePending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      {isCategoryCreatePending
                        ? "Creating..."
                        : "Create Category"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {categoriesErrorMsg && (
              <p className="text-destructive text-sm">
                Error loading categories: {categoriesErrorMsg}
              </p>
            )}
            {!categoriesErrorMsg && initialCategories.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No categories created yet.
              </p>
            )}
            {!categoriesErrorMsg && initialCategories.length > 0 && (
              <ul className="space-y-2 pt-4">
                {initialCategories.map((category) => (
                  <li
                    key={category.id}
                    className="text-sm p-3 border rounded-md flex justify-between items-center"
                  >
                    <span>{category.name}</span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          setEditingCategory(category);
                          setEditCategoryName(category.name);
                          setIsCategoryEditDialogOpen(true);
                        }}
                        title="Edit category"
                      >
                        <EditIcon className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            className="text-destructive border-destructive hover:bg-destructive/10 hover:text-destructive-foreground focus-visible:ring-destructive"
                            title="Delete category"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Are you absolutely sure?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone. This will
                              permanently delete{" "}
                              <strong>{category.name}</strong>. If products are
                              using this category, deletion might fail or
                              products might be affected.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() =>
                                handleDeleteCategory(category.id, category.name)
                              }
                              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                            >
                              Yes, delete category
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
      {/* --- End Manage Categories Section --- */}

      {userRole === "owner" && (
        <Card>
          <CardHeader>
            <CardTitle>Certification Settings</CardTitle>
            <CardDescription>
              EU Declaration of Conformity
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CertificationSettingsForm settings={initialCertificationSettings} errorMessage={certificationSettingsErrorMsg} />
          </CardContent>
        </Card>
      )}

      {userRole === "owner" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Variant Datasheet Columns</CardTitle>
              <CardDescription>
                Manage the column headers available in the variant datasheet
                selector.
              </CardDescription>
            </div>
            <Dialog
              open={isVariantColumnDialogOpen}
              onOpenChange={setIsVariantColumnDialogOpen}
            >
              <DialogTrigger asChild>
                <Button variant="outline">
                  <PlusCircle className="mr-2 h-4 w-4" /> Create Column
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Create Variant Column</DialogTitle>
                  <DialogDescription>
                    Add a column header that can be selected in variant
                    datasheets.
                  </DialogDescription>
                </DialogHeader>
                <form action={submitCreateVariantColumn}>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="variant-column-name" className="text-right">
                        Name
                      </Label>
                      <Input
                        id="variant-column-name"
                        name="variantColumnName"
                        value={newVariantColumnName}
                        onChange={(event) =>
                          setNewVariantColumnName(event.target.value)
                        }
                        className="col-span-3"
                        placeholder="e.g., Bore Size"
                        required
                        disabled={isVariantColumnCreatePending}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button
                        variant="outline"
                        disabled={isVariantColumnCreatePending}
                      >
                        Cancel
                      </Button>
                    </DialogClose>
                    <Button
                      type="submit"
                      disabled={isVariantColumnCreatePending}
                    >
                      {isVariantColumnCreatePending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      {isVariantColumnCreatePending
                        ? "Creating..."
                        : "Create Column"}
                    </Button>
                  </DialogFooter>
                </form>
                {variantColumnCreateState?.error && (
                  <p className="text-sm text-destructive">
                    {variantColumnCreateState.error}
                  </p>
                )}
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="space-y-5">
            {variantColumnsErrorMsg && (
              <p className="text-sm text-destructive">
                Error loading variant columns: {variantColumnsErrorMsg}
              </p>
            )}
            {!variantColumnsErrorMsg && activeVariantColumns.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No active variant columns created yet.
              </p>
            )}
            {!variantColumnsErrorMsg && activeVariantColumns.length > 0 && (
              <ul className="space-y-2">
                {activeVariantColumns.map((column) => (
                  <li
                    key={column.id}
                    className="flex items-center justify-between rounded-md border p-3 text-sm"
                  >
                    <span>{column.label}</span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          setEditingVariantColumn(column);
                          setEditVariantColumnName(column.label);
                          setIsVariantColumnEditDialogOpen(true);
                        }}
                        title="Edit variant column"
                      >
                        <EditIcon className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            disabled={activeVariantColumns.length <= 1}
                            title={
                              activeVariantColumns.length <= 1
                                ? "At least one active variant column is required"
                                : "Archive variant column"
                            }
                          >
                            <ArchiveIcon className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Archive this variant column?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              This removes{" "}
                              <strong>{column.label}</strong> from new
                              datasheet selections, but existing datasheets that
                              already use it will still render.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() =>
                                handleArchiveVariantColumn(
                                  column.id,
                                  column.label
                                )
                              }
                            >
                              Archive column
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {archivedVariantColumns.length > 0 && (
              <div className="space-y-2 border-t pt-4">
                <p className="text-sm font-medium text-muted-foreground">
                  Archived Columns
                </p>
                <ul className="space-y-2">
                  {archivedVariantColumns.map((column) => (
                    <li
                      key={column.id}
                      className="flex items-center justify-between rounded-md border p-3 text-sm text-muted-foreground"
                    >
                      <span>{column.label}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          handleRestoreVariantColumn(column.id, column.label)
                        }
                      >
                        <RotateCcw className="mr-2 h-4 w-4" /> Restore
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* --- Edit Category Dialog --- */}
      {editingCategory && (
        <Dialog
          open={isCategoryEditDialogOpen}
          onOpenChange={(isOpen) => {
            setIsCategoryEditDialogOpen(isOpen);
            if (!isOpen) setEditingCategory(null); // Clear editing state when dialog closes
          }}
        >
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Edit Category</DialogTitle>
              <DialogDescription>
                Update the name for{" "}
                <strong>{editingCategory.name}</strong>.
              </DialogDescription>
            </DialogHeader>
            {/* Use action state for the form */}
            <form action={submitUpdateCategory}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-category-name" className="text-right">
                    Name
                  </Label>
                  <Input
                    id="edit-category-name"
                    name="editCategoryName" // Matches formData key
                    value={editCategoryName}
                    onChange={(e) => setEditCategoryName(e.target.value)}
                    className="col-span-3"
                    required
                    disabled={isCategoryUpdatePending} // Use pending state
                  />
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline" disabled={isCategoryUpdatePending}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={isCategoryUpdatePending}>
                  {isCategoryUpdatePending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {isCategoryUpdatePending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
      {/* ----------------------------- */}

      {editingVariantColumn && (
        <Dialog
          open={isVariantColumnEditDialogOpen}
          onOpenChange={(isOpen) => {
            setIsVariantColumnEditDialogOpen(isOpen);
            if (!isOpen) setEditingVariantColumn(null);
          }}
        >
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Edit Variant Column</DialogTitle>
              <DialogDescription>
                Update the label for{" "}
                <strong>{editingVariantColumn.label}</strong>.
              </DialogDescription>
            </DialogHeader>
            <form action={submitUpdateVariantColumn}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label
                    htmlFor="edit-variant-column-name"
                    className="text-right"
                  >
                    Name
                  </Label>
                  <Input
                    id="edit-variant-column-name"
                    name="editVariantColumnName"
                    value={editVariantColumnName}
                    onChange={(event) =>
                      setEditVariantColumnName(event.target.value)
                    }
                    className="col-span-3"
                    required
                    disabled={isVariantColumnUpdatePending}
                  />
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button
                    variant="outline"
                    disabled={isVariantColumnUpdatePending}
                  >
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={isVariantColumnUpdatePending}>
                  {isVariantColumnUpdatePending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {isVariantColumnUpdatePending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
            {variantColumnUpdateState?.error && (
              <p className="text-sm text-destructive">
                {variantColumnUpdateState.error}
              </p>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
