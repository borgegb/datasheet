"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  ArrowRight,
  Check,
  CheckCheck,
  FileSpreadsheet,
  ImagePlus,
  Loader2,
  Search,
  SlidersHorizontal,
  Undo2,
  Upload,
  X,
  CircleAlert,
  Layers3,
  CopyCheck,
} from "lucide-react";
import type { RowSelectionState } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  applyDefaultDecisions,
  assessBatch,
  buildMatchIndex,
  getMatches,
  locationGroup,
  type ImportField,
  type ImportImage,
  type ImportReference,
  type ImportRow,
} from "@/lib/kanban/import-model";
import { KANBAN_ALLOWED_HEADER_COLORS } from "@/lib/kanban/colors";
import { ImportGrid, FIELD_LABELS, type RowChange } from "./import-grid";
import { ImportRowDetails } from "./import-row-details";
import { cn } from "@/lib/utils";
import { TestImportPanel, type TestImportSession } from "./test-import-panel";
import { BatchCardReview } from "./batch-card-review";

type Filter = "all" | "missing" | "matches" | "errors" | "skipped";
const selectStyle =
  "h-9 rounded-md border bg-background pl-3 pr-10 text-xs outline-blue-500";

export function KanbanImportReview({
  reference,
  demo = false,
  testImportEnabled = false,
}: {
  reference: ImportReference;
  demo?: boolean;
  testImportEnabled?: boolean;
}) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [notices, setNotices] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [location, setLocation] = useState("all");
  const [filter, setFilter] = useState<Filter>("all");
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [detailId, setDetailId] = useState<string>();
  const [history, setHistory] = useState<ImportRow[][]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkField, setBulkField] = useState<ImportField>("lead_time");
  const [bulkValue, setBulkValue] = useState("");
  const [onlyEmpty, setOnlyEmpty] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const testSession = useRef<TestImportSession | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);
  const rowsRef = useRef(rows);
  const index = useMemo(() => buildMatchIndex(reference), [reference]);
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  useEffect(
    () => () => {
      urls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );
  useEffect(() => {
    if (!rows.length) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [rows.length]);

  // Inline edits, paste, image replacement and bulk changes share one commit path.
  const change = useCallback((changes: RowChange[]) => {
    const patches = new Map(changes.map((c) => [c.id, c.patch]));
    const previous = rowsRef.current;
    const next = previous.map((row) => {
      const patch = patches.get(row.id);
      if (!patch) return row;
      const updated = { ...row, ...patch };
      if (
        (patch.part_no !== undefined && patch.part_no !== row.part_no) ||
        (patch.location !== undefined && patch.location !== row.location)
      ) {
        updated.decision = getMatches(updated, indexRef.current).cards.length
          ? "skip"
          : "create";
        updated.targetId = undefined;
      }
      return updated;
    });
    setHistory((h) => [...h.slice(-9), previous]);
    rowsRef.current = next;
    setRows(next);
  }, []);
  const undo = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    rowsRef.current = previous;
    setRows(previous);
    setHistory((h) => h.slice(0, -1));
    setMessage("Last change undone.");
  };
  const assessed = useMemo(() => assessBatch(rows, index), [rows, index]);
  const counts = useMemo(
    () => ({
      all: assessed.length,
      missing: assessed.filter((a) => a.warnings.length).length,
      matches: assessed.filter(
        (a) => a.matches.cards.length || a.matches.products.length,
      ).length,
      errors: assessed.filter((a) => a.errors.length).length,
      skipped: rows.filter((r) => r.decision === "skip").length,
    }),
    [assessed, rows],
  );
  const groups = useMemo(
    () =>
      [...new Set(rows.map((r) => locationGroup(r.location)))].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      ),
    [rows],
  );
  const filtered = useMemo(() => {
    const term = deferredQuery.trim().toLowerCase();
    return assessed.filter(
      (a) =>
        (location === "all" || locationGroup(a.row.location) === location) &&
        (!term ||
          [
            a.row.part_no,
            a.row.description,
            a.row.location,
            a.row.preferred_supplier,
          ].some((v) => v.toLowerCase().includes(term))) &&
        (filter === "all" ||
          (filter === "missing" && a.warnings.length > 0) ||
          (filter === "matches" &&
            !!(a.matches.cards.length || a.matches.products.length)) ||
          (filter === "errors" && a.errors.length > 0) ||
          (filter === "skipped" && a.row.decision === "skip")),
    );
  }, [assessed, deferredQuery, location, filter]);
  const selected = rows.filter((r) => selection[r.id]);
  const hiddenSelected =
    selected.length - filtered.filter((a) => selection[a.row.id]).length;
  const included = assessed.filter((a) => a.row.decision !== "skip");
  const blocked = included.filter((a) => a.errors.length > 0);
  const detail = assessed.find((a) => a.row.id === detailId);
  const reset = (
    next: ImportRow[],
    name: string,
    sheet: string,
    info: string[],
    imageUrls: string[],
  ) => {
    urls.current.forEach((url) => URL.revokeObjectURL(url));
    urls.current = imageUrls;
    const prepared = applyDefaultDecisions(next, index);
    rowsRef.current = prepared;
    setRows(prepared);
    setFileName(name);
    setSheetName(sheet);
    setNotices(info);
    setHistory([]);
    setSelection({});
    setQuery("");
    setLocation("all");
    setFilter("all");
    setDetailId(undefined);
    setMessage("");
    setError("");
  };
  const loadFile = async (file: File) => {
    if (
      rows.length &&
      !window.confirm(
        "Replace this review with a new file? Export first if you want to keep your edits.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const { parseImportFile } = await import("@/lib/kanban/import-file");
      const result = await parseImportFile(file);
      reset(
        result.rows,
        file.name,
        result.sheetName,
        result.notices,
        result.urls,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "The file could not be read.");
    } finally {
      setBusy(false);
    }
  };
  const loadSample = async () => {
    const { demoRows } = await import("@/lib/kanban/import-demo");
    reset(
      demoRows(),
      "Sample inventory.xlsx",
      "600 sample rows",
      ["Synthetic sample data for demonstrating this workflow."],
      [],
    );
  };
  const fileChanged = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void loadFile(file);
    event.target.value = "";
  };
  const makeImage = async (file: File): Promise<ImportImage> => {
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    )
      throw new Error("Choose a PNG, JPEG or WebP image smaller than 5 MB.");
    const bitmap = await createImageBitmap(file);
    bitmap.close();
    const url = URL.createObjectURL(file);
    urls.current.push(url);
    return { url, name: file.name, blob: file };
  };
  const replaceImage = async (row: ImportRow, file: File) => {
    try {
      const image = await makeImage(file);
      change([{ id: row.id, patch: { image } }]);
      setMessage(`Image updated for ${row.part_no}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The image could not be read.");
    }
  };
  const addImages = async (files: FileList) => {
    setBusy(true);
    setError("");
    try {
      const byName = new Map<string, File>();
      for (const file of Array.from(files)) {
        const key = file.name.toLowerCase();
        if (byName.has(key))
          throw new Error(
            `More than one image is named ${file.name}. Rename it before matching.`,
          );
        byName.set(key, file);
      }
      const loaded = new Map<string, ImportImage>();
      const changes: RowChange[] = [];
      for (const row of rowsRef.current) {
        const file = byName.get((row.imageName || "").toLowerCase());
        if (!file) continue;
        let image = loaded.get(file.name);
        if (!image) {
          image = await makeImage(file);
          loaded.set(file.name, image);
        }
        changes.push({ id: row.id, patch: { image } });
      }
      if (changes.length) change(changes);
      setMessage(
        `${changes.length} rows matched by Image Filename. ${files.length - loaded.size} files unmatched. Use row details to attach individual images.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Image matching failed.");
    } finally {
      setBusy(false);
    }
  };
  const exportBatch = async () => {
    setExporting(true);
    try {
      const { exportReview } = await import("@/lib/kanban/import-file");
      const blob = await exportReview(rows);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "kanban-reviewed-batch.zip";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setMessage(
        "Review exported with its spreadsheet and supplied images. No database records were changed.",
      );
      setReviewOpen(false);
    } catch {
      setError("The review could not be exported. Your edits are still here.");
    } finally {
      setExporting(false);
    }
  };
  const bulkApply = () => {
    const changes = selected
      .filter((row) => !onlyEmpty || !row[bulkField].trim())
      .map((row) => ({ id: row.id, patch: { [bulkField]: bulkValue } }));
    if (changes.length) change(changes);
    setMessage(
      `Updated ${FIELD_LABELS[bulkField].toLowerCase()} on ${changes.length} rows.`,
    );
    setBulkOpen(false);
  };

  return (
    <div className="min-w-0 space-y-5">
      {/* Keep the table mounted so review navigation preserves column widths and filters. */}
      <div hidden={reviewOpen} className="min-w-0 space-y-5">
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,.xlsm,.csv"
          className="sr-only"
          aria-label="Upload workbook"
          onChange={fileChanged}
          disabled={busy}
        />
        <input
          ref={imageInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="sr-only"
          aria-label="Upload matching images"
          onChange={(e) => {
            if (e.target.files?.length) void addImages(e.target.files);
            e.target.value = "";
          }}
          disabled={busy}
        />
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              <Layers3 className="size-3.5" /> Kanban workspace{" "}
              <span className="rounded-full border px-2 py-0.5 text-[9px] tracking-wider">
                Preview
              </span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Review your batch
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Bring in a spreadsheet. Check the details. Decide what becomes a
              card.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {rows.length > 0 && (
              <Button
                variant="outline"
                onClick={() => fileInput.current?.click()}
                disabled={busy}
              >
                <Upload /> Change file
              </Button>
            )}
            <Button
              id="open-batch-review"
              disabled={!rows.length || busy}
              onClick={() => {
                setReviewOpen(true);
                window.scrollTo(0, 0);
              }}
            >
              Review batch
              {rows.length > 0 && (
                <span className="rounded bg-white/15 px-1.5 text-xs">
                  {included.length}
                </span>
              )}
              <ArrowRight />
            </Button>
          </div>
        </header>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4 text-xs">
          <div className="flex items-center gap-4">
            <Step
              number="1"
              label="Upload"
              done={!!rows.length}
              active={!rows.length}
            />
            <span className="h-px w-6 bg-border" />
            <Step number="2" label="Review & edit" active={!!rows.length} />
            <span className="h-px w-6 bg-border" />
            <Step number="3" label="Confirm batch" />
          </div>
          <span className="text-muted-foreground">
            {demo
              ? "Demo · matches use sample records"
              : `${reference.cards.length} existing cards · ${reference.products.length} catalogue products checked`}
          </span>
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-blue-200/60 bg-blue-50/50 px-3 py-2 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-100">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {testImportEnabled
              ? "Review your batch, export your changes, or confirm a small test using up to three labelled card copies."
              : "This preview prepares a batch for review. Export your changes to keep them; database import is not enabled here."}
          </span>
        </div>
        {error && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {error}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X className="size-4" />
            </button>
          </div>
        )}
        {message && (
          <div
            role="status"
            className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs"
          >
            <span>{message}</span>
            <button aria-label="Dismiss message" onClick={() => setMessage("")}>
              <X className="size-4" />
            </button>
          </div>
        )}
        {!rows.length ? (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file && !busy) void loadFile(file);
            }}
            className="flex min-h-[400px] flex-col items-center justify-center rounded-xl border border-dashed bg-muted/15 p-8 text-center"
          >
            <div className="mb-5 flex size-16 items-center justify-center rounded-2xl border bg-background shadow-xs">
              <FileSpreadsheet className="size-7 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold">
              Start with your inventory spreadsheet
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              Drop a file here to load its rows and embedded images. You’ll be
              able to edit everything before confirming the batch.
            </p>
            <Button
              className="mt-6"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Upload />}{" "}
              {busy ? "Reading workbook…" : "Choose spreadsheet"}
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">
              Excel .xlsx / .xlsm or CSV · Up to 20 MB and 2,000 rows
            </p>
            {demo && (
              <button
                className="mt-6 text-xs font-medium underline underline-offset-4"
                onClick={loadSample}
              >
                Try a 600-row sample
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <Summary
                label="Rows in workbook"
                count={rows.length}
                sub={`${groups.length} locations`}
                icon={<FileSpreadsheet className="size-4" />}
                onClick={() => {
                  setFilter("all");
                  setLocation("all");
                  setQuery("");
                }}
              />
              <Summary
                label="Missing details"
                count={counts.missing}
                sub="Images, suppliers or card details"
                icon={<CircleAlert className="size-4 text-amber-600" />}
                onClick={() => setFilter("missing")}
              />
              <Summary
                label="Existing matches"
                count={counts.matches}
                sub="Check before making another card"
                icon={<CopyCheck className="size-4 text-blue-600" />}
                onClick={() => setFilter("matches")}
              />
              <Summary
                label="Included in batch"
                count={included.length}
                sub={`${counts.skipped} skipped · ${blocked.length} need fixing`}
                icon={<CheckCheck className="size-4 text-emerald-600" />}
                onClick={() => setReviewOpen(true)}
              />
            </div>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <FileSpreadsheet className="size-4 shrink-0 text-emerald-600" />
                  <span className="truncate text-sm font-medium">
                    {fileName}
                  </span>
                  <span className="hidden text-xs text-muted-foreground md:inline">
                    / {sheetName}
                  </span>
                  {busy && <Loader2 className="size-4 animate-spin" />}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={undo}
                    disabled={!history.length || busy}
                  >
                    <Undo2 /> Undo
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => imageInput.current?.click()}
                  >
                    <ImagePlus /> Add images
                  </Button>
                </div>
              </div>
              {notices.map((notice) => (
                <p key={notice} className="text-xs text-muted-foreground">
                  {notice}
                </p>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1">
                  {(
                    [
                      ["all", "All rows"],
                      ["missing", "Missing details"],
                      ["matches", "Matches"],
                      ["errors", "To fix"],
                      ["skipped", "Skipped"],
                    ] as [Filter, string][]
                  ).map(([key, title]) => (
                    <button
                      key={key}
                      aria-pressed={filter === key}
                      onClick={() => setFilter(key)}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium",
                        filter === key
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {title}
                      <span
                        className={cn(
                          "rounded px-1 text-[10px] tabular-nums",
                          filter === key ? "bg-background/20" : "bg-muted",
                        )}
                      >
                        {counts[key]}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
                    <input
                      aria-label="Search batch"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search this batch…"
                      className="h-9 w-48 rounded-md border bg-background pr-3 pl-8 text-xs outline-blue-500"
                    />
                  </div>
                  <NativeSelect
                    aria-label="Filter location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className={selectStyle}
                  >
                    <option value="all">All locations</option>
                    {groups.map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
              {selected.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2 text-xs dark:border-blue-900 dark:bg-blue-950/20">
                  <span className="font-semibold">
                    {selected.length} selected
                    {hiddenSelected > 0
                      ? ` (${hiddenSelected} outside this view)`
                      : ""}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setBulkOpen(true)}
                  >
                    <SlidersHorizontal /> Set values
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      change(
                        selected.map((r) => ({
                          id: r.id,
                          patch: { decision: "skip", targetId: undefined },
                        })),
                      );
                      setMessage(`${selected.length} rows skipped.`);
                    }}
                  >
                    Skip selected
                  </Button>
                  <button
                    className="ml-auto underline"
                    onClick={() => setSelection({})}
                  >
                    Clear selection
                  </button>
                </div>
              )}
              <ImportGrid
                data={filtered}
                selection={selection}
                setSelection={setSelection}
                change={change}
                inspect={setDetailId}
                notify={setMessage}
                filterKey={`${deferredQuery}|${location}|${filter}`}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>
                Edits stay in this tab. Export your review before leaving.
              </span>
              <span>
                {blocked.length
                  ? `${blocked.length} included rows need fixing before review.`
                  : "Blank optional fields are flagged for review."}
              </span>
            </div>
          </>
        )}
      </div>
      {reviewOpen && (
        <BatchCardReview
          items={assessed}
          fileName={fileName}
          back={() => {
            setReviewOpen(false);
            requestAnimationFrame(() =>
              document.getElementById("open-batch-review")?.focus(),
            );
          }}
          edit={setDetailId}
          exportBatch={exportBatch}
          exporting={exporting}
          error={error}
          message={message}
        >
          {testImportEnabled && !demo && (
            <TestImportPanel
              session={testSession}
              rows={(Object.values(selection).some(Boolean)
                ? assessed.filter(
                    (a) => selection[a.row.id] && !a.errors.length,
                  )
                : included.filter((a) => !a.errors.length)
              ).map((a) => a.row)}
            />
          )}
        </BatchCardReview>
      )}
      <ImportRowDetails
        item={detail}
        close={() => setDetailId(undefined)}
        change={change}
        replaceImage={replaceImage}
      />
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set values for {selected.length} rows</DialogTitle>
            <DialogDescription>
              {hiddenSelected > 0
                ? `Includes ${hiddenSelected} selected rows outside the current view.`
                : "Apply a shared value to your selected rows. Undo is available."}
            </DialogDescription>
          </DialogHeader>
          <label className="space-y-2 text-sm">
            Field
            <NativeSelect
              aria-label="Bulk field"
              wrapperClassName="mt-2"
              className={`${selectStyle} w-full`}
              value={bulkField}
              onChange={(e) => {
                setBulkField(e.target.value as ImportField);
                setBulkValue(e.target.value === "header_color" ? "orange" : "");
              }}
            >
              {(
                [
                  "preferred_supplier",
                  "order_quantity",
                  "lead_time",
                  "header_color",
                ] as ImportField[]
              ).map((f) => (
                <option key={f} value={f}>
                  {FIELD_LABELS[f]}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="space-y-2 text-sm">
            Value
            {bulkField === "header_color" ? (
              <NativeSelect
                aria-label="Bulk value"
                wrapperClassName="mt-2"
                className={`${selectStyle} w-full capitalize`}
                value={bulkValue}
                onChange={(e) => setBulkValue(e.target.value)}
              >
                {KANBAN_ALLOWED_HEADER_COLORS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </NativeSelect>
            ) : (
              <input
                aria-label="Bulk value"
                className="mt-2 h-10 w-full rounded-md border px-3"
                value={bulkValue}
                onChange={(e) => setBulkValue(e.target.value)}
                placeholder={
                  bulkField === "lead_time" ? "e.g. 2 weeks" : "Enter a value"
                }
              />
            )}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={onlyEmpty}
              onCheckedChange={(v) => setOnlyEmpty(!!v)}
            />{" "}
            Fill blank cells only
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>
              Cancel
            </Button>
            <Button onClick={bulkApply} disabled={!bulkValue.trim()}>
              Apply to selected rows
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function Step({
  number,
  label,
  done,
  active,
}: {
  number: string;
  label: string;
  done?: boolean;
  active?: boolean;
}) {
  return (
    <span
      className={cn(
        "flex items-center gap-2",
        active ? "font-medium text-foreground" : "text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "flex size-5 items-center justify-center rounded-full text-[10px]",
          done
            ? "bg-emerald-100 text-emerald-700"
            : active
              ? "bg-foreground text-background"
              : "border",
        )}
      >
        {done ? <Check className="size-3" /> : number}
      </span>
      {label}
    </span>
  );
}
function Summary({
  label,
  count,
  sub,
  icon,
  onClick,
}: {
  label: string;
  count: number;
  sub: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className="rounded-xl border bg-background p-4 text-left shadow-xs transition-colors hover:bg-muted/20"
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        {label}
        {icon}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
        {count.toLocaleString()}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>
    </button>
  );
}
