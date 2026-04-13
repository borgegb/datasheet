import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Calendar, Edit, FileText, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { fetchProductionKanbanCardById } from "../actions";
import ProductionKanbanActions from "../components/ProductionKanbanActions";
import ProductionKanbanPreview from "../components/ProductionKanbanPreview";
import ProductionKanbanViewActions from "../components/ProductionKanbanViewActions";

interface ProductionKanbanViewPageProps {
  params: {
    id: string;
  };
}

export default async function ProductionKanbanViewPage({
  params,
}: ProductionKanbanViewPageProps) {
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const userRole = profile?.role || "viewer";
  const { data: card, error } = await fetchProductionKanbanCardById(id);

  if (error || !card) {
    console.error("Error fetching Production Kanban card:", error);
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/production-kanban">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Production Kanban
              </Link>
            </Button>

            <div className="flex items-center gap-2">
              <ProductionKanbanActions
                cardId={card.id}
                partNo={card.part_no}
                hasPdf={!!card.pdf_storage_path}
              />

              {userRole !== "viewer" && (
                <>
                  <Button variant="outline" asChild>
                    <Link href={`/dashboard/production-kanban/${card.id}/edit`}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </Link>
                  </Button>
                  <Button asChild>
                    <Link href="/dashboard/production-kanban/new">
                      <Plus className="h-4 w-4" />
                      New
                    </Link>
                  </Button>
                </>
              )}

              <ProductionKanbanViewActions
                cardId={card.id}
                partNo={card.part_no}
                userRole={userRole}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-semibold text-gray-900">{card.part_no}</h1>
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
                  className="border-orange-300 bg-orange-100 text-orange-800"
                >
                  <Calendar className="mr-1 h-3 w-3" />
                  Generate PDF
                </Badge>
              )}
              <Badge
                variant="outline"
                className="border-amber-300 bg-amber-100 text-amber-800"
              >
                Footer: {card.footer_code || "-"}
              </Badge>
            </div>
          </div>

          <ProductionKanbanPreview card={card} />

          <div className="space-y-1 text-center text-sm text-gray-500">
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
