"use client";

/* Uploaded images use local blob URLs and cannot use the Next.js image optimiser. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type CellContext,
  type ColumnDef,
  type ColumnSizingState,
  type RowSelectionState,
  type OnChangeFn,
  type SortingState,
  type Table,
  type RowData,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  PanelRightOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import { KANBAN_ALLOWED_HEADER_COLORS } from "@/lib/kanban/colors";
import {
  EDITABLE_FIELDS,
  parseDelimited,
  type ImportField,
  type ImportRow,
  type assessBatch,
} from "@/lib/kanban/import-model";
import { cn } from "@/lib/utils";

export type AssessedRow = ReturnType<typeof assessBatch>[number];
export type RowChange = { id: string; patch: Partial<ImportRow> };
interface GridMeta {
  change: (changes: RowChange[]) => void;
  inspect: (id: string) => void;
  notify: (message: string) => void;
}
export const FIELD_LABELS: Record<ImportField, string> = {
  part_no: "Part number",
  description: "Description",
  location: "Location",
  preferred_supplier: "Supplier",
  order_quantity: "Order qty",
  lead_time: "Lead time",
  header_color: "Colour",
};
declare module "@tanstack/react-table" {
  // TanStack requires the generic parameter for module augmentation.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface TableMeta<TData extends RowData> {
    kanbanImport?: GridMeta;
  }
}
const meta = (table: Table<AssessedRow>) => table.options.meta!.kanbanImport!;

export function EditableInput({
  value,
  label,
  onCommit,
  onPaste,
  invalid,
  placeholder,
}: {
  value: string;
  label: string;
  onCommit: (value: string) => void;
  onPaste?: (event: ClipboardEvent<HTMLInputElement>) => void;
  invalid?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  const cancel = useRef(false);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      aria-label={label}
      aria-invalid={invalid || undefined}
      value={draft}
      title={value || placeholder}
      placeholder={placeholder || "—"}
      className={cn(
        "h-10 w-full min-w-0 rounded-none border border-transparent bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground/60 hover:bg-muted/40 focus:border-blue-500 focus:bg-background focus:ring-1 focus:ring-blue-500",
        invalid && "bg-red-50/70 dark:bg-red-950/20",
      )}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (!cancel.current && draft !== value) onCommit(draft);
        cancel.current = false;
      }}
      onPaste={onPaste}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          cancel.current = true;
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
    />
  );
}
function CellEditor({ row, column, table }: CellContext<AssessedRow, unknown>) {
  const field = column.id as ImportField;
  const data = row.original.row;
  const { change, notify } = meta(table);
  const paste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text/plain");
    if (!/[\t\r\n]/.test(text)) return;
    event.preventDefault();
    try {
      const grid = parseDelimited(text, "\t");
      const visible = table.getPrePaginationRowModel().rows;
      const start = visible.findIndex((r) => r.id === row.id);
      const firstField = EDITABLE_FIELDS.indexOf(field);
      const changes: RowChange[] = [];
      grid.forEach((values, i) => {
        const target = visible[start + i];
        if (!target) return;
        const patch: Partial<ImportRow> = {};
        values.forEach((value, j) => {
          const key = EDITABLE_FIELDS[firstField + j];
          if (key)
            patch[key] =
              key === "header_color" ? value.trim().toLowerCase() : value;
        });
        changes.push({ id: target.id, patch });
      });
      change(changes);
      notify(
        `Pasted into ${changes.length} rows in the current sort order${grid.length > changes.length ? "; rows beyond this view were ignored" : ""}.`,
      );
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Could not paste these cells.",
      );
    }
  };
  if (field === "header_color")
    return (
      <NativeSelect
        aria-label={`Colour for row ${data.sourceRow}`}
        value={data.header_color}
        onChange={(e) =>
          change([{ id: data.id, patch: { header_color: e.target.value } }])
        }
        className="h-10 w-full rounded-none border-0 bg-transparent pl-2 pr-10 text-sm capitalize outline-blue-500"
      >
        {!KANBAN_ALLOWED_HEADER_COLORS.includes(
          data.header_color as (typeof KANBAN_ALLOWED_HEADER_COLORS)[number],
        ) && <option value={data.header_color}>Choose colour</option>}
        {KANBAN_ALLOWED_HEADER_COLORS.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </NativeSelect>
    );
  const invalid =
    field === "part_no" || field === "location"
      ? !data[field].trim()
      : field === "order_quantity" &&
        row.original.errors.some((e) => e.startsWith("Quantity"));
  return (
    <EditableInput
      value={data[field]}
      label={`${FIELD_LABELS[field]} for row ${data.sourceRow}`}
      invalid={invalid}
      onCommit={(value) => change([{ id: data.id, patch: { [field]: value } }])}
      onPaste={paste}
    />
  );
}
function StatusCell({ row, table }: CellContext<AssessedRow, unknown>) {
  const { errors, warnings, matches } = row.original;
  const label = errors.length
    ? `${errors.length} to fix`
    : matches.cards.length
      ? "Card match"
      : matches.products.length
        ? "Product match"
        : "New card";
  return (
    <button
      onClick={() => meta(table).inspect(row.id)}
      className="flex w-full flex-col gap-1 px-3 py-2 text-left"
      aria-label={`Review row ${row.original.row.sourceRow}: ${label}`}
    >
      <span
        className={cn(
          "w-fit rounded px-1.5 py-0.5 text-[11px] font-medium",
          errors.length
            ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
            : matches.cards.length
              ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200"
              : matches.products.length
                ? "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-200"
                : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
        )}
      >
        {label}
      </span>
      {warnings.length > 0 && (
        <span className="text-[10px] text-muted-foreground">
          {warnings.length} missing details
        </span>
      )}
    </button>
  );
}
const columns: ColumnDef<AssessedRow>[] = [
  {
    id: "select",
    size: 44,
    minSize: 44,
    maxSize: 44,
    enableResizing: false,
    enableSorting: false,
    header: ({ table }) => (
      <Checkbox
        aria-label="Select this page"
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label={`Select row ${row.original.row.sourceRow}`}
        checked={row.getIsSelected()}
        onCheckedChange={(v) => row.toggleSelected(!!v)}
      />
    ),
  },
  {
    id: "part_no",
    accessorFn: (a) => a.row.part_no,
    header: "Part number",
    size: 160,
    cell: CellEditor,
  },
  {
    id: "image",
    size: 58,
    minSize: 58,
    maxSize: 58,
    enableResizing: false,
    header: "Image",
    enableSorting: false,
    cell: ({ row, table }) => (
      <button
        className="flex h-11 w-full items-center justify-center"
        aria-label={`Image for row ${row.original.row.sourceRow}`}
        onClick={() => meta(table).inspect(row.id)}
      >
        {row.original.row.image ? (
          <img
            src={row.original.row.image.url}
            alt=""
            className="size-9 rounded border bg-white object-contain"
            loading="lazy"
          />
        ) : (
          <ImageOff className="size-4 text-muted-foreground/40" />
        )}
      </button>
    ),
  },
  {
    id: "description",
    accessorFn: (a) => a.row.description,
    header: "Description",
    size: 260,
    minSize: 160,
    cell: CellEditor,
  },
  {
    id: "location",
    accessorFn: (a) => a.row.location,
    header: "Location",
    size: 160,
    cell: CellEditor,
  },
  {
    id: "status",
    header: "Check",
    size: 135,
    minSize: 120,
    enableSorting: false,
    cell: StatusCell,
  },
  {
    id: "preferred_supplier",
    accessorFn: (a) => a.row.preferred_supplier,
    header: "Supplier",
    size: 220,
    minSize: 140,
    cell: CellEditor,
  },
  {
    id: "order_quantity",
    accessorFn: (a) =>
      a.row.order_quantity === "" ? -1 : Number(a.row.order_quantity),
    header: "Order qty",
    size: 100,
    cell: CellEditor,
  },
  {
    id: "lead_time",
    accessorFn: (a) => a.row.lead_time,
    header: "Lead time",
    size: 130,
    cell: CellEditor,
  },
  {
    id: "header_color",
    accessorFn: (a) => a.row.header_color,
    header: "Colour",
    size: 100,
    minSize: 100,
    cell: CellEditor,
  },
  {
    id: "decision",
    accessorFn: (a) => a.row.decision,
    header: "Action",
    size: 130,
    minSize: 130,
    cell: ({ row, table }) => (
      <NativeSelect
        aria-label={`Action for row ${row.original.row.sourceRow}`}
        className="h-10 w-full rounded-none border-0 bg-transparent pl-2 pr-10 text-xs outline-blue-500"
        value={row.original.row.decision}
        onChange={(e) => {
          if (e.target.value === "update") meta(table).inspect(row.id);
          else
            meta(table).change([
              {
                id: row.id,
                patch: {
                  decision: e.target.value as "create" | "skip",
                  targetId: undefined,
                },
              },
            ]);
        }}
      >
        <option value="create">Create card</option>
        <option value="skip">Skip</option>
        {row.original.matches.cards.length > 0 && (
          <option value="update">Update…</option>
        )}
      </NativeSelect>
    ),
  },
  {
    id: "details",
    size: 44,
    minSize: 44,
    maxSize: 44,
    enableResizing: false,
    header: "",
    enableSorting: false,
    cell: ({ row, table }) => (
      <button
        aria-label={`Open details for row ${row.original.row.sourceRow}`}
        className="flex size-10 items-center justify-center hover:bg-muted"
        onClick={() => meta(table).inspect(row.id)}
      >
        <PanelRightOpen className="size-4 text-muted-foreground" />
      </button>
    ),
  },
];

export function ImportGrid({
  data,
  selection,
  setSelection,
  change,
  inspect,
  notify,
  filterKey,
}: {
  data: AssessedRow[];
  selection: RowSelectionState;
  setSelection: OnChangeFn<RowSelectionState>;
  change: GridMeta["change"];
  inspect: GridMeta["inspect"];
  notify: GridMeta["notify"];
  filterKey: string;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 50 });
  useEffect(() => setPagination((p) => ({ ...p, pageIndex: 0 })), [filterKey]);
  const pageIndex = Math.min(
    pagination.pageIndex,
    Math.max(0, Math.ceil(data.length / pagination.pageSize) - 1),
  );
  const table = useReactTable({
    data,
    columns,
    defaultColumn: { minSize: 100, maxSize: 1000 },
    columnResizeMode: "onChange",
    getRowId: (a) => a.row.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
    state: {
      sorting,
      columnSizing,
      rowSelection: selection,
      pagination: { ...pagination, pageIndex },
    },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    onRowSelectionChange: setSelection,
    onPaginationChange: setPagination,
    meta: { kanbanImport: { change, inspect, notify } },
  });
  const visibleSelected = data.filter((a) => selection[a.row.id]).length;
  return (
    <div className="overflow-hidden rounded-xl border bg-background shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
        <span>
          {data.length.toLocaleString()} rows in this view · Click a cell to
          edit · Drag a header edge to resize
        </span>
        {Object.keys(columnSizing).length > 0 && (
          <button
            className="font-medium text-foreground underline underline-offset-4"
            onClick={() => table.resetColumnSizing(true)}
          >
            Reset column widths
          </button>
        )}
        <button
          className="font-medium text-foreground underline underline-offset-4"
          onClick={() =>
            setSelection((previous) => {
              const next = { ...previous };
              const select = visibleSelected !== data.length;
              data.forEach((a) => {
                if (select) next[a.row.id] = true;
                else delete next[a.row.id];
              });
              return next;
            })
          }
        >
          {visibleSelected === data.length && data.length
            ? "Deselect this view"
            : `Select all ${data.length} in this view`}
        </button>
      </div>
      <div
        className="max-h-[58vh] min-h-[280px] overflow-auto overscroll-contain"
        tabIndex={0}
        aria-label="Editable batch rows"
      >
        <table
          className="border-separate border-spacing-0 text-sm"
          style={{ width: table.getTotalSize(), tableLayout: "fixed" }}
        >
          <thead className="sticky top-0 z-20 bg-muted">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th
                    key={header.id}
                    scope="col"
                    style={{ width: header.getSize() }}
                    className={cn(
                      "relative h-10 border-r border-b border-border/70 bg-muted px-3 text-left text-[11px] font-medium text-muted-foreground",
                      header.id === "select" &&
                        "sticky left-0 z-30 text-center",
                      header.id === "part_no" &&
                        "sticky left-11 z-30 border-r-2",
                      header.id === "details" && "sticky right-0 z-30",
                    )}
                  >
                    {header.column.getCanSort() ? (
                      <button
                        className="flex w-full items-center gap-1.5"
                        onClick={header.column.getToggleSortingHandler()}
                        aria-label={`Sort by ${String(header.column.columnDef.header)}`}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {header.column.getIsSorted() === "asc" ? (
                          <ArrowUp className="size-3" />
                        ) : header.column.getIsSorted() === "desc" ? (
                          <ArrowDown className="size-3" />
                        ) : (
                          <ArrowUpDown className="size-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )
                    )}
                    {header.column.getCanResize() && (
                      <div
                        role="separator"
                        tabIndex={0}
                        aria-label={`Resize ${String(header.column.columnDef.header)} column`}
                        aria-orientation="vertical"
                        aria-valuemin={header.column.columnDef.minSize}
                        aria-valuemax={header.column.columnDef.maxSize}
                        aria-valuenow={Math.round(header.getSize())}
                        title="Drag to resize. Double-click to reset. Arrow keys adjust width."
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        onDoubleClick={() => header.column.resetSize()}
                        onKeyDown={(event) => {
                          if (event.key === "Home") {
                            event.preventDefault();
                            header.column.resetSize();
                          } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                            event.preventDefault();
                            const step = (event.shiftKey ? 50 : 10) * (event.key === "ArrowRight" ? 1 : -1);
                            const width = Math.min(header.column.columnDef.maxSize ?? 1000, Math.max(header.column.columnDef.minSize ?? 100, header.getSize() + step));
                            setColumnSizing(previous => ({ ...previous, [header.column.id]: width }));
                          }
                        }}
                        className={cn(
                          "absolute right-0 top-0 z-40 flex h-full w-2 touch-none cursor-col-resize select-none items-center justify-center outline-none hover:bg-blue-500/15 focus-visible:bg-blue-500/15 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500",
                          header.column.getIsResizing() && "bg-blue-500/20",
                        )}
                      >
                        <span className="h-4 w-px bg-muted-foreground/30" />
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="group"
                data-state={row.getIsSelected() ? "selected" : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={cn(
                      "border-r border-b border-border/50 p-0",
                      row.getIsSelected()
                        ? "bg-blue-50 dark:bg-blue-950/30"
                        : row.original.row.decision === "skip"
                          ? "bg-muted/40"
                          : "bg-background",
                      cell.column.id === "select" &&
                        "sticky left-0 z-10 text-center",
                      cell.column.id === "part_no" &&
                        "sticky left-11 z-10 border-r-2 font-mono text-xs",
                      cell.column.id === "details" && "sticky right-0 z-10",
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!data.length && (
          <div className="p-14 text-center text-sm text-muted-foreground">
            No rows match these filters. Try another location or check.
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
        <span>
          {data.length
            ? `${pageIndex * pagination.pageSize + 1}–${Math.min((pageIndex + 1) * pagination.pageSize, data.length)} of ${data.length}`
            : "0 rows"}
        </span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2">
            Rows per page{" "}
            <NativeSelect
              aria-label="Rows per page"
              value={pagination.pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
              className="h-7 rounded border bg-background pl-2 pr-10 py-1 text-xs text-foreground"
            >
              {[25, 50, 100].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </NativeSelect>
          </label>
          <span>
            Page {pageIndex + 1} of {Math.max(1, table.getPageCount())}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
            aria-label="Previous page"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
            aria-label="Next page"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
