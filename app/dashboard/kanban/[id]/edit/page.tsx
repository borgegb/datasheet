import React from "react";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save, X, FileText, Calendar } from "lucide-react";
import Link from "next/link";
import { fetchKanbanCardById } from "../../actions";
import KanbanCardViewActions from "../../components/KanbanCardViewActions";
import KanbanCardEditForm from "../../components/KanbanCardEditForm";
// Editable card form component

interface EditKanbanCardPageProps {
  params: {
    id: string;
  };
}

export default async function EditKanbanCardPage({
  params,
}: EditKanbanCardPageProps) {
  const { id } = params;

  if (!id) {
    notFound();
  }

  const { data: card, error } = await fetchKanbanCardById(id);

  if (error || !card) {
    console.error("Error fetching kanban card for editing:", error);
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Clean Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Back Button */}
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/dashboard/kanban/${card.id}`}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Card
              </Link>
            </Button>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              {/* Delete action */}
              <KanbanCardViewActions cardId={card.id} partNo={card.part_no} />
            </div>
          </div>
        </div>
      </div>

      {/* Hero Section - Edit Form */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col items-center space-y-6">
          {/* Card Title & Status */}
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-semibold text-gray-900">
              Edit {card.part_no}
            </h1>
            <div className="flex items-center justify-center gap-2">
              <Badge
                variant="outline"
                className="bg-blue-100 text-blue-800 border-blue-300"
              >
                <FileText className="mr-1 h-3 w-3" />
                Editing
              </Badge>
            </div>
          </div>

          {/* Editable Card Form - Hero Element */}
          <div className="w-full max-w-2xl">
            <KanbanCardEditForm initialData={card} editingCardId={id} />
          </div>

          {/* Minimal Metadata */}
          <div className="text-center text-sm text-gray-500 space-y-1">
            <p>Created {new Date(card.created_at!).toLocaleDateString()}</p>
            {card.updated_at !== card.created_at && (
              <p>
                Last updated {new Date(card.updated_at!).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
