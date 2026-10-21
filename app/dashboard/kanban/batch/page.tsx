import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KanbanImportReview } from "./components/kanban-import-review";
import { getImportReference } from "./reference";

export default async function BatchKanbanPage() {
  const result = await getImportReference();
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:p-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/kanban">
            <ArrowLeft /> Kanban cards
          </Link>
        </Button>
      </div>
      {result.error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-6"
        >
          <h1 className="text-xl font-semibold">Batch review unavailable</h1>
          <p className="mt-2 text-sm">{result.error}</p>
          <Link
            className="mt-4 inline-block underline"
            href="/dashboard/kanban/batch"
          >
            Retry duplicate check
          </Link>
        </div>
      ) : (
        <KanbanImportReview reference={result.data!} />
      )}
    </div>
  );
}
