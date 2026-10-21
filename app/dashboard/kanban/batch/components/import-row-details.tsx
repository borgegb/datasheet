"use client";

/* Local upload previews are blob URLs. */
/* eslint-disable @next/next/no-img-element */

import { ImagePlus, AlertCircle, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { KANBAN_ALLOWED_HEADER_COLORS } from "@/lib/kanban/colors";
import { EDITABLE_FIELDS, type ImportRow } from "@/lib/kanban/import-model";
import {
  EditableInput,
  FIELD_LABELS,
  type AssessedRow,
  type RowChange,
} from "./import-grid";

export function ImportRowDetails({
  item,
  close,
  change,
  replaceImage,
}: {
  item?: AssessedRow;
  close: () => void;
  change: (changes: RowChange[]) => void;
  replaceImage: (row: ImportRow, file: File) => void;
}) {
  const target = item?.matches.cards.find((c) => c.id === item.row.targetId);
  return (
    <Sheet
      open={!!item}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{item?.row.part_no || "Row details"}</SheetTitle>
          <SheetDescription>
            Source row {item?.row.sourceRow} · Changes apply to this review
            only.
          </SheetDescription>
        </SheetHeader>
        {item && (
          <div className="space-y-6 px-5 pb-8">
            <div className="flex items-center gap-4 rounded-lg border bg-muted/20 p-4">
              {item.row.image ? (
                <img
                  alt={item.row.description || item.row.part_no}
                  src={item.row.image.url}
                  className="size-24 rounded bg-white object-contain"
                />
              ) : (
                <div className="flex size-24 items-center justify-center rounded bg-muted">
                  <ImageOff className="size-7 text-muted-foreground/50" />
                </div>
              )}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {item.row.image
                    ? "Image supplied with this row"
                    : "No image supplied with this row"}
                </p>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs font-medium">
                  <ImagePlus className="size-4" />{" "}
                  {item.row.image ? "Replace image" : "Add image"}
                  <input
                    className="sr-only"
                    aria-label="Upload row image"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) replaceImage(item.row, file);
                      e.target.value = "";
                    }}
                  />
                </label>
                {item.row.image && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      change([{ id: item.row.id, patch: { image: undefined } }])
                    }
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
            {(item.errors.length > 0 || item.warnings.length > 0) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                <p className="mb-2 flex items-center gap-2 font-medium">
                  <AlertCircle className="size-4" /> Check this row
                </p>
                <ul className="list-inside list-disc space-y-1">
                  {item.errors.map((e) => (
                    <li key={e} className="font-semibold">
                      {e}
                    </li>
                  ))}
                  {item.warnings.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
                <p className="mt-2 opacity-70">
                  Missing optional details can stay blank for review.
                </p>
              </div>
            )}
            <div className="space-y-3">
              {EDITABLE_FIELDS.map((field) => (
                <label key={field} className="block space-y-1">
                  <span className="text-xs font-medium">
                    {FIELD_LABELS[field]}
                  </span>
                  <div className="overflow-hidden rounded-md border">
                    {field === "header_color" ? (
                      <NativeSelect
                        aria-label="Detail header colour"
                        value={item.row.header_color}
                        onChange={(e) =>
                          change([
                            {
                              id: item.row.id,
                              patch: { header_color: e.target.value },
                            },
                          ])
                        }
                        className="h-10 w-full rounded-none border-0 bg-background pl-3 pr-10 text-sm capitalize"
                      >
                        {!KANBAN_ALLOWED_HEADER_COLORS.includes(
                          item.row
                            .header_color as (typeof KANBAN_ALLOWED_HEADER_COLORS)[number],
                        ) && <option>Choose colour</option>}
                        {KANBAN_ALLOWED_HEADER_COLORS.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </NativeSelect>
                    ) : (
                      <EditableInput
                        label={`Detail ${FIELD_LABELS[field]}`}
                        value={item.row[field]}
                        onCommit={(value) =>
                          change([
                            { id: item.row.id, patch: { [field]: value } },
                          ])
                        }
                      />
                    )}
                  </div>
                </label>
              ))}
            </div>
            <div className="space-y-3 border-t pt-5">
              <h3 className="text-sm font-semibold">
                What should happen to this row?
              </h3>
              <NativeSelect
                aria-label="Row import action"
                className="h-10 w-full rounded-md border bg-background pl-3 pr-10 text-sm"
                value={item.row.decision}
                onChange={(e) =>
                  change([
                    {
                      id: item.row.id,
                      patch: {
                        decision: e.target.value as ImportRow["decision"],
                        targetId: undefined,
                      },
                    },
                  ])
                }
              >
                <option value="create">Create a new Kanban card</option>
                <option value="skip">Skip this row</option>
                {item.matches.cards.length > 0 && (
                  <option value="update">Update an existing Kanban card</option>
                )}
              </NativeSelect>
              {item.matches.products.length > 0 && (
                <p className="rounded-md bg-purple-50 p-3 text-xs text-purple-900 dark:bg-purple-950/30 dark:text-purple-100">
                  {item.matches.products.length} catalogue product match
                  {item.matches.products.length > 1 ? "es" : ""}. Creating a
                  card does not create another catalogue product.
                </p>
              )}
              {item.matches.cards.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {item.matches.cards.length} existing card
                    {item.matches.cards.length > 1 ? "s" : ""} use this part
                    number. Check location and colour before creating another.
                  </p>
                  {item.matches.cards.map((card) => (
                    <label
                      key={card.id}
                      className="flex items-center gap-3 rounded-md border p-3 text-xs"
                    >
                      {item.row.decision === "update" && (
                        <input
                          type="radio"
                          name="update-target"
                          aria-label={`Update card at ${card.location}, ${card.header_color}`}
                          checked={item.row.targetId === card.id}
                          onChange={() =>
                            change([
                              { id: item.row.id, patch: { targetId: card.id } },
                            ])
                          }
                        />
                      )}
                      <span>
                        <span className="font-medium">{card.location}</span>
                        <span className="ml-2 capitalize text-muted-foreground">
                          {card.header_color}
                        </span>
                        <span className="mt-1 block text-muted-foreground">
                          {card.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {target && (
                <div className="rounded-lg border p-3">
                  <h4 className="mb-2 text-xs font-semibold">
                    Proposed changes
                  </h4>
                  {EDITABLE_FIELDS.filter(
                    (f) => String(target[f] ?? "") !== item.row[f],
                  ).map((f) => (
                    <div key={f} className="mb-2 text-xs">
                      <span className="block font-medium">
                        {FIELD_LABELS[f]}
                      </span>
                      <span className="text-muted-foreground line-through">
                        {String(target[f] ?? "") || "Blank"}
                      </span>
                      <span className="mx-2">→</span>
                      <span>{item.row[f] || "Blank"}</span>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">
                    Image handling will be confirmed before saving to the
                    database.
                  </p>
                </div>
              )}
            </div>
            <Button className="w-full" onClick={close}>
              Done reviewing row
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
