"use client";

import React, { useState, startTransition } from "react";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";

interface KanbanCardActionsProps {
  cardId: string;
  partNo: string;
  hasPdf: boolean;
  pdfStoragePath?: string | null;
}

export default function KanbanCardActions({
  cardId,
  partNo,
  hasPdf,
  pdfStoragePath,
}: KanbanCardActionsProps) {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const handleGeneratePdf = async () => {
    setIsGeneratingPdf(true);
    const toastId = toast.loading(`Generating PDF for "${partNo}"...`);

    startTransition(async () => {
      try {
        // Call API directly following datasheet pattern
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
          toast.success("PDF generated successfully", { id: toastId });
          // Open PDF in new tab
          window.open(url, "_blank");
          // Refresh the page to update the PDF status
          window.location.reload();
        } else {
          throw new Error("PDF URL not found in response.");
        }
      } catch (error: any) {
        console.error("Error generating kanban PDF:", error);
        toast.error(`Failed to generate PDF: ${error.message}`, {
          id: toastId,
        });
      } finally {
        setIsGeneratingPdf(false);
      }
    });
  };

  const handleDownloadPdf = async () => {
    if (!pdfStoragePath) return;

    // TODO: Implement PDF download functionality
    // This would need a signed URL endpoint or direct storage access
    toast.info("Download functionality coming soon");
  };

  return (
    <div className="flex items-center gap-2">
      {hasPdf ? (
        <Button variant="outline" onClick={handleDownloadPdf}>
          <Download className="mr-2 h-4 w-4" />
          Download PDF
        </Button>
      ) : (
        <Button
          variant="outline"
          onClick={handleGeneratePdf}
          disabled={isGeneratingPdf}
        >
          <FileText className="mr-2 h-4 w-4" />
          {isGeneratingPdf ? "Generating..." : "Generate PDF"}
        </Button>
      )}
    </div>
  );
}
