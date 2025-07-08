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
  onPdfGenerated?: () => void;
}

export default function KanbanCardActions({
  cardId,
  partNo,
  hasPdf,
  pdfStoragePath,
  onPdfGenerated,
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
          // Show success toast with View PDF button (similar to DatasheetGeneratorForm)
          toast.success("✅ PDF generated successfully!", {
            id: toastId,
            description: "Click the button to view your generated PDF.",
            action: (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(url, "_blank")}
              >
                View PDF
              </Button>
            ),
            duration: 15000, // Keep toast longer so user can click
          });

          // Call callback to update parent state
          onPdfGenerated?.();
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
    setIsGeneratingPdf(true);
    const toastId = toast.loading(`Getting PDF for "${partNo}"...`);

    startTransition(async () => {
      try {
        // Call the same API - it will return the existing PDF
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

        if (url) {
          toast.success("Opening PDF", { id: toastId });
          // Open PDF in new tab
          window.open(url, "_blank");
        } else {
          throw new Error("PDF URL not found in response.");
        }
      } catch (error: any) {
        console.error("Error getting kanban PDF:", error);
        toast.error(`Failed to get PDF: ${error.message}`, {
          id: toastId,
        });
      } finally {
        setIsGeneratingPdf(false);
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      {hasPdf ? (
        <Button
          variant="outline"
          onClick={handleDownloadPdf}
          disabled={isGeneratingPdf}
        >
          <Download className="mr-2 h-4 w-4" />
          {isGeneratingPdf ? "Loading..." : "Download PDF"}
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
