"use client";

import Image from "next/image";
import type { ProductionKanbanCard } from "../actions";
import { normalizeProductionKanbanBackRows } from "@/lib/production-kanban/back-rows";
import {
  PRODUCTION_KANBAN_BROWN_HEX,
  PRODUCTION_KANBAN_FIXED_FOOTER_CODE,
} from "@/lib/production-kanban/constants";

interface ProductionKanbanPreviewProps {
  card: ProductionKanbanCard;
}

export default function ProductionKanbanPreview({
  card,
}: ProductionKanbanPreviewProps) {
  const backRows = normalizeProductionKanbanBackRows(card.back_rows);

  return (
    <div className="grid w-full gap-6 xl:grid-cols-2">
      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">Front</p>
        <div className="mx-auto max-w-md overflow-hidden border border-gray-200 bg-white shadow-sm">
          <div
            className="py-6 text-center text-white"
            style={{ backgroundColor: PRODUCTION_KANBAN_BROWN_HEX }}
          >
            <h1 className="text-4xl font-bold tracking-wide">KANBAN</h1>
          </div>
          <div className="flex min-h-[300px] w-full items-center justify-center bg-gray-50">
            {card.signedImageUrl ? (
              <Image
                src={card.signedImageUrl}
                alt={card.part_no}
                width={400}
                height={300}
                className="h-full w-full object-cover"
                unoptimized
              />
            ) : (
              <div className="p-8 text-center text-gray-400">
                <p className="text-sm">No image available</p>
              </div>
            )}
          </div>
          <div className="border-collapse">
            {[
              ["Part No", card.part_no],
              ["Description", card.description || ""],
              ["Location", card.location],
              ["Order Qty", card.order_quantity?.toString() || ""],
              ["Preferred Supplier", card.preferred_supplier || ""],
              ["Lead Time", card.lead_time || ""],
              ["Signature", ""],
            ].map(([label, value], index) => (
              <div
                key={`${label}-${index}`}
                className={`grid grid-cols-2 border-black ${
                  index === 0 ? "border" : "border-x border-b"
                }`}
              >
                <div className="border-r border-black p-4 text-lg font-semibold">
                  {label}:
                </div>
                <div className="min-h-[60px] p-4 text-center text-lg">{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">Back</p>
        <div className="mx-auto max-w-md border border-black bg-white shadow-sm">
          <div className="grid grid-cols-[1.8fr_0.8fr_1.8fr_0.8fr] border-b border-black text-center font-semibold">
            <div className="border-r border-black px-3 py-2">Location</div>
            <div className="border-r-2 border-black px-3 py-2">Qty</div>
            <div className="border-r border-black px-3 py-2">Location</div>
            <div className="px-3 py-2">Qty</div>
          </div>

          {backRows.map((row, index) => (
            <div
              key={`production-preview-row-${index + 1}`}
              className="grid min-h-9 grid-cols-[1.8fr_0.8fr_1.8fr_0.8fr] border-b border-black text-sm"
            >
              <div className="border-r border-black px-3 py-2">
                {row.leftLocation}
              </div>
              <div className="border-r-2 border-black px-3 py-2 text-center">
                {row.leftQty}
              </div>
              <div className="border-r border-black px-3 py-2">
                {row.rightLocation}
              </div>
              <div className="px-3 py-2 text-center">{row.rightQty}</div>
            </div>
          ))}

          <div className="px-3 py-2 text-center text-sm">
            {card.footer_code || PRODUCTION_KANBAN_FIXED_FOOTER_CODE}
          </div>
        </div>
      </div>
    </div>
  );
}
