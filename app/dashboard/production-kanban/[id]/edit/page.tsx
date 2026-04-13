import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { fetchProductionKanbanCardById } from "../../actions";
import ProductionKanbanForm from "../../components/ProductionKanbanForm";

interface EditProductionKanbanPageProps {
  params: {
    id: string;
  };
}

export default async function EditProductionKanbanPage({
  params,
}: EditProductionKanbanPageProps) {
  const { id } = params;

  if (!id) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/auth/login");
  }

  const { data: card, error } = await fetchProductionKanbanCardById(id);
  if (error || !card) {
    console.error("Error fetching Production Kanban card for editing:", error);
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/dashboard/production-kanban/${card.id}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Card
            </Link>
          </Button>
          <div />
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-semibold text-gray-900">
              Edit Production Kanban
            </h1>
            <div className="flex items-center justify-center gap-2">
              <Badge
                variant="outline"
                className="border-blue-300 bg-blue-100 text-blue-800"
              >
                <Pencil className="mr-1 h-3 w-3" />
                Editing
              </Badge>
            </div>
          </div>

          <div className="w-full">
            <ProductionKanbanForm initialData={card} editingCardId={id} />
          </div>
        </div>
      </div>
    </div>
  );
}
