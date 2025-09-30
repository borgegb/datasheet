"use client";

import React from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

interface ColorSelectorProps {
  value:
    | "red"
    | "orange"
    | "green"
    | "yellow"
    | "blue"
    | "purple"
    | "brown"
    | "pink"
    | "teal"
    | "cyan"
    | "gray"
    | "magenta"
    | "lime"
    | "silver";
  onChange: (
    value:
      | "red"
      | "orange"
      | "green"
      | "yellow"
      | "blue"
      | "purple"
      | "brown"
      | "pink"
      | "teal"
      | "cyan"
      | "gray"
      | "magenta"
      | "lime"
      | "silver"
  ) => void;
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
    {
      value: "purple",
      label: "Purple",
      bgColor: "bg-purple-500",
      borderColor: "border-purple-500",
    },
    {
      value: "brown",
      label: "Brown",
      bgColor: "bg-amber-700",
      borderColor: "border-amber-700",
    },
    {
      value: "pink",
      label: "Pink",
      bgColor: "bg-pink-400",
      borderColor: "border-pink-400",
    },
    {
      value: "teal",
      label: "Teal",
      bgColor: "bg-teal-500",
      borderColor: "border-teal-500",
    },
    {
      value: "cyan",
      label: "Cyan",
      bgColor: "bg-cyan-400",
      borderColor: "border-cyan-400",
    },
    {
      value: "gray",
      label: "Gray",
      bgColor: "bg-gray-500",
      borderColor: "border-gray-500",
    },
    {
      value: "magenta",
      label: "Magenta",
      bgColor: "bg-fuchsia-500",
      borderColor: "border-fuchsia-500",
    },
    {
      value: "lime",
      label: "Lime",
      bgColor: "bg-lime-400",
      borderColor: "border-lime-400",
    },
    {
      value: "silver",
      label: "Silver",
      bgColor: "bg-gray-400",
      borderColor: "border-gray-400",
    },
  ] as const;

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={value} />
      <RadioGroup
        value={value}
        onValueChange={(newValue) =>
          onChange(
            newValue as
              | "red"
              | "orange"
              | "green"
              | "yellow"
              | "blue"
              | "purple"
              | "brown"
              | "pink"
              | "teal"
              | "cyan"
              | "gray"
              | "magenta"
              | "lime"
              | "silver"
          )
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
                        ["yellow", "pink", "cyan", "lime", "silver"].includes(
                          color.value
                        )
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
