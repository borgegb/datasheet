# Edge Function Boot Error Report: `generate-datasheet`

## Summary

The `generate-datasheet` Supabase Edge Function is failing to boot during local development using `supabase start` and Docker. When invoked via `curl`, it returns an `HTTP 503 Service Unavailable` error with a `BOOT_ERROR` code.

The core issue appears to be that the Edge Runtime is attempting to load an older version of a dependency (`docx@0.2.0`) despite the code being updated to use a newer version (`docx@v0.4.0`). This suggests a potential caching or environment synchronization problem within the local Supabase Docker setup.

## Steps to Reproduce / Test Context

1.  Ensure Docker Desktop is running.
2.  Run `supabase stop` to ensure a clean state.
3.  Run `supabase start` to initialize the local Supabase environment.
4.  (Optional) Tail the Edge Runtime logs in a separate terminal: `docker logs -f supabase_edge_runtime_datasheetgenerator`
5.  Execute the following `curl` command to invoke the function:

    ```bash
    curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/generate-datasheet' \
      --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
      --header 'Content-Type: application/json' \
      --data '{
        "productTitle": "Local Test Title",
        "productCode": "LT-TEST",
        "description": "Testing curl invocation",
        "techSpecs": "Specs",
        "price": "$100",
        "imageUrl": null
      }'
    ```

## Observed Behavior

### 1. HTTP Response (`curl` output)

```
HTTP/1.1 503 Service Unavailable
Date: Thu, 14 Apr 2025 09:48:19 GMT # Example Date
Content-Type: application/json; charset=utf-8
Content-Length: 67
etag: W/"43-Jq3C4o1Bq+KbJFvV++F40PH/Pio"

{"code":"BOOT_ERROR","message":"Worker failed to boot (please check logs)"}
```

### 2. Edge Runtime Docker Log Error (`docker logs -f supabase_edge_runtime_datasheetgenerator`)

The critical error message seen in the Docker logs upon invoking the function is:

```
worker boot error: failed to create the graph: Module not found "https://deno.land/x/docx@0.2.0/mod.ts".
    at file:///Users/borgeblikeng/Developer/Upwork/datasheetgenerator/supabase/functions/generate-datasheet/index.ts:17:23
```

_Note: Line number might vary slightly based on exact file state._

## Relevant Code Files

### 1. `supabase/functions/generate-datasheet/index.ts` (Current State)

```typescript
// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
// import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// import "jsr:@supabase/functions-js/edge-runtime.d.ts" // Removed for now
import { corsHeaders } from "../_shared/cors.ts";

// Import generation libraries
// @deno-types="npm:pdfmake/interfaces.d.ts"
import pdfMake from "npm:pdfmake";
import * as path from "https://deno.land/std@0.177.0/path/mod.ts";
import { Buffer } from "https://deno.land/std@0.177.0/io/buffer.ts"; // For Base64 encoding
import * as docx from "https://deno.land/x/docx@v0.4.0/mod.ts"; // Basic docx creation (ATTEMPTED UPDATE TO v0.4.0)
import { encode as base64Encode } from "https://deno.land/std@0.177.0/encoding/base64.ts"; // Import Base64 encoder
import { readableStreamFromReader } from "https://deno.land/std@0.177.0/streams/readable_stream_from_reader.ts";
import { concat } from "https://deno.land/std@0.177.0/bytes/concat.ts";

// --- Define Standard Fonts for pdfmake (Essential for Edge Functions) ---
// NOTE: For more complex fonts, you'd need to fetch/include font files.
const fonts = {
  Roboto: {
    normal:
      "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf",
    bold: "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Medium.ttf",
    italics:
      "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Italic.ttf",
    bolditalics:
      "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-MediumItalic.ttf",
  },
};

const printer = new pdfMake(fonts);
// -----------------------------------------------------------------------

console.log(`Function "generate-datasheet" up and running!`);

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Parse incoming JSON data from the request body
    const {
      productTitle = "N/A", // Add default values
      productCode = "N/A",
      description = "",
      techSpecs = "",
      price = "",
      imageUrl = null, // Image handling can be added later
    } = await req.json();

    console.log("Received data:", {
      productTitle,
      productCode,
      description,
      techSpecs,
      price,
      imageUrl,
    });

    // --- PDF Generation (pdfmake) ---
    const docDefinition = {
      content: [
        { text: productTitle, style: "header" },
        { text: `Product Code: ${productCode}`, style: "subheader" },
        { text: `Price: ${price}`, style: "subheader" },
        { text: "Description", style: "sectionHeader" },
        description,
        { text: "Technical Specifications", style: "sectionHeader" },
        techSpecs,
        // TODO: Add image handling if imageUrl is provided
      ],
      styles: {
        header: {
          fontSize: 18,
          bold: true,
          margin: [0, 0, 0, 10] as [number, number, number, number],
        },
        subheader: {
          fontSize: 14,
          bold: true,
          margin: [0, 5, 0, 5] as [number, number, number, number],
        },
        sectionHeader: {
          fontSize: 12,
          bold: true,
          margin: [0, 15, 0, 5] as [number, number, number, number],
        },
      },
    };

    const pdfDoc = printer.createPdfKitDocument(docDefinition);

    // Get PDF chunks using Promise
    const pdfUint8Array = await new Promise<Uint8Array>((resolve, reject) => {
      const chunks: Uint8Array[] = [];
      pdfDoc.on("data", (chunk: Uint8Array) => chunks.push(chunk));
      pdfDoc.on("end", () => resolve(concat(chunks)));
      pdfDoc.on("error", reject);
      pdfDoc.end();
    });

    // Encode the final Uint8Array to Base64
    const pdfBase64 = base64Encode(pdfUint8Array);
    console.log(
      "PDF generated successfully (Base64 length:",
      pdfBase64.length,
      ")"
    );
    // ---------------------------------

    // --- DOCX Generation (deno-docx) ---
    const doc = new docx.Document({
      sections: [
        {
          properties: {},
          children: [
            new docx.Paragraph({
              text: productTitle,
              heading: docx.HeadingLevel.HEADING_1,
            }),
            new docx.Paragraph({
              text: `Product Code: ${productCode}`,
              style: "IntenseQuote",
            }), // Example style
            new docx.Paragraph({
              text: `Price: ${price}`,
              style: "IntenseQuote",
            }),
            new docx.Paragraph({
              text: "Description",
              heading: docx.HeadingLevel.HEADING_2,
            }),
            new docx.Paragraph(description || ""),
            new docx.Paragraph({
              text: "Technical Specifications",
              heading: docx.HeadingLevel.HEADING_2,
            }),
            new docx.Paragraph(techSpecs || ""),
            // TODO: Add image handling for DOCX if possible with this library
          ],
        },
      ],
    });

    const docxBuffer = await docx.Packer.toBuffer(doc);
    // Encode the Uint8Array to Base64
    const wordBase64 = base64Encode(docxBuffer);
    console.log(
      "DOCX generated successfully (Base64 length:",
      wordBase64.length,
      ")"
    );
    // ---------------------------------

    return new Response(
      JSON.stringify({ pdfData: pdfBase64, wordData: wordBase64 }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error(
      "Error processing request:",
      error instanceof Error ? error.message : error,
      error?.stack
    );
    const errorMessage =
      error instanceof Error
        ? error.message
        : "An unknown error occurred generating documents";
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
```

_Note: There was a minor correction needed in the `docx.Document` constructor call (`sections: [...]` was added)._
_(Also includes fixes for previously mentioned unused imports)_

### 2. `supabase/functions/_shared/cors.ts`

```typescript
// supabase/functions/_shared/cors.ts
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // Allow requests from any origin (adjust for production!)
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
```

### 3. `supabase/import_map.json`

```json
{
  "imports": {
    "pdfmake": "npm:pdfmake@0.2.7",
    "pdfmake/interfaces.d.ts": "npm:pdfmake@0.2.7/interfaces.d.ts"
  }
}
```

## Troubleshooting Attempts

1.  **Verified Imports:** Confirmed standard Deno library imports are correct.
2.  **Updated `docx` Version:** Changed the import URL for `deno-docx` from `v0.2.0` to `v0.4.0` in `index.ts` and saved the file.
3.  **Clean Restart:** Used `supabase stop` followed by `supabase start` multiple times to restart the local environment.
4.  **Force Container Removal:** Manually stopped and removed the `supabase_edge_runtime_datasheetgenerator` Docker container (`docker stop`/`docker rm -f`) before running `supabase start` again.

## Conclusion / Hypothesis

Despite the code in `index.ts` clearly referencing `docx@v0.4.0` and multiple attempts to restart/reset the local environment (including removing the container), the runtime logs consistently show it failing to find `docx@0.2.0`. This strongly indicates that the local Supabase Edge Runtime is not picking up the latest saved version of the `index.ts` file, likely due to a caching issue or a file synchronization problem within the Docker volume mounts used by the Supabase CLI.

## Next Steps

- Update Supabase CLI to the latest version (`supabase upgrade`). Older versions might have bugs related to function syncing/caching.
- Investigate Docker volume caching or potential file permission issues.
- As a workaround, deploy the function (`supabase functions deploy generate-datasheet --no-verify-jwt --import-map ./supabase/import_map.json`) and test against the deployed version instead of locally.
