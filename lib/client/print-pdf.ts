function ensureBrowser(): void {
  if (typeof window === "undefined") {
    throw new Error("Printing is only available in the browser.");
  }
}

function openPdfPopup(
  fileName = "document.pdf",
  loadingMessage = "Preparing PDF..."
): Window {
  ensureBrowser();

  const popupWindow = window.open("", "_blank");
  if (!popupWindow) {
    throw new Error("Pop-up blocked. Please allow pop-ups and try again.");
  }

  popupWindow.document.title = fileName;
  popupWindow.document.body.innerHTML = `
    <div style="font-family: sans-serif; padding: 24px; color: #111827;">
      ${loadingMessage}
    </div>
  `;

  return popupWindow;
}

export async function printPdfBlob(
  blob: Blob,
  fileName = "document.pdf",
  popupWindow?: Window | null
): Promise<void> {
  ensureBrowser();

  const pdfUrl = URL.createObjectURL(blob);
  const printWindow = popupWindow ?? openPdfPopup(fileName);

  if (printWindow.closed) {
    URL.revokeObjectURL(pdfUrl);
    throw new Error("Print window was closed before the PDF could open.");
  }

  const cleanup = () => {
    URL.revokeObjectURL(pdfUrl);
  };

  printWindow.location.href = pdfUrl;
  printWindow.addEventListener("beforeunload", cleanup, { once: true });

  let didStartPrint = false;
  let fallbackTimeoutId: number | null = null;

  const tryPrint = () => {
    if (didStartPrint || printWindow.closed) {
      return;
    }

    didStartPrint = true;

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
      if (fallbackTimeoutId !== null) {
        window.clearTimeout(fallbackTimeoutId);
      }
      window.setTimeout(tryPrint, 350);
    },
    { once: true }
  );

  // Fallback in case the PDF viewer does not trigger a reliable load event.
  fallbackTimeoutId = window.setTimeout(tryPrint, 1200);
}

export async function printPdfFromUrl(
  pdfUrl: string,
  fileName = "document.pdf"
): Promise<void> {
  ensureBrowser();
  const printWindow = openPdfPopup(fileName);

  try {
    const response = await fetch(pdfUrl);
    if (!response.ok) {
      throw new Error(`Failed to load PDF for printing (${response.status}).`);
    }

    const blob = await response.blob();
    await printPdfBlob(blob, fileName, printWindow);
  } catch (error) {
    if (!printWindow.closed) {
      printWindow.close();
    }
    throw error;
  }
}

export async function downloadPdfFromUrl(
  pdfUrl: string,
  fileName = "document.pdf"
): Promise<void> {
  ensureBrowser();

  const response = await fetch(pdfUrl);
  if (!response.ok) {
    throw new Error(`Failed to load PDF for download (${response.status}).`);
  }

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
}
