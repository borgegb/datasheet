"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function getUserOrganizationId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();
  return profile?.organization_id ?? null;
}

export type CertificationRow = {
  id: string;
  organization_id: string;
  type: string;
  title: string | null;
  data: any;
  pdf_storage_path: string | null;
  product_id: string | null;
  created_at: string;
};

export async function fetchCertificationsForOrg() {
  const supabase = await createClient();
  const orgId = await getUserOrganizationId();
  if (!orgId) return { data: [], error: { message: "No organization" } };

  const { data, error } = await supabase
    .from("certifications")
    .select(
      "id, organization_id, type, title, data, pdf_storage_path, product_id, created_at"
    )
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (error) return { data: [], error };
  return { data: data as CertificationRow[], error: null };
}

export async function deleteCertification(id: string) {
  const supabase = await createClient();
  const orgId = await getUserOrganizationId();
  if (!orgId) return { error: { message: "No organization" } };

  // Soft-validate ownership
  const { data: row } = await supabase
    .from("certifications")
    .select("id, pdf_storage_path")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();

  if (!row) return { error: { message: "Not found" } };

  // Delete file if exists
  if (row.pdf_storage_path) {
    await supabase.storage
      .from("datasheet-assets")
      .remove([row.pdf_storage_path]);
  }

  const { error } = await supabase
    .from("certifications")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);

  if (!error) revalidatePath("/dashboard/certifications");
  return { error };
}
