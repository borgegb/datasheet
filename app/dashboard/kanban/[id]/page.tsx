import React from "react";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Edit, FileText, Calendar } from "lucide-react";
import Link from "next/link";
import { fetchKanbanCardById } from "../actions";
import KanbanCardPreview from "../components/KanbanCardPreview";
import KanbanCardActions from "../components/KanbanCardActions";
import KanbanCardViewActions from "../components/KanbanCardViewActions";

// Client component for dropdown actions
interface KanbanCardViewPageProps {
  params: {
    id: string;
  };
}

export default async function KanbanCardViewPage({
  params,
}: KanbanCardViewPageProps) {
  const { id } = params;

  if (!id) {
    notFound();
  }

  const { data: card, error } = await fetchKanbanCardById(id);

  if (error || !card) {
    console.error("Error fetching kanban card:", error);
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
              <Link href="/dashboard/kanban">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Cards
              </Link>
            </Button>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              {/* PDF Action - Primary */}
              <KanbanCardActions
                cardId={card.id}
                partNo={card.part_no}
                hasPdf={!!card.pdf_storage_path}
                pdfStoragePath={card.pdf_storage_path}
              />

              {/* Edit Button */}
              <Button variant="outline" asChild>
                <Link href={`/dashboard/kanban/${card.id}/edit`}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </Link>
              </Button>

              {/* More Menu */}
              <KanbanCardViewActions cardId={card.id} partNo={card.part_no} />
            </div>
          </div>
        </div>
      </div>

      {/* Hero Section - Card Preview */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col items-center space-y-6">
          {/* Card Title & Status */}
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-semibold text-gray-900">
              {card.part_no}
            </h1>
            <div className="flex items-center justify-center gap-2">
              {card.pdf_storage_path ? (
                <Badge
                  variant="secondary"
                  className="bg-green-100 text-green-800"
                >
                  <FileText className="mr-1 h-3 w-3" />
                  PDF Ready
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="bg-orange-100 text-orange-800 border-orange-300"
                >
                  <Calendar className="mr-1 h-3 w-3" />
                  Generate PDF
                </Badge>
              )}
            </div>
          </div>

          {/* Card Preview - Hero Element */}
          <div className="flex justify-center w-full">
            <KanbanCardPreview card={card} />
          </div>

          {/* Minimal Metadata */}
          <div className="text-center text-sm text-gray-500 space-y-1">
            <p>Created {new Date(card.created_at!).toLocaleDateString()}</p>
            {card.updated_at !== card.created_at && (
              <p>Updated {new Date(card.updated_at!).toLocaleDateString()}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
