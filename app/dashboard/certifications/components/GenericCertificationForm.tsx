"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Save, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { FieldSpec } from "../registry";
import { CERT_TYPES } from "../registry";

interface Props {
  typeSlug: string;
}

export default function GenericCertificationForm({ typeSlug }: Props) {
  const typeDef = CERT_TYPES[typeSlug];
  if (!typeDef) {
    return (
      <div className="p-6 text-destructive">Unknown certification type.</div>
    );
  }
  const router = useRouter();
  const [form, setForm] = React.useState<Record<string, any>>(typeDef.defaults);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [organizationId, setOrganizationId] = React.useState<string | null>(
    null
  );

  React.useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data?.user;
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();
      setOrganizationId(profile?.organization_id ?? null);
    });
  }, []);

  const renderField = (f: FieldSpec) => {
    if (f.type === "select") {
      // Minimal select using native input to avoid extra deps
      return (
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={form[f.name] ?? ""}
          onChange={(e) => setForm((s) => ({ ...s, [f.name]: e.target.value }))}
        >
          <option value="">Select…</option>
          {(f.options || []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }

    return (
      <Input
        type={f.type === "date" ? "date" : "text"}
        value={form[f.name] ?? ""}
        placeholder={f.placeholder}
        onChange={(e) => setForm((s) => ({ ...s, [f.name]: e.target.value }))}
      />
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // Lightweight validation for required fields present in schema
      const parse = typeDef.schema.safeParse(form);
      if (!parse.success) {
        const first = parse.error.issues[0];
        throw new Error(first?.message || "Please fill required fields");
      }

      const res = await fetch(
        `/api/generate-certification-pdf/${typeDef.slug}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ certification: form, organizationId }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to generate PDF");
      if (data?.url) {
        toast.success(`${typeDef.title} PDF generated`);
        window.open(data.url, "_blank");
        router.push("/dashboard/certifications");
      } else {
        throw new Error("No URL returned");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to generate PDF");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>New {typeDef.title} Certificate</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {typeDef.fieldLayout.map((f) => (
              <div key={f.name} className="space-y-1.5">
                <Label>{f.label}</Label>
                {renderField(f)}
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <FileText className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {isSubmitting ? "Generating..." : "Generate PDF"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
