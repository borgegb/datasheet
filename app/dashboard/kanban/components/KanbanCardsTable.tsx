"use client";

import React, { useState, startTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Badge } from "@/components/ui/badge";
import {
  MoreHorizontal,
  Edit,
  Trash2,
  Eye,
  Search,
  Upload,
  Download,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { deleteKanbanCards } from "../actions";
import type { KanbanCard } from "../actions";

interface KanbanCardsTableProps {
  initialData: KanbanCard[];
}

export default function KanbanCardsTable({
  initialData,
}: KanbanCardsTableProps) {
  const [cards, setCards] = useState<KanbanCard[]>(initialData);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<string | null>(null);

  // Filter cards based on search term
  const filteredCards = cards.filter(
    (card) =>
      card.part_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
      card.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      card.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
      card.preferred_supplier?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDelete = async (cardId: string, partNo: string) => {
    setIsDeleting(cardId);
    const toastId = toast.loading(`Deleting card "${partNo}"...`);

    startTransition(async () => {
      const { error } = await deleteKanbanCards([cardId]);

      if (error) {
        toast.error(`Failed to delete card: ${error.message}`, { id: toastId });
      } else {
        toast.success("Card deleted successfully", { id: toastId });
        setCards((prev) => prev.filter((card) => card.id !== cardId));
      }

      setIsDeleting(null);
    });
  };

  const handlePdfAction = async (
    cardId: string,
    partNo: string,
    hasPdf: boolean
  ) => {
    setIsGeneratingPdf(cardId);
    const toastId = toast.loading(
      `${hasPdf ? "Getting" : "Generating"} PDF for "${partNo}"...`
    );

    startTransition(async () => {
      try {
        const res = await fetch("/api/generate-kanban-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kanbanCardIds: [cardId] }),
        });

        const { url, error: apiError } = await res.json();

        if (!res.ok) {
          throw new Error(apiError || "Failed to generate PDF");
        }

        if (apiError) {
          throw new Error(apiError);
        }

        if (url) {
          toast.success(
            `✅ PDF ${hasPdf ? "ready" : "generated successfully"}!`,
            {
              id: toastId,
              description: "Click the button to view your PDF.",
              action: (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(url, "_blank")}
                >
                  View PDF
                </Button>
              ),
              duration: 15000,
            }
          );

          // Update local state to reflect PDF is now available
          setCards((prev) =>
            prev.map((c) =>
              c.id === cardId ? { ...c, pdf_storage_path: "generated" } : c
            )
          );
        } else {
          throw new Error("PDF URL not found in response.");
        }
      } catch (error: any) {
        console.error("Error with kanban PDF:", error);
        toast.error(
          `Failed to ${hasPdf ? "get" : "generate"} PDF: ${error.message}`,
          {
            id: toastId,
          }
        );
      } finally {
        setIsGeneratingPdf(null);
      }
    });
  };

  const getHeaderColorBadge = (color: string) => {
    const colorMap = {
      red: "bg-red-500 text-white",
      orange: "bg-orange-500 text-white",
      green: "bg-green-500 text-white",
    };

    return (
      <Badge
        className={
          colorMap[color as keyof typeof colorMap] || "bg-gray-500 text-white"
        }
      >
        {color.toUpperCase()}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      {/* Search and Actions Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search cards..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard/kanban/batch">
              <Upload className="mr-2 h-4 w-4" />
              Batch Upload
            </Link>
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Part No</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Order Qty</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Lead Time</TableHead>
              <TableHead>Color</TableHead>
              <TableHead className="w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCards.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  {searchTerm
                    ? "No cards match your search."
                    : "No kanban cards found."}
                </TableCell>
              </TableRow>
            ) : (
              filteredCards.map((card) => (
                <TableRow key={card.id}>
                  <TableCell className="font-medium">{card.part_no}</TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {card.description || (
                      <span className="text-muted-foreground italic">
                        No description
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{card.location}</TableCell>
                  <TableCell>
                    {card.order_quantity || (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[150px] truncate">
                    {card.preferred_supplier || (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {card.lead_time || (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {getHeaderColorBadge(card.header_color)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem asChild>
                          <Link href={`/dashboard/kanban/${card.id}`}>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/dashboard/kanban/${card.id}/edit`}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() =>
                            handlePdfAction(
                              card.id,
                              card.part_no,
                              !!card.pdf_storage_path
                            )
                          }
                          disabled={isGeneratingPdf === card.id}
                        >
                          {isGeneratingPdf === card.id ? (
                            <>
                              <FileText className="mr-2 h-4 w-4 animate-spin" />
                              {card.pdf_storage_path
                                ? "Getting..."
                                : "Generating..."}
                            </>
                          ) : card.pdf_storage_path ? (
                            <>
                              <Download className="mr-2 h-4 w-4" />
                              Download PDF
                            </>
                          ) : (
                            <>
                              <FileText className="mr-2 h-4 w-4" />
                              Generate PDF
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={(e) => e.preventDefault()}
                              disabled={isDeleting === card.id}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete the kanban card for{" "}
                                <strong>{card.part_no}</strong>. This action
                                cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() =>
                                  handleDelete(card.id, card.part_no)
                                }
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                disabled={isDeleting === card.id}
                              >
                                {isDeleting === card.id
                                  ? "Deleting..."
                                  : "Delete"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Results Info */}
      <div className="text-sm text-muted-foreground">
        Showing {filteredCards.length} of {cards.length} cards
      </div>
    </div>
  );
}
