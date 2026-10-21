import { notFound } from "next/navigation";
import { KanbanImportReview } from "@/app/dashboard/kanban/batch/components/kanban-import-review";
import { demoReference } from "@/lib/kanban/import-demo";

export default function KanbanImportPreview() {
  if (
    process.env.NODE_ENV !== "development" &&
    process.env.VERCEL_ENV !== "preview"
  ) {
    notFound();
  }
  return (
    <main className="mx-auto min-h-screen max-w-[1800px] p-4 md:p-8">
      <KanbanImportReview reference={demoReference()} demo />
    </main>
  );
}
