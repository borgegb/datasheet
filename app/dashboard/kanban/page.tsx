import React, { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { fetchKanbanCardsForOrg } from "./actions";
import KanbanCardsTable from "./components/KanbanCardsTable";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

interface KanbanCardsPageProps {
  searchParams?: SearchParams | Promise<SearchParams>;
}

function getSingleParam(
  value: string | string[] | undefined
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

export default async function KanbanCardsPage({
  searchParams,
}: KanbanCardsPageProps) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const searchQuery = (getSingleParam(resolvedSearchParams.q) ?? "").trim();
  const page = parsePositiveInt(getSingleParam(resolvedSearchParams.page), 1);
  const pageSize = parsePositiveInt(
    getSingleParam(resolvedSearchParams.pageSize),
    25
  );

  // Get user role for conditional UI
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  
  if (userError || !user) {
    redirect("/auth/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const userRole = profile?.role || "viewer"; // Default to viewer if no role found

  // Fetch kanban cards server-side with pagination and search
  const { data: kanbanCards, totalCount, totalPages, error } =
    await fetchKanbanCardsForOrg({
      page,
      pageSize,
      search: searchQuery,
    });

  if (error) {
    console.error("Error fetching kanban cards:", error);
  }

  if (!error && totalCount > 0 && page > totalPages) {
    const params = new URLSearchParams();
    if (searchQuery) {
      params.set("q", searchQuery);
    }
    params.set("page", String(totalPages));
    params.set("pageSize", String(pageSize));
    redirect(`/dashboard/kanban?${params.toString()}`);
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
        {/* Only show New Card button for owners and members */}
        {userRole !== "viewer" && (
          <Button asChild>
            <Link href="/dashboard/kanban/new">
              <PlusIcon className="mr-2 h-4 w-4" />
              New Card
            </Link>
          </Button>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-4 border border-destructive/20 bg-destructive/10 text-destructive rounded-md">
          Failed to load kanban cards: {error.message}
        </div>
      )}

      {/* Cards Table */}
      <Suspense fallback={<div>Loading kanban cards...</div>}>
        <KanbanCardsTable
          cards={kanbanCards || []}
          searchQuery={searchQuery}
          page={Math.min(page, totalPages)}
          pageSize={pageSize}
          totalCount={totalCount}
          totalPages={totalPages}
          userRole={userRole}
        />
      </Suspense>
    </div>
  );
}
