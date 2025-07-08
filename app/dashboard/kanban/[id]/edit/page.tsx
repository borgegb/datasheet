import React from "react";
import { notFound } from "next/navigation";
import KanbanCardForm from "../../components/KanbanCardForm";
import { fetchKanbanCardById } from "../../actions";

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
    <div className="flex flex-col flex-1 p-4 md:p-6">
      <KanbanCardForm initialData={card} editingCardId={id} />
    </div>
  );
}
