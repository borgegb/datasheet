"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Download,
  Edit,
  Eye,
  FileText,
  Loader2,
  MoreHorizontal,
  Printer,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { printPdfFromUrl } from "@/lib/client/print-pdf";
import {
  DEFAULT_PRODUCTION_KANBAN_PDF_FORMAT,
  getProductionKanbanPdfFormatLabel,
  getProductionKanbanPdfFormatToken,
  normalizeProductionKanbanPdfFormat,
  PRODUCTION_KANBAN_PDF_FORMAT_OPTIONS,
  type ProductionKanbanPdfFormat,
} from "@/lib/production-kanban/pdf-format";
import {
  deleteProductionKanbanCards,
  type ProductionKanbanCard,
} from "../actions";

interface ProductionKanbanTableProps {
  cards: ProductionKanbanCard[];
  searchQuery: string;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  userRole: string;
}

export default function ProductionKanbanTable({
  cards,
  searchQuery,
  page,
  pageSize,
  totalCount,
  totalPages,
  userRole,
}: ProductionKanbanTableProps) {
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
  const [selectedPdfFormat, setSelectedPdfFormat] =
    useState<ProductionKanbanPdfFormat>(DEFAULT_PRODUCTION_KANBAN_PDF_FORMAT);
  const [isRoutePending, startRouteTransition] = useTransition();
  const selectedPdfFormatLabel =
    getProductionKanbanPdfFormatLabel(selectedPdfFormat);

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

    return () => clearTimeout(timeoutId);
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

  const getPdfUrl = async (
    cardId: string,
    format: ProductionKanbanPdfFormat
  ) => {
    const res = await fetch("/api/generate-production-kanban-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productionKanbanCardIds: [cardId],
        format,
      }),
    });

    const { url, error: apiError } = await res.json();
    if (!res.ok) {
      throw new Error(apiError || "Failed to generate PDF");
    }

    if (apiError) {
      throw new Error(apiError);
    }

    if (!url) {
      throw new Error("PDF URL not found in response.");
    }

    return url as string;
  };

  const handleDelete = async (cardId: string, partNo: string) => {
    setIsDeleting(cardId);
    const toastId = toast.loading(`Deleting "${partNo}"...`);

    try {
      const { error } = await deleteProductionKanbanCards([cardId]);
      if (error) {
        toast.error(`Failed to delete card: ${error.message}`, { id: toastId });
      } else {
        toast.success("Production Kanban deleted successfully.", { id: toastId });
        if (cards.length === 1 && page > 1) {
          navigateToPage(page - 1);
        } else {
          startRouteTransition(() => router.refresh());
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
      `${hasPdf ? "Getting" : "Generating"} ${selectedPdfFormatLabel} PDF for "${partNo}"...`
    );

    try {
      const url = await getPdfUrl(cardId, selectedPdfFormat);
      toast.success(`${selectedPdfFormatLabel} PDF ${hasPdf ? "ready" : "generated"}.`, {
        id: toastId,
        description: `Click the button to view the ${selectedPdfFormatLabel.toLowerCase()} PDF.`,
        action: (
          <Button variant="outline" size="sm" onClick={() => window.open(url, "_blank")}>
            View PDF
          </Button>
        ),
        duration: 15000,
      });
      if (selectedPdfFormat === DEFAULT_PRODUCTION_KANBAN_PDF_FORMAT) {
        setGeneratedPdfCardIds((currentIds) => {
          const nextIds = new Set(currentIds);
          nextIds.add(cardId);
          return nextIds;
        });
      }
    } catch (error: any) {
      console.error("Error with Production Kanban PDF:", error);
      toast.error(`Failed to get PDF: ${error.message}`, { id: toastId });
    } finally {
      setIsGeneratingPdf(null);
    }
  };

  const handlePrintPdf = async (cardId: string, partNo: string) => {
    setIsPrintingPdf(cardId);
    const toastId = toast.loading(
      `Preparing ${selectedPdfFormatLabel} print for "${partNo}"...`
    );

    try {
      const url = await getPdfUrl(cardId, selectedPdfFormat);
      const fileName =
        selectedPdfFormat === DEFAULT_PRODUCTION_KANBAN_PDF_FORMAT
          ? `${partNo}.pdf`
          : `${partNo}-${getProductionKanbanPdfFormatToken(
              selectedPdfFormat
            )}.pdf`;
      await printPdfFromUrl(url, fileName);
      toast.success("Print window opened.", { id: toastId });
    } catch (error: any) {
      console.error("Error printing Production Kanban PDF:", error);
      toast.error(`Failed to print PDF: ${error.message}`, { id: toastId });
    } finally {
      setIsPrintingPdf(null);
    }
  };

  const handleToggleCardSelection = (cardId: string, checked: boolean) => {
    setSelectedCardIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (checked) {
        nextIds.add(cardId);
      } else {
        nextIds.delete(cardId);
      }
      return nextIds;
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
      const suffix =
        selectedPdfFormat === DEFAULT_PRODUCTION_KANBAN_PDF_FORMAT
          ? ""
          : `-${getProductionKanbanPdfFormatToken(selectedPdfFormat)}`;
      return `production-kanban${suffix}-${new Date()
        .toISOString()
        .slice(0, 10)}.zip`;
    }

    const match = contentDisposition.match(/filename="?([^"]+)"?/i);
    return (
      match?.[1] ||
      `production-kanban-${new Date().toISOString().slice(0, 10)}.zip`
    );
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
      `Preparing ${selectedIds.length} ${selectedPdfFormatLabel} Production Kanban PDF${
        selectedIds.length === 1 ? "" : "s"
      }...`
    );

    try {
      const res = await fetch("/api/download-production-kanban-pdfs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productionKanbanCardIds: selectedIds,
          format: selectedPdfFormat,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({
          error: "Failed to download selected Production Kanban PDFs.",
        }));
        throw new Error(
          errorData.error || "Failed to download selected PDFs."
        );
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
      console.error(
        "Error downloading selected Production Kanban PDFs:",
        error
      );
      toast.error(`Failed to download selected PDFs: ${error.message}`, {
        id: toastId,
      });
    } finally {
      setIsBulkDownloading(false);
    }
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search Production Kanban cards"
            className="pl-9"
            placeholder="Search Production Kanban..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={selectedPdfFormat}
            onValueChange={(value) =>
              setSelectedPdfFormat(normalizeProductionKanbanPdfFormat(value))
            }
          >
            <SelectTrigger
              className="w-[140px]"
              aria-label="Select Production Kanban PDF format"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRODUCTION_KANBAN_PDF_FORMAT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

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
        </div>
      </div>

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
                  aria-label="Select all Production Kanban cards on this page"
                />
              </TableHead>
              <TableHead>Part No</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Footer Code</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cards.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  {searchQuery
                    ? "No Production Kanban cards match your search."
                    : "No Production Kanban cards found."}
                </TableCell>
              </TableRow>
            ) : (
              cards.map((card) => {
                const hasPdf =
                  selectedPdfFormat === DEFAULT_PRODUCTION_KANBAN_PDF_FORMAT &&
                  (Boolean(card.pdf_storage_path) ||
                    generatedPdfCardIds.has(card.id));
                const isSelected = selectedCardIds.has(card.id);

                return (
                  <TableRow
                    key={card.id}
                    data-state={isSelected ? "selected" : undefined}
                  >
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
                    <TableCell className="max-w-[240px] truncate">
                      {card.description || (
                        <span className="italic text-muted-foreground">
                          No description
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{card.location}</TableCell>
                    <TableCell>{card.footer_code || "-"}</TableCell>
                    <TableCell>
                      {card.updated_at
                        ? new Date(card.updated_at).toLocaleDateString()
                        : "-"}
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
                            <Link href={`/dashboard/production-kanban/${card.id}`}>
                              <Eye className="mr-2 h-4 w-4" />
                              View
                            </Link>
                          </DropdownMenuItem>
                          {userRole !== "viewer" && (
                            <DropdownMenuItem asChild>
                              <Link
                                href={`/dashboard/production-kanban/${card.id}/edit`}
                              >
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
                                {selectedPdfFormat ===
                                DEFAULT_PRODUCTION_KANBAN_PDF_FORMAT
                                  ? "Generate PDF"
                                  : "Generate & Download"}
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
                          {userRole !== "viewer" && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onSelect={(event) => event.preventDefault()}
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
                                    This will permanently delete the Production
                                    Kanban for <strong>{card.part_no}</strong>.
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
                                    {isDeleting === card.id ? "Deleting..." : "Delete"}
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
