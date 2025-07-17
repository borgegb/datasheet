"use client";

import React from "react";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import type { KanbanCard } from "../actions";

interface KanbanCardPreviewProps {
  card: KanbanCard;
}

export default function KanbanCardPreview({ card }: KanbanCardPreviewProps) {
  // A6 dimensions: 148mm x 105mm (aspect ratio: 1.41)
  // Increased size to show all content clearly
  const maxCardWidth = 500; // pixels (increased from 400)

  const getHeaderColor = (color: string) => {
    const colorMap = {
      red: "#DC2626",
      orange: "#EA580C",
      green: "#16A34A",
    };
    return colorMap[color as keyof typeof colorMap] || "#DC2626";
  };

  const tableData = [
    ["Part No:", card.part_no],
    ["Description:", card.description || ""],
    ["Location:", card.location],
    ["Order Qty:", card.order_quantity?.toString() || ""],
    ["Preferred Supplier:", card.preferred_supplier || ""],
    ["Lead Time:", card.lead_time || ""],
    ["Signature:", ""],
  ];

  return (
    <Card
      className="relative bg-white shadow-lg border border-gray-200 overflow-hidden w-full sm:w-96 md:w-[450px] lg:w-[500px]"
      style={{
        maxWidth: maxCardWidth,
        aspectRatio: "148/105", // A6 aspect ratio
        minHeight: "400px", // Ensure enough height for all content
      }}
    >
      {/* Header Section */}
      <div
        className="w-full flex items-center justify-center text-white font-bold text-xl"
        style={{
          backgroundColor: getHeaderColor(card.header_color),
          height: "14%", // Reduced to give more space to table
        }}
      >
        KANBAN
      </div>

      {/* Image Section */}
      <div
        className="w-full bg-gray-50 flex items-center justify-center overflow-hidden"
        style={{ height: "32%" }} // Reduced to give more space to table
      >
        {card.signedImageUrl ? (
          <Image
            src={card.signedImageUrl}
            alt={card.part_no}
            width={maxCardWidth}
            height={Math.round(maxCardWidth * 1.41 * 0.32)}
            className="object-contain w-full h-full"
            unoptimized
          />
        ) : (
          <div className="text-gray-400 text-sm text-center p-4">
            No image available
          </div>
        )}
      </div>

      {/* Table Section */}
      <div
        className="w-full overflow-hidden"
        style={{ height: "54%" }} // Increased to show all 7 rows
      >
        <table className="w-full h-full text-sm border-collapse">
          <tbody>
            {tableData.map((row, index) => (
              <tr
                key={index}
                className="border-b border-gray-300"
                style={{ height: `${100 / 7}%` }}
              >
                <td
                  className="font-bold text-left px-3 py-2 border-r border-gray-300 bg-gray-50 align-middle"
                  style={{ width: "35%" }}
                >
                  {row[0]}
                </td>
                <td
                  className="text-center px-3 py-2 align-middle"
                  style={{ width: "65%" }}
                >
                  {row[1]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
