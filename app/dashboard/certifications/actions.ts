"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function getUserProfileContext(): Promise<{
  organization_id: string | null;
  role: string | null;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single();
  return profile ?? null;
}

export async function getUserOrganizationId(): Promise<string | null> {
  const profile = await getUserProfileContext();
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
  const profile = await getUserProfileContext();
  const orgId = profile?.organization_id ?? null;
  const userRole = profile?.role ?? "viewer";

  if (!orgId) return { error: { message: "No organization" } };
  if (userRole !== "owner" && userRole !== "member") {
    return {
      error: { message: "You do not have permission to delete certifications" },
    };
  }

  // Soft-validate ownership
  const { data: row, error: readError } = await supabase
    .from("certifications")
    .select("id, pdf_storage_path")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();

  if (readError) return { error: readError };
  if (!row) return { error: { message: "Not found" } };

  // Delete file if exists
  if (row.pdf_storage_path) {
    const segments = row.pdf_storage_path.split("/");
    if (segments[0] !== orgId || segments[1] !== "certifications" ||
        segments.some((segment: string) => !segment || segment === "." || segment === "..")) {
      return { error: { message: "Invalid certificate file path. Nothing was deleted." } };
    }
    const { error: storageError } = await supabase.storage
      .from("datasheet-assets")
      .remove([row.pdf_storage_path]);
    if (storageError) {
      return { error: { message: "Could not remove the PDF. The record was kept; please retry." } };
    }
    // Storage can report an empty successful deletion when RLS hid the object.
    const { data: remaining, error: verifyError } = await supabase.storage
      .from("datasheet-assets")
      .list(segments.slice(0, -1).join("/"), { search: segments.at(-1), limit: 100 });
    if (verifyError || remaining?.some((file) => file.name === segments.at(-1))) {
      return { error: { message: "PDF removal could not be confirmed. The record was kept; please retry." } };
    }
  }

  const { error } = await supabase
    .from("certifications")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);

  if (!error) revalidatePath("/dashboard/certifications");
  return { error: error ? { message: "The PDF was removed, but its record could not be deleted. Please retry deletion." } : null };
}
