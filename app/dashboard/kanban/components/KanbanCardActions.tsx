"use client";

import React, { useState, startTransition } from "react";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { generateKanbanCardPdf } from "../actions";

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
      const { data, error } = await generateKanbanCardPdf(cardId);

      if (error) {
        toast.error(`Failed to generate PDF: ${error}`, { id: toastId });
      } else if (data?.url) {
        toast.success("PDF generated successfully", { id: toastId });
        // Open PDF in new tab
        window.open(data.url, "_blank");
        // Refresh the page to update the PDF status
        window.location.reload();
      }

      setIsGeneratingPdf(false);
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
