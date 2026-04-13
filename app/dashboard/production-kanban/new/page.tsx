import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import ProductionKanbanForm from "../components/ProductionKanbanForm";

export default function NewProductionKanbanPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/production-kanban">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Production Kanban
            </Link>
          </Button>
          <div />
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-semibold text-gray-900">
              Create Production Kanban
            </h1>
            <div className="flex items-center justify-center gap-2">
              <Badge
                variant="outline"
                className="border-amber-300 bg-amber-100 text-amber-800"
              >
                <Plus className="mr-1 h-3 w-3" />
                New Card
              </Badge>
            </div>
          </div>

          <div className="w-full">
            <ProductionKanbanForm />
          </div>
        </div>
      </div>
    </div>
  );
}
