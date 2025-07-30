"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ColumnDef,
  ColumnFiltersState, // Import ColumnFiltersState
  FilterFn,
  flexRender,
  getCoreRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  PaginationState,
  Row,
  SortingState,
  useReactTable,
  VisibilityState,
} from "@tanstack/react-table";
import {
  ChevronDownIcon,
  ChevronFirstIcon,
  ChevronLastIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CircleAlertIcon,
  CircleXIcon,
  Columns3Icon,
  EllipsisIcon,
  FilterIcon,
  ListFilterIcon,
  PlusIcon,
  TrashIcon,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Define related types here for clarity
interface Catalog {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
}

// Custom filter function for categories (checks if ANY selected category ID is present)
const categoriesFilterFn: FilterFn<any> = (
  row,
  columnId,
  filterValue: string[] // Expecting an array of selected category IDs
) => {
  if (!filterValue?.length) return true; // No filter selected, show all
  const rowCategoryIds = row.getValue(columnId) as string[] | null | undefined;
  if (!rowCategoryIds || rowCategoryIds.length === 0) return false; // Row has no categories, hide if filtering

  // Check if there's any overlap between the row's categories and the selected filter categories
  return rowCategoryIds.some((id) => filterValue.includes(id));
};

interface DatasheetsTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchColumnId?: string;
  onDeleteRows?: (selectedRows: Row<TData>[]) => void;
  onDeleteRow?: (productId: string) => void;
  onRemoveFromCatalog?: (productId: string) => void;
  onRemoveSelectedFromCatalog?: (selectedRows: Row<TData>[]) => void;
  onDownload?: (storagePath: string, filename: string) => void;
  onPrint?: (storagePath: string, filename: string) => void;
  onViewPdf?: (storagePath: string, filename: string) => void;
  catalogs?: Catalog[];
  availableCategories?: Category[]; // Add available categories for filtering
  currentCatalogFilter?: string | null;
  isLoading?: boolean;
  hideCatalogFilter?: boolean;
  hideAddButton?: boolean;
  userRole?: string; // Add userRole prop
}

export default function DatasheetsTable<TData, TValue>({
  columns,
  data,
  searchColumnId = "product_title",
  onDeleteRows,
  onDeleteRow,
  onRemoveFromCatalog,
  onRemoveSelectedFromCatalog,
  onDownload,
  onPrint,
  onViewPdf,
  catalogs = [],
  availableCategories = [], // Destructure available categories
  currentCatalogFilter = null,
  isLoading = false,
  hideCatalogFilter = false,
  hideAddButton = false,
  userRole,
}: DatasheetsTableProps<TData, TValue>) {
  const id = useId();
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const [rowSelection, setRowSelection] = useState({});
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]); // Add state for column filters
  const router = useRouter();
  const pathname = usePathname();

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    enableSortingRemoval: false,
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: setPagination,
    onColumnVisibilityChange: setColumnVisibility,
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters, // Add handler for column filters
    state: {
      sorting,
      pagination,
      columnVisibility,
      rowSelection,
      globalFilter,
      columnFilters, // Include column filters in state
    },
    meta: {
      onDeleteRow,
      onRemoveFromCatalog,
      onRemoveSelectedFromCatalog,
      onDownload,
      onPrint,
      onViewPdf,
      // Pass availableCategories to meta for use in column definition cell renderers
      availableCategories: availableCategories,
      userRole, // Pass userRole for role-based UI
    },
  });

  // --- Catalog Filter Handler (unchanged) ---
  const handleCatalogFilterChange = (catalogId: string) => {
    const current = new URLSearchParams(window.location.search);
    if (catalogId && catalogId !== "all") {
      current.set("catalog", catalogId);
    } else {
      current.delete("catalog");
    }
    const search = current.toString();
    const query = search ? `?${search}` : "";
    router.push(`${pathname}${query}`);
  };
  // --- End Catalog Filter Handler ---

  // --- Category Filter Handler ---
  const selectedCategoryIds = useMemo(() => {
    const filterValue = table
      .getColumn("category_ids")
      ?.getFilterValue() as string[];
    return filterValue ?? [];
  }, [table.getColumn("category_ids")?.getFilterValue()]);

  const handleCategoryFilterChange = (checked: boolean, categoryId: string) => {
    const currentFilter = table.getColumn("category_ids")?.getFilterValue() as
      | string[]
      | undefined;
    let newFilter: string[] = currentFilter ? [...currentFilter] : [];

    if (checked) {
      if (!newFilter.includes(categoryId)) {
        newFilter.push(categoryId);
      }
    } else {
      newFilter = newFilter.filter((id) => id !== categoryId);
    }

    table
      .getColumn("category_ids")
      ?.setFilterValue(newFilter.length > 0 ? newFilter : undefined);
  };
  // --- End Category Filter Handler ---

  // --- Delete Rows Handler (unchanged) ---
  const handleDeleteRows = () => {
    if (onDeleteRows) {
      onDeleteRows(table.getSelectedRowModel().rows);
      table.resetRowSelection();
    } else {
      console.warn("DatasheetsTable: onDeleteRows prop not provided.");
    }
  };
  // --- End Delete Rows Handler ---

  // --- Remove Selected from Catalog Handler ---
  const handleRemoveSelectedFromCatalog = () => {
    if (onRemoveSelectedFromCatalog) {
      onRemoveSelectedFromCatalog(table.getSelectedRowModel().rows);
      table.resetRowSelection();
    } else {
      console.warn(
        "DatasheetsTable: onRemoveSelectedFromCatalog prop not provided."
      );
    }
  };
  // --- End Remove Selected from Catalog Handler ---

  return (
    <div className="space-y-4">
      {/* --- Filters Section --- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Global Search Input (unchanged) */}
          <div className="relative">
            {/* ... Input, ListFilterIcon, CircleXIcon ... */}
            <Input
              id={`${id}-global-search-input`}
              ref={inputRef}
              className={cn(
                "peer h-8 w-full min-w-48 max-w-sm rounded-md border ps-9",
                globalFilter ? "pe-9" : ""
              )}
              value={globalFilter ?? ""}
              onChange={(event) => setGlobalFilter(event.target.value)}
              placeholder={`Search all fields...`}
              type="text"
              aria-label="Search products"
            />
            <div className="text-muted-foreground/80 pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 peer-disabled:opacity-50">
              <ListFilterIcon size={16} aria-hidden="true" />
            </div>
            {Boolean(globalFilter) && (
              <button
                className="text-muted-foreground/80 hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 absolute inset-y-0 end-0 flex h-full w-9 items-center justify-center rounded-e-md transition-[color,box-shadow] outline-none focus:z-10 focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Clear search"
                onClick={() => {
                  setGlobalFilter("");
                  inputRef.current?.focus();
                }}
              >
                <CircleXIcon size={16} aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Catalog Filter Select (unchanged, controlled by hideCatalogFilter prop) */}
          {!hideCatalogFilter && (
            <Select
              value={currentCatalogFilter || "all"}
              onValueChange={handleCatalogFilterChange}
              disabled={isLoading}
            >
              {/* ... SelectTrigger, SelectContent, SelectItems ... */}
              <SelectTrigger className="h-8 w-[180px]">
                <SelectValue placeholder="Filter by Catalog..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Catalogs</SelectItem>
                {catalogs.length === 0 && !isLoading && (
                  <SelectItem value="none" disabled>
                    No Catalogs Found
                  </SelectItem>
                )}
                {catalogs.map((catalog) => (
                  <SelectItem key={catalog.id} value={catalog.id}>
                    {catalog.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* --- Add Category Filter Popover --- */}
          {availableCategories.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8">
                  <FilterIcon className="mr-1.5 h-3.5 w-3.5 opacity-70" />
                  Categories
                  {selectedCategoryIds.length > 0 && (
                    <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-xs font-semibold text-muted-foreground">
                      {selectedCategoryIds.length}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto min-w-48 p-3" align="start">
                <div className="space-y-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    Filter by Category
                  </p>
                  <div className="space-y-2">
                    {availableCategories.map((category) => (
                      <div
                        key={category.id}
                        className="flex items-center gap-2"
                      >
                        <Checkbox
                          id={`cat-filter-${category.id}`}
                          checked={selectedCategoryIds.includes(category.id)}
                          onCheckedChange={(checked: boolean) =>
                            handleCategoryFilterChange(checked, category.id)
                          }
                        />
                        <Label
                          htmlFor={`cat-filter-${category.id}`}
                          className="grow truncate font-normal cursor-pointer"
                        >
                          {category.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                  {selectedCategoryIds.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-center h-7 text-xs"
                        onClick={() =>
                          table
                            .getColumn("category_ids")
                            ?.setFilterValue(undefined)
                        }
                      >
                        Clear filters
                      </Button>
                    </>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}
          {/* --- End Category Filter Popover --- */}
        </div>

        {/* Buttons Section (unchanged) */}
        <div className="flex-grow"></div>
        <div className="flex items-center gap-3">
          {/* ... View (Column Toggle), Delete Selected, Add Datasheet Buttons ... */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <Columns3Icon
                  className="-ms-1 opacity-60"
                  size={16}
                  aria-hidden="true"
                />
                View
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) =>
                      column.toggleVisibility(!!value)
                    }
                    onSelect={(event) => event.preventDefault()}
                  >
                    {/* Simple rename for display */}
                    {column.id.replace("_", " ")}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {table.getSelectedRowModel().rows.length > 0 && onDeleteRows && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-8">
                  <TrashIcon className="mr-1.5 h-3.5 w-3.5 opacity-70" />
                  Delete ({table.getSelectedRowModel().rows.length})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete{" "}
                    {table.getSelectedRowModel().rows.length} selected
                    datasheet(s).
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteRows}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Remove Selected from Catalog Button */}
          {table.getSelectedRowModel().rows.length > 0 &&
            onRemoveSelectedFromCatalog && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-orange-600 border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                  >
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5 opacity-70" />
                    Remove from Catalog (
                    {table.getSelectedRowModel().rows.length})
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove from Catalog?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove {table.getSelectedRowModel().rows.length}{" "}
                      selected datasheet(s) from this catalog. The datasheets
                      will not be deleted, just removed from the catalog.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleRemoveSelectedFromCatalog}
                      className="bg-orange-600 hover:bg-orange-700"
                    >
                      Remove from Catalog
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

          {!hideAddButton && (
            <Button asChild size="sm" className="h-8">
              <Link href="/dashboard/generator">
                <PlusIcon className="mr-1.5 h-3.5 w-3.5" />
                Add Datasheet
              </Link>
            </Button>
          )}
        </div>
      </div>
      {/* --- End Filters Section --- */}

      {/* Table */}
      <div className="bg-background overflow-hidden rounded-md border">
        <Table className="table-fixed">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      key={header.id}
                      style={{ width: `${header.getSize()}px` }}
                      className="h-11"
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <div
                          className={cn(
                            header.column.getCanSort() &&
                              "flex h-full cursor-pointer items-center justify-between gap-2 select-none"
                          )}
                          onClick={header.column.getToggleSortingHandler()}
                          onKeyDown={(e) => {
                            if (
                              header.column.getCanSort() &&
                              (e.key === "Enter" || e.key === " ")
                            ) {
                              e.preventDefault();
                              header.column.getToggleSortingHandler()?.(e);
                            }
                          }}
                          tabIndex={header.column.getCanSort() ? 0 : undefined}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                          {{
                            asc: (
                              <ChevronUpIcon
                                className="shrink-0 opacity-60"
                                size={16}
                                aria-hidden="true"
                              />
                            ),
                            desc: (
                              <ChevronDownIcon
                                className="shrink-0 opacity-60"
                                size={16}
                                aria-hidden="true"
                              />
                            ),
                          }[header.column.getIsSorted() as string] ?? null}
                        </div>
                      ) : (
                        flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              // --- Loading State ---
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  <div className="flex justify-center items-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                </TableCell>
              </TableRow>
            ) : // --- End Loading State ---
            table.getRowModel().rows?.length ? (
              // --- Rows Exist State ---
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="last:py-0">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              // --- End Rows Exist State ---
              // --- No Results State ---
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results found.
                </TableCell>
              </TableRow>
              // --- End No Results State ---
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination (unchanged) */}
      <div className="flex items-center justify-between gap-8">
        {/* ... Rows per page, Page number info, Pagination buttons ... */}
        <div className="flex items-center gap-3">
          <Label htmlFor={id} className="max-sm:sr-only">
            Rows per page
          </Label>
          <Select
            value={table.getState().pagination.pageSize.toString()}
            onValueChange={(value) => {
              table.setPageSize(Number(value));
            }}
          >
            <SelectTrigger id={id} className="w-fit whitespace-nowrap">
              <SelectValue placeholder="Select number of results" />
            </SelectTrigger>
            <SelectContent className="[&_*[role=option]]:ps-2 [&_*[role=option]]:pe-8 [&_*[role=option]>span]:start-auto [&_*[role=option]>span]:end-2">
              {[5, 10, 25, 50].map((pageSize) => (
                <SelectItem key={pageSize} value={pageSize.toString()}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="text-muted-foreground flex grow justify-end text-sm whitespace-nowrap">
          <p
            className="text-muted-foreground text-sm whitespace-nowrap"
            aria-live="polite"
          >
            <span className="text-foreground">
              {table.getState().pagination.pageIndex *
                table.getState().pagination.pageSize +
                1}
              -
              {Math.min(
                Math.max(
                  table.getState().pagination.pageIndex *
                    table.getState().pagination.pageSize +
                    table.getState().pagination.pageSize,
                  0
                ),
                table.getRowCount()
              )}
            </span>{" "}
            of{" "}
            <span className="text-foreground">
              {table.getRowCount().toString()}
            </span>
          </p>
        </div>

        <div>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <Button
                  size="icon"
                  variant="outline"
                  className="disabled:pointer-events-none disabled:opacity-50"
                  onClick={() => table.firstPage()}
                  disabled={!table.getCanPreviousPage()}
                  aria-label="Go to first page"
                >
                  <ChevronFirstIcon size={16} aria-hidden="true" />
                </Button>
              </PaginationItem>
              <PaginationItem>
                <Button
                  size="icon"
                  variant="outline"
                  className="disabled:pointer-events-none disabled:opacity-50"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  aria-label="Go to previous page"
                >
                  <ChevronLeftIcon size={16} aria-hidden="true" />
                </Button>
              </PaginationItem>
              <PaginationItem>
                <Button
                  size="icon"
                  variant="outline"
                  className="disabled:pointer-events-none disabled:opacity-50"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  aria-label="Go to next page"
                >
                  <ChevronRightIcon size={16} aria-hidden="true" />
                </Button>
              </PaginationItem>
              <PaginationItem>
                <Button
                  size="icon"
                  variant="outline"
                  className="disabled:pointer-events-none disabled:opacity-50"
                  onClick={() => table.lastPage()}
                  disabled={!table.getCanNextPage()}
                  aria-label="Go to last page"
                >
                  <ChevronLastIcon size={16} aria-hidden="true" />
                </Button>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </div>
    </div>
  );
}
