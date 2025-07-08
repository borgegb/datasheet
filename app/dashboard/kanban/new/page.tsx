import React from "react";
import KanbanCardForm from "../components/KanbanCardForm";

export default function NewKanbanCardPage() {
  return (
    <div className="flex flex-col flex-1 p-4 md:p-6">
      <KanbanCardForm />
    </div>
  );
}
