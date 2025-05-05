"use client"; // Needs to be client component for interactions

import React, { useState, useEffect, startTransition } from "react";
import { Button } from "@/components/ui/button";
import { PlusCircle, Loader2, PackageIcon, DatabaseIcon } from "lucide-react";
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
// --------------------------------

// --- Define Catalog interface locally ---
interface Catalog {
  id: string;
  name: string;
  // image_url: string | null;
  // product_count is no longer fetched/used
}
// --------------------------------------

export default function CatalogsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newCatalogName, setNewCatalogName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [catalogs, setCatalogs] = useState<Catalog[]>([]); // State for listing
  const [isLoadingCatalogs, setIsLoadingCatalogs] = useState(true);

  // Function to load catalogs using Server Action
  const loadCatalogs = () => {
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
  };

  // Fetch initial data using the action
  useEffect(() => {
    loadCatalogs();
  }, []); // Run once on mount

  // Function to handle creating a new catalog using Server Action
  const handleCreateCatalog = async () => {
    if (!newCatalogName.trim()) {
      toast.warning("Please enter a catalog name.");
      return;
    }
    // No need to check profile here, action handles it

    setIsCreating(true);
    // Use startTransition for the mutation
    startTransition(async () => {
      const { data, error } = await createCatalog(newCatalogName.trim());

      if (error) {
        console.error("Error creating catalog via action:", error);
        toast.error(`Failed to create catalog: ${error.message}`);
      } else {
        toast.success(`Catalog "${newCatalogName.trim()}" created!`);
        setNewCatalogName(""); // Reset input
        setIsDialogOpen(false); // Close dialog
        // Action already revalidates path, list should update on navigation or refresh
        // Optionally, call loadCatalogs() again for immediate UI update without full navigation
        loadCatalogs();
      }
      setIsCreating(false);
    });
  };

  return (
    <div className="flex flex-col flex-1 p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Manage Catalogs</h1>

        {/* Dialog Trigger Button */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" /> Create New Catalog
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Create New Catalog</DialogTitle>
              <DialogDescription>
                Enter a name for your new product catalog.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="catalog-name" className="text-right">
                  Name
                </Label>
                <Input
                  id="catalog-name"
                  value={newCatalogName}
                  onChange={(e) => setNewCatalogName(e.target.value)}
                  className="col-span-3"
                  placeholder="e.g., 2025 Products"
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" disabled={isCreating}>
                  Cancel
                </Button>
              </DialogClose>
              <Button onClick={handleCreateCatalog} disabled={isCreating}>
                {isCreating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {isCreating ? "Creating..." : "Create Catalog"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Display Catalogs as Cards */}
      <div className="mt-6">
        <h2 className="text-lg font-medium mb-4">Existing Catalogs</h2>
        {isLoadingCatalogs ? (
          <p className="text-muted-foreground">Loading catalogs...</p>
        ) : catalogs.length === 0 ? (
          <p className="text-muted-foreground">No catalogs created yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {catalogs.map((catalog) => (
              <Link
                key={catalog.id}
                href={`/dashboard/catalogs/${catalog.id}`}
                passHref
                className="block h-full"
              >
                {/* Add overflow-hidden to card for image rounding */}
                <Card className="hover:shadow-md transition-shadow cursor-pointer h-full flex flex-col overflow-hidden">
                  {/* --- Remove Catalog Image Logic --- */}
                  <div className="aspect-video w-full bg-muted relative">
                    {/* Always show placeholder */}
                    <div className="flex items-center justify-center h-full">
                      <PackageIcon className="h-12 w-12 text-muted-foreground/50" />
                    </div>
                  </div>
                  {/* -------------------------- */}
                  <CardHeader>
                    <CardTitle className="text-base">{catalog.name}</CardTitle>
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
