import React, { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { fetchKanbanCardsForOrg } from "./actions";
import KanbanCardsTable from "./components/KanbanCardsTable";


export default async function KanbanCardsPage() {
  // Fetch kanban cards server-side
  const { data: kanbanCards, error } = await fetchKanbanCardsForOrg();

  if (error) {
    console.error("Error fetching kanban cards:", error);
  }

  return (
    <div className="flex flex-col flex-1 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Kanban Cards</h1>
          <p className="text-muted-foreground">
            Manage your inventory kanban cards
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/kanban/new">
            <PlusIcon className="mr-2 h-4 w-4" />
            New Card
          </Link>
        </Button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-4 border border-destructive/20 bg-destructive/10 text-destructive rounded-md">
          Failed to load kanban cards: {error.message}
        </div>
      )}

      {/* Cards Table */}
      <Suspense fallback={<div>Loading kanban cards...</div>}>
        <KanbanCardsTable initialData={kanbanCards || []} />
      </Suspense>
    </div>
  );
}
