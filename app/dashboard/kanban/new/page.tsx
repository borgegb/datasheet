import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";
import KanbanCardForm from "../components/KanbanCardForm";

export default function NewKanbanCardPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Clean Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Back Button */}
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/kanban">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Cards
              </Link>
            </Button>

            {/* Page Title Area - Empty for clean look */}
            <div></div>
          </div>
        </div>
      </div>

      {/* Hero Section - Create Form */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col items-center space-y-6">
          {/* Page Title & Status */}
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-semibold text-gray-900">
              Create New Kanban Card
            </h1>
            <div className="flex items-center justify-center gap-2">
              <Badge
                variant="outline"
                className="bg-green-100 text-green-800 border-green-300"
              >
                <Plus className="mr-1 h-3 w-3" />
                New Card
              </Badge>
            </div>
          </div>

          {/* Create Form - Hero Element */}
          <div className="w-full max-w-2xl">
            <KanbanCardForm />
          </div>

          {/* Helper Text */}
          <div className="text-center text-sm text-gray-500 space-y-1">
            <p>Fill in the details to create your kanban card</p>
            <p>PDF will be generated automatically after saving</p>
          </div>
        </div>
      </div>
    </div>
  );
}
