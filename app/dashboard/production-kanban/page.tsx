import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { fetchProductionKanbanCardsForOrg } from "./actions";
import ProductionKanbanTable from "./components/ProductionKanbanTable";

type SearchParams = Record<string, string | string[] | undefined>;

interface ProductionKanbanPageProps {
  searchParams?: SearchParams | Promise<SearchParams>;
}

function getSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

export default async function ProductionKanbanPage({
  searchParams,
}: ProductionKanbanPageProps) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const searchQuery = (getSingleParam(resolvedSearchParams.q) ?? "").trim();
  const page = parsePositiveInt(getSingleParam(resolvedSearchParams.page), 1);
  const pageSize = parsePositiveInt(
    getSingleParam(resolvedSearchParams.pageSize),
    25
  );

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
  const { data, totalCount, totalPages, error } =
    await fetchProductionKanbanCardsForOrg({
      page,
      pageSize,
      search: searchQuery,
    });

  if (!error && totalCount > 0 && page > totalPages) {
    const params = new URLSearchParams();
    if (searchQuery) {
      params.set("q", searchQuery);
    }
    params.set("page", String(totalPages));
    params.set("pageSize", String(pageSize));
    redirect(`/dashboard/production-kanban?${params.toString()}`);
  }

  return (
    <div className="flex flex-1 flex-col p-4 md:p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Production Kanban</h1>
          <p className="text-muted-foreground">
            Manage Production Kanban cards with A6 duplex and A5 folded PDF output.
          </p>
        </div>
        {userRole !== "viewer" && (
          <Button asChild>
            <Link href="/dashboard/production-kanban/new">
              <PlusIcon className="mr-2 h-4 w-4" />
              New Card
            </Link>
          </Button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/20 bg-destructive/10 p-4 text-destructive">
          Failed to load Production Kanban cards: {error.message}
        </div>
      )}

      <Suspense fallback={<div>Loading Production Kanban cards...</div>}>
        <ProductionKanbanTable
          cards={data || []}
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
