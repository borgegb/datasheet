"use client";

import React from "react";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import type { KanbanCard } from "../actions";

interface KanbanCardPreviewProps {
  card: KanbanCard;
}

export default function KanbanCardPreview({ card }: KanbanCardPreviewProps) {
  const getHeaderColor = (color: string) => {
    const colorMap = {
      red: "bg-red-600",
      orange: "bg-orange-600",
      green: "bg-green-600",
      yellow: "bg-yellow-400",
      blue: "bg-blue-600",
      purple: "bg-purple-600",
      brown: "bg-amber-700",
      pink: "bg-pink-500",
      teal: "bg-teal-600",
      cyan: "bg-cyan-500",
      gray: "bg-gray-600",
      magenta: "bg-fuchsia-600",
      lime: "bg-lime-500",
      silver: "bg-gray-400",
      black: "bg-black",
    };
    return colorMap[color as keyof typeof colorMap] || "bg-red-600";
  };

  return (
    <div className="max-w-md mx-auto bg-white shadow-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div
        className={`${getHeaderColor(
          card.header_color
        )} text-white text-center py-6`}
      >
        <h1 className="text-4xl font-bold tracking-wider">KANBAN</h1>
      </div>

      {/* Product Image Section */}
      <div className="bg-gray-50 flex justify-center items-center min-h-[300px] w-full">
        {card.signedImageUrl ? (
          <Image
            src={card.signedImageUrl}
            alt={card.part_no}
            width={400}
            height={300}
            className="w-full h-full object-cover"
            unoptimized
          />
        ) : (
          <div className="text-gray-400 text-center p-8">
            <div className="w-24 h-24 mx-auto mb-4 bg-gray-200 rounded-lg flex items-center justify-center">
              <svg
                className="w-8 h-8 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <p className="text-sm">No image available</p>
          </div>
        )}
      </div>

      {/* Specifications Table */}
      <div className="border-collapse">
        <div className="grid grid-cols-2 border border-black">
          <div className="border-r border-black p-4 bg-white font-semibold text-lg">
            Part No:
          </div>
          <div className="p-4 bg-white text-lg text-center">{card.part_no}</div>
        </div>

        <div className="grid grid-cols-2 border-l border-r border-b border-black">
          <div className="border-r border-black p-4 bg-white font-semibold text-lg">
            Description:
          </div>
          <div className="p-4 bg-white text-lg text-center">
            {card.description || ""}
          </div>
        </div>

        <div className="grid grid-cols-2 border-l border-r border-b border-black">
          <div className="border-r border-black p-4 bg-white font-semibold text-lg">
            Location:
          </div>
          <div className="p-4 bg-white text-lg text-center">
            {card.location}
          </div>
        </div>

        <div className="grid grid-cols-2 border-l border-r border-b border-black">
          <div className="border-r border-black p-4 bg-white font-semibold text-lg">
            Order Qty:
          </div>
          <div className="p-4 bg-white text-lg text-center">
            {card.order_quantity || ""}
          </div>
        </div>

        <div className="grid grid-cols-2 border-l border-r border-b border-black">
          <div className="border-r border-black p-4 bg-white font-semibold text-lg">
            Preferred Supplier:
          </div>
          <div className="p-4 bg-white text-lg text-center">
            {card.preferred_supplier || ""}
          </div>
        </div>

        <div className="grid grid-cols-2 border-l border-r border-b border-black">
          <div className="border-r border-black p-4 bg-white font-semibold text-lg">
            Lead Time:
          </div>
          <div className="p-4 bg-white text-lg text-center">
            {card.lead_time || ""}
          </div>
        </div>

        <div className="grid grid-cols-2 border-l border-r border-b border-black">
          <div className="border-r border-black p-4 bg-white font-semibold text-lg">
            Signature:
          </div>
          <div className="p-4 bg-white text-lg text-center min-h-[60px]">
            {/* Empty signature field */}
          </div>
        </div>
      </div>
    </div>
  );
}
