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

/** Call directly from the click handler so the popup opens before any await. */
export async function printPdfFromRequest(
  url: string,
  request: RequestInit,
  fileName = "document.pdf"
): Promise<void> {
  const printWindow = openPdfPopup(fileName);

  try {
    const response = await fetch(url, request);
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || "Failed to prepare PDF for printing.");
    }
    const blob = await response.blob();
    if (printWindow.closed) {
      throw new Error("Print window was closed before the PDF could open.");
    }

    const pdfUrl = URL.createObjectURL(blob);
    const doc = printWindow.document;
    doc.body.replaceChildren();
    doc.body.style.cssText =
      "margin:0;height:100vh;display:flex;flex-direction:column;font-family:sans-serif";
    const toolbar = doc.createElement("div");
    toolbar.style.cssText =
      "padding:12px;display:flex;flex-wrap:wrap;gap:16px;align-items:center";
    const printButton = doc.createElement("button");
    printButton.textContent = "Print";
    const download = doc.createElement("a");
    download.textContent = "Download PDF";
    download.href = pdfUrl;
    download.download = fileName;
    const hint = doc.createElement("span");
    hint.textContent =
      "If printing does not start, use the PDF viewer's print button or download the PDF.";
    toolbar.append(printButton, download, hint);

    const frame = doc.createElement("iframe");
    frame.title = fileName;
    frame.style.cssText = "width:100%;flex:1;border:0";
    const print = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        // The viewer and download link remain available if automatic printing
        // is restricted by the browser's built-in PDF viewer.
      }
    };
    printButton.addEventListener("click", print);
    frame.addEventListener("load", () => printWindow.setTimeout(print, 350), {
      once: true,
    });
    frame.src = pdfUrl;
    doc.body.append(toolbar, frame);
    // Keep the wrapper open and navigate only the iframe, so this cleanup
    // cannot revoke the PDF while the initial viewer is still loading.
    printWindow.addEventListener(
      "beforeunload",
      () => URL.revokeObjectURL(pdfUrl),
      { once: true }
    );
  } catch (error) {
    if (!printWindow.closed) printWindow.close();
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
