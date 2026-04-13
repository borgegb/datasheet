"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { printPdfFromUrl } from "@/lib/client/print-pdf";
import {
  DEFAULT_PRODUCTION_KANBAN_PDF_FORMAT,
  getProductionKanbanPdfFormatLabel,
  getProductionKanbanPdfFormatToken,
  normalizeProductionKanbanPdfFormat,
  PRODUCTION_KANBAN_PDF_FORMAT_OPTIONS,
  type ProductionKanbanPdfFormat,
} from "@/lib/production-kanban/pdf-format";

interface ProductionKanbanActionsProps {
  cardId: string;
  partNo: string;
  hasPdf: boolean;
}

export default function ProductionKanbanActions({
  cardId,
  partNo,
  hasPdf,
}: ProductionKanbanActionsProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPdfFormat, setSelectedPdfFormat] =
    useState<ProductionKanbanPdfFormat>(DEFAULT_PRODUCTION_KANBAN_PDF_FORMAT);
  const selectedPdfFormatLabel =
    getProductionKanbanPdfFormatLabel(selectedPdfFormat);
  const hasSelectedFormatPdf =
    selectedPdfFormat === DEFAULT_PRODUCTION_KANBAN_PDF_FORMAT ? hasPdf : false;

  const getPdfUrl = async (format: ProductionKanbanPdfFormat) => {
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

    if (format === DEFAULT_PRODUCTION_KANBAN_PDF_FORMAT) {
      router.refresh();
    }
    return url as string;
  };

  const handleDownloadPdf = async () => {
    setIsLoading(true);
    const toastId = toast.loading(
      `${hasSelectedFormatPdf ? "Getting" : "Generating"} ${selectedPdfFormatLabel} PDF for "${partNo}"...`
    );

    try {
      const url = await getPdfUrl(selectedPdfFormat);
      window.open(url, "_blank");
      toast.success("Opening PDF", { id: toastId });
    } catch (error: any) {
      console.error("Error opening Production Kanban PDF:", error);
      toast.error(`Failed to open PDF: ${error.message}`, { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrintPdf = async () => {
    setIsLoading(true);
    const toastId = toast.loading(
      `Preparing ${selectedPdfFormatLabel} print for "${partNo}"...`
    );

    try {
      const url = await getPdfUrl(selectedPdfFormat);
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
      setIsLoading(false);
    }
  };

  return (
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

      <Button variant="outline" onClick={handleDownloadPdf} disabled={isLoading}>
        <Download className="mr-2 h-4 w-4" />
        {isLoading
          ? "Loading..."
          : hasSelectedFormatPdf
            ? "Download PDF"
            : "Generate & Download"}
      </Button>
      <Button variant="outline" onClick={handlePrintPdf} disabled={isLoading}>
        <Printer className="mr-2 h-4 w-4" />
        {isLoading
          ? "Preparing..."
          : hasSelectedFormatPdf
            ? "Print PDF"
            : "Generate & Print"}
      </Button>
    </div>
  );
}
