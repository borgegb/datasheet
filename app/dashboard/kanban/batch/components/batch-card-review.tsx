"use client";

/* Uploaded images are local blob URLs; no image transformation is needed. */
/* eslint-disable @next/next/no-img-element */

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Download,
  ImageOff,
  Pencil,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import KanbanCardPreview from "../../components/KanbanCardPreview";
import type { AssessedRow } from "./import-grid";

const ACTIONS = { create: "Create card", update: "Update card", skip: "Skip" };
const PAGE_SIZE = 20;
type ReviewFilter = "all" | "create" | "update" | "skip" | "missing" | "errors";

export function BatchCardReview({
  items,
  fileName,
  back,
  edit,
  exportBatch,
  exporting,
  error,
  message,
  children,
}: {
  items: AssessedRow[];
  fileName: string;
  back: () => void;
  edit: (id: string) => void;
  exportBatch: () => void;
  exporting: boolean;
  error: string;
  message: string;
  children?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const term = useDeferredValue(query.trim().toLowerCase());
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [selectedId, setSelectedId] = useState(items[0]?.row.id);
  const [page, setPage] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const cardList = useRef<HTMLDivElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const counts = useMemo(
    () => ({
      create: items.filter((i) => i.row.decision === "create").length,
      update: items.filter((i) => i.row.decision === "update").length,
      skip: items.filter((i) => i.row.decision === "skip").length,
      missing: items.filter((i) => i.warnings.length).length,
      errors: items.filter((i) => i.errors.length && i.row.decision !== "skip")
        .length,
    }),
    [items],
  );
  const filtered = useMemo(
    () =>
      items.filter(
        (i) =>
          (!term ||
            [
              i.row.part_no,
              i.row.description,
              i.row.location,
              i.row.preferred_supplier,
            ].some((v) => v.toLowerCase().includes(term))) &&
          (filter === "all" ||
            (filter === "missing"
              ? i.warnings.length > 0
              : filter === "errors"
                ? i.errors.length > 0 && i.row.decision !== "skip"
                : i.row.decision === filter)),
      ),
    [items, term, filter],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  useEffect(() => {
    if (cardList.current) cardList.current.scrollTop = 0;
  }, [currentPage, filter, term]);
  const visible = filtered.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );
  const selected = visible.find((i) => i.row.id === selectedId) ?? visible[0];
  const selectedIndex = selected ? filtered.indexOf(selected) : -1;
  function selectAt(index: number) {
    if (!filtered[index]) return;
    setSelectedId(filtered[index].row.id);
    setPage(Math.floor(index / PAGE_SIZE));
  }
  return (
    <section className="min-w-0 space-y-6" aria-labelledby="batch-review-title">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Button variant="ghost" className="mb-3 -ml-3" onClick={back}>
            <ArrowLeft /> Back to table
          </Button>
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Step 3 · Review cards
          </p>
          <h1
            ref={heading}
            tabIndex={-1}
            id="batch-review-title"
            className="text-3xl font-semibold tracking-tight outline-none"
          >
            Review your cards
          </h1>
          <p className="mt-2 break-words text-sm text-muted-foreground">
            {fileName} · All {items.length} rows, including those hidden by
            table filters.
          </p>
        </div>
        <Button
          className="mt-3"
          onClick={exportBatch}
          disabled={
            exporting ||
            counts.errors > 0 ||
            counts.create + counts.update === 0
          }
        >
          <Download /> {exporting ? "Exporting…" : "Export reviewed batch"}
        </Button>
      </header>
      <div className="grid grid-cols-3 gap-3">
        {(["create", "update", "skip"] as const).map((action) => (
          <button
            key={action}
            onClick={() => {
              setFilter(filter === action ? "all" : action);
              setPage(0);
            }}
            aria-pressed={filter === action}
            className={cn(
              "rounded-xl border p-4 text-left transition-colors hover:bg-muted/40",
              filter === action &&
                "border-blue-500 bg-blue-50/40 dark:bg-blue-950/20",
            )}
          >
            <span className="block text-xs text-muted-foreground">
              {action === "create"
                ? "New cards"
                : action === "update"
                  ? "Cards to update"
                  : "Skipped rows"}
            </span>
            <span className="mt-1 block text-2xl font-semibold">
              {counts[action]}
            </span>
          </button>
        ))}
      </div>
      {message && (
        <p role="status" className="rounded-lg border p-3 text-sm">
          {message}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside
          className="min-w-0 overflow-hidden rounded-xl border bg-background"
          aria-label="Cards in this batch"
        >
          <div className="space-y-3 border-b p-4">
            <label className="flex items-center gap-2 rounded-md border px-3">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                aria-label="Search review cards"
                className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
                placeholder="Part, description or supplier…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
              />
            </label>
            <NativeSelect
              aria-label="Filter review cards"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value as ReviewFilter);
                setPage(0);
              }}
              className="h-10 w-full rounded-md border bg-background pl-3 pr-10 text-sm"
            >
              <option value="all">All rows ({items.length})</option>
              <option value="create">Create ({counts.create})</option>
              <option value="update">Update ({counts.update})</option>
              <option value="skip">Skipped ({counts.skip})</option>
              <option value="missing">
                Missing details ({counts.missing})
              </option>
              <option value="errors">Needs fixing ({counts.errors})</option>
            </NativeSelect>
            <p role="status" className="text-xs text-muted-foreground">
              {filtered.length} rows in this view
            </p>
          </div>
          <div
            ref={cardList}
            className="max-h-[480px] overflow-y-auto overscroll-contain lg:max-h-[650px]"
          >
            {visible.map((item) => (
              <button
                key={item.row.id}
                aria-current={
                  selected?.row.id === item.row.id ? "true" : undefined
                }
                onClick={() => setSelectedId(item.row.id)}
                className={cn(
                  "flex w-full gap-3 border-b p-4 text-left hover:bg-muted/40",
                  selected?.row.id === item.row.id &&
                    "bg-blue-50 ring-2 ring-inset ring-blue-500 dark:bg-blue-950/30",
                )}
              >
                <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white">
                  {item.row.image ? (
                    <img
                      src={item.row.image.url}
                      alt=""
                      loading="lazy"
                      className="size-full object-contain"
                    />
                  ) : (
                    <ImageOff className="size-5 text-gray-400" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-semibold">
                    {item.row.part_no || "Missing part number"}
                  </span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {item.row.description || "No description"}
                  </span>
                  <span className="mt-1 block break-words text-xs text-muted-foreground">
                    {item.row.location || "No location"}
                  </span>
                  <span className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                    <span className="rounded bg-muted px-1.5 py-0.5">
                      {ACTIONS[item.row.decision]}
                    </span>
                    {item.errors.length > 0 && item.row.decision !== "skip" ? (
                      <span className="text-destructive">Needs fixing</span>
                    ) : item.warnings.length > 0 ? (
                      <span className="text-muted-foreground">
                        {item.warnings.length} missing details
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            ))}
            {!visible.length && (
              <p className="p-6 text-sm text-muted-foreground">
                No cards match these filters. Try another search or choose All
                rows.
              </p>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 p-3 text-xs text-muted-foreground">
            <Button
              size="icon"
              variant="outline"
              aria-label="Previous review list page"
              disabled={!currentPage}
              onClick={() => selectAt((currentPage - 1) * PAGE_SIZE)}
            >
              <ChevronLeft />
            </Button>
            <span>
              Page {currentPage + 1} of {pageCount}
            </span>
            <Button
              size="icon"
              variant="outline"
              aria-label="Next review list page"
              disabled={currentPage + 1 >= pageCount}
              onClick={() => selectAt((currentPage + 1) * PAGE_SIZE)}
            >
              <ChevronRight />
            </Button>
          </div>
        </aside>
        {selected ? (
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="break-all text-lg font-semibold">
                  {selected.row.part_no || "Untitled card"}
                </h2>
                <p className="text-xs text-muted-foreground">
                  Source row {selected.row.sourceRow} ·{" "}
                  {ACTIONS[selected.row.decision]}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Previous card"
                  disabled={selectedIndex <= 0}
                  onClick={() => selectAt(selectedIndex - 1)}
                >
                  <ChevronLeft />
                </Button>
                <span className="text-xs text-muted-foreground">
                  {selectedIndex + 1} / {filtered.length}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Next card"
                  disabled={selectedIndex >= filtered.length - 1}
                  onClick={() => selectAt(selectedIndex + 1)}
                >
                  <ChevronRight />
                </Button>
                <Button variant="outline" onClick={() => edit(selected.row.id)}>
                  <Pencil /> Edit card
                </Button>
              </div>
            </div>
            <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_240px]">
              <div className="min-w-0 rounded-xl border bg-muted/25 p-4 sm:p-6">
                <div
                  aria-label={`Content preview of ${selected.row.part_no}`}
                  className="text-black"
                >
                  <KanbanCardPreview
                    card={{
                      part_no: selected.row.part_no,
                      description: selected.row.description,
                      location: selected.row.location,
                      order_quantity: selected.row.order_quantity,
                      preferred_supplier: selected.row.preferred_supplier,
                      lead_time: selected.row.lead_time,
                      header_color: selected.row.header_color,
                      signedImageUrl: selected.row.image?.url,
                    }}
                  />
                </div>
                <p className="mx-auto mt-4 max-w-lg text-xs leading-relaxed text-muted-foreground">
                  Content preview · Check the image and full text here. Printed
                  sizing and page breaks may differ in the generated PDF.
                </p>
              </div>
              <div className="space-y-4 text-sm">
                <section className="rounded-xl border p-4">
                  <h3 className="font-semibold">Planned action</h3>
                  <p className="mt-2 text-muted-foreground">
                    {selected.row.decision === "skip"
                      ? "This row is excluded from the import."
                      : selected.row.decision === "update"
                        ? "Update the existing card selected in row details."
                        : "Create a new Kanban card from these details."}
                  </p>
                  {selected.matches.cards.length > 0 && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      {selected.matches.cards.length} existing card(s) share
                      this part number. Check location and colour before
                      creating another.
                    </p>
                  )}
                  {selected.matches.products.length > 0 && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      {selected.matches.products.length} catalogue product
                      match(es).
                    </p>
                  )}
                  <button
                    className="mt-3 inline-flex items-center gap-1 text-xs font-medium underline underline-offset-4"
                    onClick={() => edit(selected.row.id)}
                  >
                    Review action and matches <ArrowRight className="size-3" />
                  </button>
                </section>
                <section className="rounded-xl border p-4">
                  <h3 className="font-semibold">Details to check</h3>
                  {selected.errors.length + selected.warnings.length ? (
                    <ul className="mt-3 space-y-2 text-xs leading-relaxed">
                      {selected.errors.map((e) => (
                        <li key={e} className="text-destructive">
                          {e}
                        </li>
                      ))}
                      {selected.warnings.map((w) => (
                        <li key={w} className="text-muted-foreground">
                          {w}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      All expected details supplied.
                    </p>
                  )}
                  {selected.warnings.length > 0 && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Optional details can remain blank.
                    </p>
                  )}
                </section>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
            Choose a different filter to preview a card.
          </div>
        )}
      </div>
      <footer className="space-y-4 border-t pt-5">
        <p className="text-sm text-muted-foreground">
          {counts.create + counts.update} included · {counts.skip} skipped.
          Full-batch saving is not enabled yet. Export the reviewed spreadsheet,
          actions and supplied images to keep your work.
        </p>
        {counts.errors > 0 && (
          <p role="alert" className="text-sm text-destructive">
            {counts.errors} included rows need fixing before export.
          </p>
        )}
        {children}
      </footer>
    </section>
  );
}
