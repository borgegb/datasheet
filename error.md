# Supabase Edge Function Local File Access Issue

## Problem Description

The Supabase Edge Function `generate-datasheet` fails during local development (using `supabase start`) when attempting to load local font and image assets required for PDF generation. This occurs specifically when the function is invoked by the frontend (e.g., for a PDF preview).

The frontend receives a 500 Internal Server Error, and the Docker logs for the `supabase_edge_runtime_datasheetgenerator` container show a `NotFound` error originating from `Deno.readFile`. This indicates that the Deno runtime within the Docker container cannot find the specified asset files (fonts, logo) at the paths provided in the function code.

## Environment

- **Framework:** Next.js (App Router)
- **Backend:** Supabase (including Edge Functions)
- **Local Development:** `supabase start` (using Docker)
- **Operating System:** macOS (Host)

## Goal

The `generate-datasheet` function needs to:

1.  Load custom font files (`.ttf`) located in the shared function directory.
2.  Load a logo image file (`.jpg`) located in the shared function directory.
3.  Embed these assets into a PDF document using the `pdf-lib` library.

## Relevant File Structure

```
datasheetgenerator/
├── app/
│   └── dashboard/
│       └── generator/
│           └── DatasheetGeneratorForm.tsx  (Frontend component invoking the function)
├── supabase/
│   ├── functions/
│   │   ├── _shared/
│   │   │   ├── assets/
│   │   │   │   └── Appliedlogo.jpg         (Logo file)
│   │   │   └── fonts/
│   │   │       ├── Inter-Regular.ttf       (Font file)
│   │   │       └── Poppins-Bold.ttf        (Font file)
│   │   └── generate-datasheet/
│   │       └── index.ts                    (Edge Function code)
│   └── ... (other supabase config)
└── ... (other project files)
```

## Troubleshooting Steps Taken

1.  **Verified File Existence:** Confirmed that the font files and logo file exist at the specified paths within the `supabase/functions/_shared/` directory on the host machine.
2.  **Used Docker Logs:** Monitored the output of the Edge Function container using `docker logs -f supabase_edge_runtime_datasheetgenerator`.
3.  **Added Console Logging:** Added `console.log` statements within `index.ts` to trace execution flow and inspect resolved paths.
4.  **Path Attempt 1 (Relative with `new URL`):**
    - Code: `await Deno.readFile(new URL("../_shared/fonts/Poppins-Bold.ttf", import.meta.url).pathname);`
    - Result: `NotFound` error in Docker logs, showing the _host's_ absolute path (e.g., `/Users/borgeblikeng/.../Poppins-Bold.ttf`), which is inaccessible from within the container.
5.  **Path Attempt 2 (Direct Relative):**
    - Code: `await Deno.readFile("../_shared/fonts/Poppins-Bold.ttf");`
    - Result: Same `NotFound` error as Attempt 1, still resolving strangely to the host path in the error message.
6.  **Path Attempt 3 (Assumed Absolute Container Path):**
    - Code: `await Deno.readFile("/home/deno/functions/_shared/fonts/Poppins-Bold.ttf");`
    - Result: (User to report if this attempt was fully tested and what the outcome was). _Assuming this also failed based on the request for this summary._

## Error Log Example (from Attempt 2)

```
[Error] Error loading custom fonts: NotFound: path not found: /Users/borgeblikeng/Developer/Upwork/datasheetgenerator/supabase/functions/_shared/fonts/Poppins-Bold.ttf: readfile '../_shared/fonts/Poppins-Bold.ttf'
    at Object.readFile (ext:deno_fs/30_fs.js:848:24)
    at Server.<anonymous> (file:///Users/borgeblikeng/Developer/Upwork/datasheetgenerator/supabase/functions/generate-datasheet/index.ts:123:41)
    at eventLoopTick (ext:core/01_core.js:168:7)
    at async #respond (https://deno.land/std@0.177.0/http/server.ts:220:18) {
  name: "NotFound",
  code: "ENOENT"
}

[Error] Error processing request: Failed to load required fonts: path not found: /Users/borgeblikeng/Developer/Upwork/datasheetgenerator/supabase/functions/_shared/fonts/Poppins-Bold.ttf: readfile '../_shared/fonts/Poppins-Bold.ttf' Error: Failed to load required fonts: path not found: /Users/borgeblikeng/Developer/Upwork/datasheetgenerator/supabase/functions/_shared/fonts/Poppins-Bold.ttf: readfile '../_shared/fonts/Poppins-Bold.ttf'
    at Server.<anonymous> (file:///Users/borgeblikeng/Developer/Upwork/datasheetgenerator/supabase/functions/generate-datasheet/index.ts:129:13)
    # ... stack trace ...
```

## Relevant Code Snippets

**`supabase/functions/generate-datasheet/index.ts` (File Reading - Attempt 3 Paths)**

```typescript
// --- Load Custom Fonts ---
let poppinsBoldFontBytes: Uint8Array | null = null;
let interRegularFontBytes: Uint8Array | null = null;
try {
  // --- Attempt using absolute container paths ---
  poppinsBoldFontBytes = await Deno.readFile(
    "/home/deno/functions/_shared/fonts/Poppins-Bold.ttf"
  );
  interRegularFontBytes = await Deno.readFile(
    "/home/deno/functions/_shared/fonts/Inter-Regular.ttf"
  );

  console.log("Custom fonts loaded successfully.");
} catch (fontError: any) {
  console.error("Error loading custom fonts:", fontError);
  throw new Error(`Failed to load required fonts: ${fontError.message}`);
}
// ---                   ---

// --- Load Logo ---
let logoImageBytes: Uint8Array | null = null;
let logoImage: PDFImage | null = null;
let logoDims = { width: 0, height: 0 };
try {
  // --- Attempt using absolute container paths ---
  logoImageBytes = await Deno.readFile(
    "/home/deno/functions/_shared/assets/Appliedlogo.jpg"
  );

  console.log("Logo image file read.");
} catch (logoError: any) {
  console.error("Error loading logo image:", logoError);
  // Continue without logo
}
// ---           ---

// ... rest of function ...
```

**`app/dashboard/generator/DatasheetGeneratorForm.tsx` (Preview Handler)**

```typescript
const handlePreview = async () => {
  if (isPreviewing || isGenerating || !user) {
    toast.error("Cannot preview: Please wait or ensure user is loaded.");
    return;
  }

  setIsPreviewing(true);
  toast.info("Generating preview...", { id: "preview-toast" });

  const supabase = createClient();
  // Gather current form data for preview
  const previewData = {
    isPreview: true,
    productTitle,
    productCode,
    description,
    keyFeatures,
    techSpecs,
    weight,
    warranty,
    shippingInfo,
    imagePath: uploadedImagePath,
    imageOrientation,
    optionalLogos: {
      ceMark: includeCeLogo,
      origin: includeOriginLogo,
    },
    catalogCategory,
    userId: user.id,
  };

  console.log("Invoking preview function with data:", previewData);

  try {
    const { data, error } = await supabase.functions.invoke(
      "generate-datasheet",
      { body: previewData }
    );

    if (error) {
      throw new Error(error.message);
    }

    if (data.error) {
      throw new Error(data.error);
    }

    if (data.success && data.pdfData) {
      // Decode base64 and open in new tab
      const pdfBlob = await fetch(
        `data:application/pdf;base64,${data.pdfData}`
      ).then((res) => res.blob());
      const dataUrl = URL.createObjectURL(pdfBlob);
      window.open(dataUrl, "_blank");
      URL.revokeObjectURL(dataUrl); // Clean up the object URL after opening
      toast.success("Preview generated!", { id: "preview-toast" });
    } else {
      throw new Error(
        "Preview function returned unexpected or incomplete data."
      );
    }
  } catch (previewError: any) {
    console.error("Preview Error:", previewError);
    toast.error(`Preview failed: ${previewError.message}`, {
      id: "preview-toast",
    });
  } finally {
    setIsPreviewing(false);
  }
};
```

## Question for Expert

Why is the Deno runtime within the Supabase Edge Function Docker container (`supabase/edge-runtime`) failing to find files located within the shared function directories (`supabase/functions/_shared/...`) when using `Deno.readFile` during local development via `supabase start`?

- The error messages consistently show `NotFound`, but confusingly reference the _host machine's_ absolute path, even when relative paths are used in the code.
- Is there a specific Docker volume mounting configuration missed by `supabase start` for shared files?
- Is there a different Deno API or path resolution method required to reliably access these shared assets from within the container in this local setup?
- How should file paths for shared assets be specified in `Deno.readFile` to work correctly within the local Supabase Edge Function container?
