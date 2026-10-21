"use client";

import { useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import type { ImportRow } from "@/lib/kanban/import-model";

type SavedCard = { id: string; part_no: string };
export type TestImportSession = {
  form: FormData;
  sourceParts: string[];
  cards?: SavedCard[];
  pdfs: Record<string, string>;
};

export function TestImportPanel({ rows, session }: {
  rows: ImportRow[];
  session: RefObject<TestImportSession | null>;
}) {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const [, refresh] = useState(0);
  const sample = rows.slice(0, 3);
  const saved = session.current;

  async function confirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (!session.current) {
        if (!sample.length) return;
        if (sample.reduce((sum, row) => sum + (row.image?.blob.size ?? 0), 0) > 3_000_000)
          throw new Error("Choose test rows whose images total less than 3 MB.");
        const form = new FormData();
        form.set("payload", JSON.stringify({
          batchId: crypto.randomUUID(),
          rows: sample.map(row => ({
            part_no: row.part_no, description: row.description, location: row.location,
            preferred_supplier: row.preferred_supplier, order_quantity: row.order_quantity,
            lead_time: row.lead_time, header_color: row.header_color,
          })),
        }));
        sample.forEach((row, i) => {
          if (row.image) form.set(`image${i}`, row.image.blob, row.image.name);
        });
        // Keep the exact request for retries, even if the dialog closes or rows change.
        session.current = { form, sourceParts: sample.map(row => row.part_no), pdfs: {} };
      }
      const current = session.current;
      if (!current.cards) {
        const response = await fetch("/api/kanban-import-test", { method: "POST", body: current.form });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Test import failed. Retry the same test.");
        current.cards = result.cards;
        refresh(n => n + 1);
      }
      for (const card of current.cards!) {
        if (current.pdfs[card.id]) continue;
        const response = await fetch("/api/generate-kanban-pdf", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kanbanCardIds: [card.id] }),
        });
        const result = await response.json();
        if (!response.ok || !result.url)
          throw new Error("The test cards are saved, but a PDF failed. Retry PDFs to finish without creating more cards.");
        current.pdfs[card.id] = result.url;
        refresh(n => n + 1);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Test failed. Retry the same test.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const complete = !!saved?.cards?.length && saved.cards.every(card => saved.pdfs[card.id]);
  return (
    <section className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/40 p-4 text-sm dark:border-blue-900 dark:bg-blue-950/20">
      <h3 className="font-semibold">Small test import</h3>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Save up to three labelled TEST-IMPORT card copies and generate their PDFs.
        Existing cards and catalogue products stay unchanged. Blank quantities stay blank.
        Select rows in the table to choose the sample; otherwise the first three included rows are used.
      </p>
      <p className="break-words text-xs">Test copies of: {(saved?.sourceParts ?? sample.map(row => row.part_no)).join(", ") || "No valid rows selected"}</p>
      {saved?.cards && (
        <div role="status" className="space-y-2">
          <p>{saved.cards.length} test cards saved · {Object.keys(saved.pdfs).length} PDFs ready</p>
          {saved.cards.map(card => (
            <div key={card.id} className="flex flex-wrap gap-3 text-xs">
              <a className="underline" href={`/dashboard/kanban/${card.id}`} target="_blank" rel="noreferrer">{card.part_no}</a>
              {saved.pdfs[card.id] && <a className="underline" href={saved.pdfs[card.id]} target="_blank" rel="noreferrer">View PDF</a>}
            </div>
          ))}
          <p className="text-xs text-muted-foreground">You can delete these labelled copies from Kanban cards after checking them.</p>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <Button onClick={confirm} disabled={busy || complete || (!saved && !sample.length)}>
        {busy ? "Saving test cards and PDFs…" : complete ? "Test import complete" : saved?.cards ? "Retry PDFs" : saved ? "Retry same test import" : "Confirm test import"}
      </Button>
    </section>
  );
}
