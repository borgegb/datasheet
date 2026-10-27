"use server";

import { createClient } from "@/lib/supabase/server";
import type {
  ExistingCard,
  ExistingProduct,
  ImportReference,
} from "@/lib/kanban/import-model";

export async function getImportReference(): Promise<
  { data: ImportReference; error?: never } | { data?: never; error: string }
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user)
      return {
        error:
          "Sign in to check this batch against your organisation’s records.",
      };
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();
    if (error || !profile?.organization_id)
      return {
        error: "Your organisation could not be loaded. Please try again.",
      };
    async function readAll<T>(
      table: "kanban_cards" | "products",
      fields: string,
    ): Promise<T[]> {
      const rows: T[] = [];
      for (let offset = 0; offset < 50000; offset += 1000) {
        const { data, error: queryError } = await supabase
          .from(table)
          .select(fields)
          .eq("organization_id", profile!.organization_id)
          .order("id")
          .range(offset, offset + 999);
        if (queryError || !data) throw new Error("Reference lookup failed");
        rows.push(...(data as unknown as T[]));
        if (data.length < 1000) return rows;
      }
      throw new Error("Reference dataset exceeds preview limit");
    }
    const [cards, products] = await Promise.all([
      readAll<ExistingCard>(
        "kanban_cards",
        "id,part_no,location,header_color,description,preferred_supplier,order_quantity,lead_time",
      ),
      readAll<ExistingProduct>("products", "id,product_code,product_title"),
    ]);
    return { data: { cards, products } };
  } catch {
    return {
      error:
        "We couldn’t complete the duplicate check. Reload the page before reviewing an import.",
    };
  }
}
