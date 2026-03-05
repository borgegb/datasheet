"use client";

import React from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { type KanbanHeaderColor } from "@/lib/kanban/colors";

interface ColorSelectorProps {
  value: KanbanHeaderColor;
  onChange: (value: KanbanHeaderColor) => void;
  name: string;
}

export default function ColorSelector({
  value,
  onChange,
  name,
}: ColorSelectorProps) {
  const colors = [
    {
      value: "red",
      label: "Red",
      bgColor: "bg-red-500",
      borderColor: "border-red-500",
    },
    {
      value: "orange",
      label: "Orange",
      bgColor: "bg-orange-500",
      borderColor: "border-orange-500",
    },
    {
      value: "green",
      label: "Green",
      bgColor: "bg-green-500",
      borderColor: "border-green-500",
    },
    {
      value: "yellow",
      label: "Yellow",
      bgColor: "bg-yellow-400",
      borderColor: "border-yellow-400",
    },
    {
      value: "blue",
      label: "Blue",
      bgColor: "bg-blue-500",
      borderColor: "border-blue-500",
    },
  ] as const;

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={value} />
      <RadioGroup
        value={value}
        onValueChange={(newValue) =>
          onChange(newValue as KanbanHeaderColor)
        }
        className="grid grid-cols-5 gap-2"
      >
        {colors.map((color) => (
          <div key={color.value} className="flex items-center">
            <RadioGroupItem
              value={color.value}
              id={`color-${color.value}`}
              className="sr-only"
            />
            <Label
              htmlFor={`color-${color.value}`}
              className={`
                flex items-center justify-center gap-1.5 cursor-pointer px-3 py-1.5 rounded-md border-2 transition-all w-full text-sm
                ${
                  value === color.value
                    ? `${color.bgColor} ${color.borderColor} ${
                        ["yellow"].includes(color.value)
                          ? "text-gray-900"
                          : "text-white"
                      }`
                    : `bg-white hover:bg-gray-50 border-gray-300 hover:${color.borderColor}`
                }
              `}
            >
              <div
                className={`w-3 h-3 rounded-full ${color.bgColor} ${
                  value === color.value ? "ring-2 ring-white" : ""
                } flex-shrink-0`}
              />
              <span className="font-medium truncate">{color.label}</span>
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}
