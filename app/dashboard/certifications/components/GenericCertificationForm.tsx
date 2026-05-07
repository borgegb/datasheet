"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Save,
  Loader2,
  Calendar as CalendarIcon,
  ChevronDown,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { FieldSpec } from "../registry";
import { CERT_TYPES } from "../registry";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";

const VM350_SERIAL_PREFIX = "AP";

function sanitizeSerialChunk(value: string, length: number) {
  return value.replace(/\D/g, "").slice(0, length);
}

function splitVm350SerialNumber(value: string) {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const withoutPrefix = normalized.startsWith(VM350_SERIAL_PREFIX)
    ? normalized.slice(VM350_SERIAL_PREFIX.length)
    : normalized;

  return {
    prefix: VM350_SERIAL_PREFIX,
    middle: withoutPrefix.slice(0, 2),
    suffix: withoutPrefix.slice(2, 6),
  };
}

function buildVm350SerialNumber(middle: string, suffix: string) {
  if (!middle && !suffix) return "";
  return `${VM350_SERIAL_PREFIX}-${middle}-${suffix}`;
}

function DateField({
  value,
  onChange,
}: {
  value: string;
  onChange: (nextValue: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const dateObj = value ? new Date(value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          data-empty={!dateObj}
          className="data-[empty=true]:text-muted-foreground w-full justify-between font-normal"
        >
          <span className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4" />
            {dateObj ? format(dateObj, "PPP") : <span>Pick a date</span>}
          </span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={dateObj}
          captionLayout="dropdown"
          onSelect={(date) => {
            onChange(
              date
                ? new Date(
                    Date.UTC(
                      date.getFullYear(),
                      date.getMonth(),
                      date.getDate()
                    )
                  ).toISOString()
                : ""
            );
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function Vm350SerialNumberField({
  value,
  onChange,
}: {
  value: string;
  onChange: (nextValue: string) => void;
}) {
  const { prefix, middle, suffix } = splitVm350SerialNumber(value);

  return (
    <div className="flex items-center gap-2">
      <Input
        value={prefix}
        readOnly
        aria-label="Serial number prefix"
        className="w-16 text-center font-mono"
      />
      <span className="text-muted-foreground">-</span>
      <Input
        value={middle}
        inputMode="numeric"
        maxLength={2}
        aria-label="Serial number middle digits"
        placeholder="00"
        className="w-16 text-center font-mono"
        onChange={(e) => {
          onChange(
            buildVm350SerialNumber(
              sanitizeSerialChunk(e.target.value, 2),
              suffix
            )
          );
        }}
      />
      <span className="text-muted-foreground">-</span>
      <Input
        value={suffix}
        inputMode="numeric"
        maxLength={4}
        aria-label="Serial number last digits"
        placeholder="0000"
        className="w-24 text-center font-mono"
        onChange={(e) => {
          onChange(
            buildVm350SerialNumber(
              middle,
              sanitizeSerialChunk(e.target.value, 4)
            )
          );
        }}
      />
    </div>
  );
}

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
  const [productId, setProductId] = React.useState<string>("");
  const [productLabel, setProductLabel] = React.useState<string>("");
  const [productQuery, setProductQuery] = React.useState<string>("");
  const [productResults, setProductResults] = React.useState<
    { id: string; product_title: string; product_code: string | null }[]
  >([]);
  const [isSearchingProducts, setIsSearchingProducts] = React.useState(false);
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

  // Debounced product search
  React.useEffect(() => {
    let timer: any;
    const run = async () => {
      if (!organizationId) return;
      const q = productQuery.trim();
      if (q.length < 2) {
        setProductResults([]);
        return;
      }
      setIsSearchingProducts(true);
      try {
        const supabase = createClient();
        // Search by title or code
        const { data, error } = await supabase
          .from("products")
          .select("id, product_title, product_code")
          .eq("organization_id", organizationId)
          .or(
            `product_title.ilike.%${q.replace(
              /%/g,
              ""
            )}%,product_code.ilike.%${q.replace(/%/g, "")}%)`
          )
          .order("updated_at", { ascending: false })
          .limit(10);
        if (!error && Array.isArray(data)) {
          setProductResults(data as any);
        } else {
          setProductResults([]);
        }
      } catch (e) {
        setProductResults([]);
      } finally {
        setIsSearchingProducts(false);
      }
    };
    timer = setTimeout(run, 250);
    return () => clearTimeout(timer);
  }, [productQuery, organizationId]);

  const renderField = (f: FieldSpec) => {
    // Special case: model uses the product search input; store chosen title in form.model
    if (f.name === "model") {
      return (
        <div className="relative">
          <Input
            placeholder="Search product by name or code..."
            value={productLabel || productQuery}
            onChange={(e) => {
              setProductLabel("");
              setProductId("");
              setForm((s) => ({ ...s, model: "" }));
              setProductQuery(e.target.value);
            }}
          />
          {productQuery.length >= 2 && (
            <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow">
              <div className="max-h-64 overflow-auto text-sm">
                {isSearchingProducts ? (
                  <div className="px-3 py-2 text-muted-foreground">
                    Searching...
                  </div>
                ) : productResults.length === 0 ? (
                  <div className="px-3 py-2 text-muted-foreground">
                    No results
                  </div>
                ) : (
                  productResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent"
                      onClick={() => {
                        setProductId(p.id);
                        const titleOnly = p.product_title;
                        setProductLabel(titleOnly);
                        setForm((s) => ({ ...s, model: titleOnly }));
                        setProductQuery("");
                        setProductResults([]);
                      }}
                    >
                      <span className="font-medium">{p.product_title}</span>
                      {p.product_code && (
                        <span className="text-muted-foreground text-xs">
                          ({p.product_code})
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (typeSlug === "ec-vm-350-declaration" && f.name === "serialNumber") {
      return (
        <Vm350SerialNumberField
          value={(form[f.name] as string) ?? ""}
          onChange={(nextValue) =>
            setForm((current) => ({ ...current, [f.name]: nextValue }))
          }
        />
      );
    }

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

    if (f.type === "date") {
      return (
        <DateField
          value={(form[f.name] as string) ?? ""}
          onChange={(nextValue) =>
            setForm((current) => ({ ...current, [f.name]: nextValue }))
          }
        />
      );
    }

    return (
      <Input
        type="text"
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
          body: JSON.stringify({
            certification: form,
            organizationId,
            productId: productId || null,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to generate PDF");
      if (data?.url) {
        toast.success(`✅ ${typeDef.title} PDF generated!`, {
          description: "Click the button to open your generated PDF.",
          action: (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(data.url, "_blank")}
            >
              Open PDF
            </Button>
          ),
          duration: 15000,
        });
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
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
