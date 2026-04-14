"use client";

import React, { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  Printer,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { deleteKanbanCards } from "../actions";
import type { KanbanCard } from "../actions";
import { printPdfFromUrl } from "@/lib/client/print-pdf";

interface KanbanCardsTableProps {
  cards: KanbanCard[];
  searchQuery: string;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  userRole: string;
}

export default function KanbanCardsTable({
  cards,
  searchQuery,
  page,
  pageSize,
  totalCount,
  totalPages,
  userRole,
}: KanbanCardsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const currentSearchParams = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchQuery);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<string | null>(null);
  const [isPrintingPdf, setIsPrintingPdf] = useState<string | null>(null);
  const [generatedPdfCardIds, setGeneratedPdfCardIds] = useState(
    () => new Set<string>()
  );
  const [selectedCardIds, setSelectedCardIds] = useState(() => new Set<string>());
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  const [isRoutePending, startRouteTransition] = useTransition();

  useEffect(() => {
    setSearchTerm(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    setSelectedCardIds(new Set());
  }, [cards]);

  useEffect(() => {
    const normalizedSearch = searchTerm.trim();
    if (normalizedSearch === searchQuery) {
      return;
    }

    const timeoutId = setTimeout(() => {
      startRouteTransition(() => {
        const params = new URLSearchParams(currentSearchParams.toString());
        if (normalizedSearch) {
          params.set("q", normalizedSearch);
        } else {
          params.delete("q");
        }
        params.set("page", "1");
        params.set("pageSize", String(pageSize));
        const query = params.toString();
        router.push(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        });
      });
    }, 300);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [
    currentSearchParams,
    pageSize,
    pathname,
    router,
    searchQuery,
    searchTerm,
    startRouteTransition,
  ]);

  const navigateToPage = (nextPage: number) => {
    const clampedPage = Math.min(Math.max(nextPage, 1), Math.max(totalPages, 1));
    if (clampedPage === page) {
      return;
    }

    startRouteTransition(() => {
      const params = new URLSearchParams(currentSearchParams.toString());
      params.set("page", String(clampedPage));
      params.set("pageSize", String(pageSize));
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    });
  };

  const handleDelete = async (cardId: string, partNo: string) => {
    setIsDeleting(cardId);
    const toastId = toast.loading(`Deleting card "${partNo}"...`);

    try {
      const { error } = await deleteKanbanCards([cardId]);

      if (error) {
        toast.error(`Failed to delete card: ${error.message}`, { id: toastId });
      } else {
        toast.success("Card deleted successfully", { id: toastId });
        if (cards.length === 1 && page > 1) {
          startRouteTransition(() => {
            const params = new URLSearchParams(currentSearchParams.toString());
            params.set("page", String(page - 1));
            params.set("pageSize", String(pageSize));
            const query = params.toString();
            router.push(query ? `${pathname}?${query}` : pathname, {
              scroll: false,
            });
          });
        } else {
          startRouteTransition(() => {
            router.refresh();
          });
        }
      }
    } finally {
      setIsDeleting(null);
    }
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
        toast.success(`✅ PDF ${hasPdf ? "ready" : "generated successfully"}!`, {
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
        });
        setGeneratedPdfCardIds((prev) => {
          const next = new Set(prev);
          next.add(cardId);
          return next;
        });
      } else {
        throw new Error("PDF URL not found in response.");
      }
    } catch (error: any) {
      console.error("Error with kanban PDF:", error);
      toast.error(`Failed to ${hasPdf ? "get" : "generate"} PDF: ${error.message}`, {
        id: toastId,
      });
    } finally {
      setIsGeneratingPdf(null);
    }
  };

  const handlePrintPdf = async (cardId: string, partNo: string) => {
    setIsPrintingPdf(cardId);
    const toastId = toast.loading(`Preparing print for "${partNo}"...`);

    try {
      const res = await fetch("/api/generate-kanban-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kanbanCardIds: [cardId] }),
      });

      const { url, error: apiError } = await res.json();

      if (!res.ok) {
        throw new Error(apiError || "Failed to get PDF");
      }

      if (apiError) {
        throw new Error(apiError);
      }

      if (!url) {
        throw new Error("PDF URL not found in response.");
      }

      await printPdfFromUrl(url, `${partNo}.pdf`);
      toast.success("Print window opened.", { id: toastId });
    } catch (error: any) {
      console.error("Error printing kanban PDF:", error);
      toast.error(`Failed to print PDF: ${error.message}`, { id: toastId });
    } finally {
      setIsPrintingPdf(null);
    }
  };

  const handleToggleCardSelection = (cardId: string, checked: boolean) => {
    setSelectedCardIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(cardId);
      } else {
        next.delete(cardId);
      }
      return next;
    });
  };

  const handleToggleAllVisibleCards = (checked: boolean) => {
    if (!checked) {
      setSelectedCardIds(new Set());
      return;
    }

    setSelectedCardIds(new Set(cards.map((card) => card.id)));
  };

  const getDownloadFileName = (contentDisposition: string | null) => {
    if (!contentDisposition) {
      return `kanban-cards-${new Date().toISOString().slice(0, 10)}.zip`;
    }

    const match = contentDisposition.match(/filename="?([^"]+)"?/i);
    return match?.[1] || `kanban-cards-${new Date().toISOString().slice(0, 10)}.zip`;
  };

  const handleBulkDownload = async () => {
    const selectedIds = cards
      .filter((card) => selectedCardIds.has(card.id))
      .map((card) => card.id);

    if (selectedIds.length === 0) {
      return;
    }

    setIsBulkDownloading(true);
    const toastId = toast.loading(
      `Preparing ${selectedIds.length} kanban PDF${
        selectedIds.length === 1 ? "" : "s"
      }...`
    );

    try {
      const res = await fetch("/api/download-kanban-pdfs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kanbanCardIds: selectedIds }),
      });

      if (!res.ok) {
        const errorData = await res
          .json()
          .catch(() => ({ error: "Failed to download selected kanban PDFs." }));
        throw new Error(errorData.error || "Failed to download selected PDFs.");
      }

      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = getDownloadFileName(
        res.headers.get("Content-Disposition")
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);

      toast.success("Bulk download started.", { id: toastId });
      setSelectedCardIds(new Set());
    } catch (error: any) {
      console.error("Error downloading selected kanban PDFs:", error);
      toast.error(`Failed to download selected PDFs: ${error.message}`, {
        id: toastId,
      });
    } finally {
      setIsBulkDownloading(false);
    }
  };

  const getHeaderColorBadge = (color: string) => {
    const colorMap = {
      red: "bg-red-500 text-white",
      orange: "bg-orange-500 text-white",
      green: "bg-green-500 text-white",
      yellow: "bg-yellow-400 text-gray-900",
      blue: "bg-blue-500 text-white",
      purple: "bg-purple-500 text-white",
      brown: "bg-[#6B3F16] text-white",
      pink: "bg-pink-400 text-gray-900",
      teal: "bg-teal-500 text-white",
      cyan: "bg-cyan-400 text-gray-900",
      gray: "bg-gray-500 text-white",
      magenta: "bg-fuchsia-500 text-white",
      lime: "bg-lime-400 text-gray-900",
      silver: "bg-gray-400 text-gray-900",
      black: "bg-black text-white",
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

  const showingFrom = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = totalCount === 0 ? 0 : Math.min(page * pageSize, totalCount);
  const selectedCount = selectedCardIds.size;
  const allVisibleCardsSelected =
    cards.length > 0 && cards.every((card) => selectedCardIds.has(card.id));
  const someVisibleCardsSelected = cards.some((card) =>
    selectedCardIds.has(card.id)
  );

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
            aria-label="Search kanban cards"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleBulkDownload}
            disabled={selectedCount === 0 || isBulkDownloading}
          >
            {isBulkDownloading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Download Selected
            {selectedCount > 0 ? ` (${selectedCount})` : ""}
          </Button>
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
              <TableHead className="w-[48px]">
                <Checkbox
                  checked={
                    allVisibleCardsSelected ||
                    (someVisibleCardsSelected && "indeterminate")
                  }
                  onCheckedChange={(checked) =>
                    handleToggleAllVisibleCards(checked === true)
                  }
                  aria-label="Select all cards on this page"
                />
              </TableHead>
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
            {cards.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center">
                  {searchQuery
                    ? "No cards match your search."
                    : "No kanban cards found."}
                </TableCell>
              </TableRow>
            ) : (
              cards.map((card) => {
                const hasPdf =
                  Boolean(card.pdf_storage_path) ||
                  generatedPdfCardIds.has(card.id);
                const isSelected = selectedCardIds.has(card.id);

                return (
                  <TableRow key={card.id} data-state={isSelected ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) =>
                          handleToggleCardSelection(card.id, checked === true)
                        }
                        aria-label={`Select ${card.part_no}`}
                      />
                    </TableCell>
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
                    <TableCell>{getHeaderColorBadge(card.header_color)}</TableCell>
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
                          {/* Only show Edit for owners and members, not viewers */}
                          {userRole !== "viewer" && (
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/kanban/${card.id}/edit`}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() =>
                              handlePdfAction(card.id, card.part_no, hasPdf)
                            }
                            disabled={
                              isGeneratingPdf === card.id ||
                              isPrintingPdf === card.id
                            }
                          >
                            {isGeneratingPdf === card.id ? (
                              <>
                                <FileText className="mr-2 h-4 w-4 animate-spin" />
                                {hasPdf ? "Getting..." : "Generating..."}
                              </>
                            ) : hasPdf ? (
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
                          <DropdownMenuItem
                            onClick={() => handlePrintPdf(card.id, card.part_no)}
                            disabled={
                              isPrintingPdf === card.id ||
                              isGeneratingPdf === card.id
                            }
                          >
                            {isPrintingPdf === card.id ? (
                              <>
                                <Printer className="mr-2 h-4 w-4 animate-spin" />
                                Preparing...
                              </>
                            ) : (
                              <>
                                <Printer className="mr-2 h-4 w-4" />
                                {hasPdf ? "Print PDF" : "Generate & Print"}
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {/* Only show Delete for owners and members, not viewers */}
                          {userRole !== "viewer" && (
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
                                  <AlertDialogTitle>
                                    Are you sure?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently delete the kanban card
                                    for <strong>{card.part_no}</strong>. This
                                    action cannot be undone.
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
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Results Info and Pagination */}
      <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div>
          Showing {showingFrom}-{showingTo} of {totalCount} cards
          {isRoutePending ? " (updating...)" : ""}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateToPage(page - 1)}
            disabled={page <= 1 || isRoutePending}
          >
            Previous
          </Button>
          <span>
            Page {Math.min(page, totalPages)} of {Math.max(totalPages, 1)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateToPage(page + 1)}
            disabled={page >= totalPages || isRoutePending}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
