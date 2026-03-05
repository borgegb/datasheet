function ensureBrowser(): void {
  if (typeof window === "undefined") {
    throw new Error("Printing is only available in the browser.");
  }
}

export async function printPdfBlob(
  blob: Blob,
  fileName = "document.pdf"
): Promise<void> {
  ensureBrowser();

  const pdfUrl = URL.createObjectURL(blob);
  const printWindow = window.open(pdfUrl, "_blank");

  if (!printWindow) {
    URL.revokeObjectURL(pdfUrl);
    throw new Error("Pop-up blocked. Please allow pop-ups and try again.");
  }

  const cleanup = () => {
    URL.revokeObjectURL(pdfUrl);
  };

  printWindow.addEventListener("beforeunload", cleanup, { once: true });

  const tryPrint = () => {
    try {
      printWindow.document.title = fileName;
      printWindow.focus();
      printWindow.print();
    } catch (error) {
      console.error("Print attempt failed:", error);
    }
  };

  printWindow.addEventListener(
    "load",
    () => {
      window.setTimeout(tryPrint, 350);
    },
    { once: true }
  );

  // Fallback in case the PDF viewer does not trigger a reliable load event.
  window.setTimeout(tryPrint, 1200);
}

export async function printPdfFromUrl(
  pdfUrl: string,
  fileName = "document.pdf"
): Promise<void> {
  ensureBrowser();

  const response = await fetch(pdfUrl);
  if (!response.ok) {
    throw new Error(`Failed to load PDF for printing (${response.status}).`);
  }

  const blob = await response.blob();
  await printPdfBlob(blob, fileName);
}
