"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { printPdfFromUrl } from "@/lib/client/print-pdf";

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

  const getPdfUrl = async () => {
    const res = await fetch("/api/generate-production-kanban-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productionKanbanCardIds: [cardId] }),
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

    router.refresh();
    return url as string;
  };

  const handleGeneratePdf = async () => {
    setIsLoading(true);
    const toastId = toast.loading(`Generating PDF for "${partNo}"...`);

    try {
      const url = await getPdfUrl();
      toast.success("Production Kanban PDF ready.", {
        id: toastId,
        description: "Click the button to view the duplex PDF.",
        action: (
          <Button variant="outline" size="sm" onClick={() => window.open(url, "_blank")}>
            View PDF
          </Button>
        ),
        duration: 15000,
      });
    } catch (error: any) {
      console.error("Error generating Production Kanban PDF:", error);
      toast.error(`Failed to generate PDF: ${error.message}`, { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    setIsLoading(true);
    const toastId = toast.loading(`Getting PDF for "${partNo}"...`);

    try {
      const url = await getPdfUrl();
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
    const toastId = toast.loading(`Preparing print for "${partNo}"...`);

    try {
      const url = await getPdfUrl();
      await printPdfFromUrl(url, `${partNo}.pdf`);
      toast.success("Print window opened.", { id: toastId });
    } catch (error: any) {
      console.error("Error printing Production Kanban PDF:", error);
      toast.error(`Failed to print PDF: ${error.message}`, { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {hasPdf ? (
        <>
          <Button variant="outline" onClick={handleDownloadPdf} disabled={isLoading}>
            <Download className="mr-2 h-4 w-4" />
            {isLoading ? "Loading..." : "Download PDF"}
          </Button>
          <Button variant="outline" onClick={handlePrintPdf} disabled={isLoading}>
            <Printer className="mr-2 h-4 w-4" />
            {isLoading ? "Preparing..." : "Print PDF"}
          </Button>
        </>
      ) : (
        <Button variant="outline" onClick={handleGeneratePdf} disabled={isLoading}>
          <FileText className="mr-2 h-4 w-4" />
          {isLoading ? "Generating..." : "Generate PDF"}
        </Button>
      )}
    </div>
  );
}
