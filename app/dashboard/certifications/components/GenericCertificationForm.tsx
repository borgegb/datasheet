"use client";

import React from "react";
import { useRouter } from "next/navigation";
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
  CheckCircle2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { FieldSpec } from "../registry";
import { CERT_TYPES } from "../registry";
import { euDocHoldReason, SERIAL_NUMBER_FORMAT_MESSAGE, serialisedDeclarationNumber, serialisedProductFields } from "@/lib/certifications/release";
import type { EuDocProductOptions } from "@/lib/certifications/products";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";

const VM350_SERIAL_PREFIX = "AP";

type ProductSearchResult = {
  id: string;
  product_title: string | null;
  product_code: string | null;
  eu_doc_product_type?: "blast-machine" | "pto-compressor" | null;
  eu_doc_ped_category?: "cat-ii" | "cat-iii" | null;
  eu_doc_certificate_no?: string | null;
};

const EU_DOC_TYPE_SLUGS = new Set([
  "eu-doc-owner-manual-blasting",
  "eu-doc-owner-manual-pto-compressors",
  "eu-doc-serialised",
]);

function productDisplayName(product: ProductSearchResult) {
  return product.product_title || product.product_code || "Untitled product";
}

function productTypeLabel(productType: ProductSearchResult["eu_doc_product_type"]) {
  if (productType === "blast-machine") return "Mobile abrasive blast machine";
  if (productType === "pto-compressor") return "PTO-driven air compressor";
  return "Product type missing";
}

function pedCategoryLabel(pedCategory: ProductSearchResult["eu_doc_ped_category"]) {
  if (pedCategory === "cat-ii") return "Cat. II / Module A2";
  if (pedCategory === "cat-iii") return "Cat. III / Module B + C2";
  return "PED category missing";
}

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
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (nextValue: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const dateObj = value ? new Date(value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
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
  const middleInputRef = React.useRef<HTMLInputElement>(null);
  const suffixInputRef = React.useRef<HTMLInputElement>(null);

  const focusMiddleInput = () => {
    middleInputRef.current?.focus();
    middleInputRef.current?.setSelectionRange(
      middleInputRef.current.value.length,
      middleInputRef.current.value.length
    );
  };

  const focusSuffixInput = () => {
    suffixInputRef.current?.focus();
    suffixInputRef.current?.setSelectionRange(
      suffixInputRef.current.value.length,
      suffixInputRef.current.value.length
    );
  };

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
        ref={middleInputRef}
        value={middle}
        inputMode="numeric"
        maxLength={2}
        aria-label="Serial number middle digits"
        placeholder="00"
        className="w-16 text-center font-mono"
        onChange={(e) => {
          const nextMiddle = sanitizeSerialChunk(e.target.value, 2);
          onChange(
            buildVm350SerialNumber(nextMiddle, suffix)
          );

          if (nextMiddle.length === 2) {
            requestAnimationFrame(focusSuffixInput);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" && middle.length === 2) {
            e.preventDefault();
            focusSuffixInput();
          }
        }}
      />
      <span className="text-muted-foreground">-</span>
      <Input
        ref={suffixInputRef}
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
        onKeyDown={(e) => {
          if (e.key === "Backspace" && suffix.length === 0) {
            e.preventDefault();
            focusMiddleInput();
          }

          if (e.key === "ArrowLeft" && e.currentTarget.selectionStart === 0) {
            e.preventDefault();
            focusMiddleInput();
          }
        }}
      />
    </div>
  );
}

interface Props {
  typeSlug: string;
  euDocProducts?: EuDocProductOptions;
}

export default function GenericCertificationForm({ typeSlug, euDocProducts }: Props) {
  const router = useRouter();
  const typeDef = CERT_TYPES[typeSlug];
  if (!typeDef) {
    return (
      <div className="p-6 text-destructive">Unknown certification type.</div>
    );
  }
  const [form, setForm] = React.useState<Record<string, any>>(typeDef.defaults);
  const [productId, setProductId] = React.useState<string>("");
  const [productLabel, setProductLabel] = React.useState<string>("");
  const [productQuery, setProductQuery] = React.useState<string>("");
  const [productResults, setProductResults] = React.useState<
    ProductSearchResult[]
  >([]);
  const [selectedProduct, setSelectedProduct] =
    React.useState<ProductSearchResult | null>(null);
  const [isSearchingProducts, setIsSearchingProducts] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [documentMode, setDocumentMode] = React.useState<"test" | "issued">("test");
  const [generatedPdfUrl, setGeneratedPdfUrl] = React.useState<string | null>(
    null
  );
  const [organizationId, setOrganizationId] = React.useState<string | null>(
    null
  );
  const requiresEuDocProduct = EU_DOC_TYPE_SLUGS.has(typeSlug);
  const holdReason = euDocHoldReason(typeSlug, selectedProduct?.eu_doc_product_type);
  const declarationNumber = typeSlug === "eu-doc-serialised"
    ? serialisedDeclarationNumber(form.serialNumber) : null;
  const formValues = typeSlug === "eu-doc-serialised"
    ? { ...form, declarationNumber: declarationNumber ?? "" } : form;
  const updateField = (name: string, value: string) => {
    setForm((current) => ({ ...current, [name]: value }));
    setGeneratedPdfUrl(null);
  };

  React.useEffect(() => {
    if (requiresEuDocProduct || holdReason) return;
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
  }, [requiresEuDocProduct, holdReason]);

  // Debounced product search
  React.useEffect(() => {
    let timer: any;
    const run = async () => {
      if (requiresEuDocProduct || holdReason) return;
      if (!organizationId) return;
      const q = productQuery.trim();
      if (q.length < 2) {
        setProductResults([]);
        return;
      }
      setIsSearchingProducts(true);
      try {
        const supabase = createClient();
        const safeQuery = q.replace(/[%(),]/g, "");
        // Search by title or code
        const { data, error } = await supabase
          .from("products")
          .select(
            "id, product_title, product_code, eu_doc_product_type, eu_doc_ped_category, eu_doc_certificate_no"
          )
          .eq("organization_id", organizationId)
          .or(
            `product_title.ilike.%${safeQuery}%,product_code.ilike.%${safeQuery}%`
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
  }, [productQuery, organizationId, requiresEuDocProduct, holdReason]);

  const getPlaceholder = (f: FieldSpec) => {
    if (typeSlug !== "eu-doc-serialised") {
      return f.placeholder;
    }

    if (selectedProduct?.eu_doc_product_type === "pto-compressor") {
      if (f.name === "commercialName") return "e.g., VariMount 350";
      if (f.name === "modelType") return "e.g., VM-A-0001";
    }

    if (f.name === "commercialName") return "e.g., Blast Machine BP200L";
    if (f.name === "modelType") return "e.g., BP-A-5000";

    return f.placeholder;
  };

  const selectProduct = (product: ProductSearchResult) => {
    setProductId(product.id);
    setSelectedProduct(product);
    setProductLabel(productDisplayName(product));
    setProductQuery("");
    setProductResults([]);

    if (typeSlug === "eu-doc-serialised") {
      setForm((current) => ({
        ...current,
        ...serialisedProductFields(product),
      }));
    }
    setGeneratedPdfUrl(null);
  };

  const clearProductSelection = () => {
    setProductLabel("");
    setProductId("");
    setSelectedProduct(null);
  };

  const renderField = (f: FieldSpec) => {
    // Special case: model uses the product search input; store chosen title in form.model
    if (f.name === "model") {
      return (
        <div className="relative">
          <Input
            id={f.name}
            placeholder="Search product by name or code..."
            value={productLabel || productQuery}
            onChange={(e) => {
              clearProductSelection();
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
                        selectProduct(p);
                        setForm((s) => ({
                          ...s,
                          model: productDisplayName(p),
                        }));
                      }}
                    >
                      <span className="font-medium">
                        {productDisplayName(p)}
                      </span>
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
          id={f.name}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={form[f.name] ?? ""}
          onChange={(e) => updateField(f.name, e.target.value)}
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
          id={f.name}
          value={(form[f.name] as string) ?? ""}
          onChange={(nextValue) => updateField(f.name, nextValue)}
        />
      );
    }

    return (
      <Input
        id={f.name}
        type="text"
        value={formValues[f.name] ?? ""}
        readOnly={typeSlug === "eu-doc-serialised" && f.name === "declarationNumber"}
        placeholder={getPlaceholder(f)}
        onChange={(e) => updateField(f.name, e.target.value)}
      />
    );
  };

  const renderEuDocProductSelector = () => {
    if (!requiresEuDocProduct) {
      return null;
    }

    const certificateNo = selectedProduct?.eu_doc_certificate_no?.trim() || "";

    return (
      <div className="space-y-2">
        <Label htmlFor="eu-doc-product">Product</Label>
        {euDocProducts?.error ? (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-destructive">{euDocProducts.error}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => router.refresh()}>Retry</Button>
          </div>
        ) : (
          <Select value={productId} onValueChange={(id) => {
            const product = euDocProducts?.data.find((item) => item.id === id);
            if (product) selectProduct(product);
          }} disabled={!euDocProducts?.data.length}>
            <SelectTrigger id="eu-doc-product" className="data-[size=default]:h-auto min-h-10 w-full text-left [&_[data-slot=select-value]]:line-clamp-none [&_span]:whitespace-normal">
              <SelectValue placeholder={euDocProducts?.data.length ? "Select product" : "No configured blast machines available"} />
            </SelectTrigger>
            <SelectContent className="max-w-[calc(100vw-2rem)]">
              {euDocProducts?.data.map((product) => (
                <SelectItem key={product.id} value={product.id} className="whitespace-normal break-words">
                  {productDisplayName(product)}{product.product_code ? ` (${product.product_code})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {!euDocProducts?.error && !euDocProducts?.data.length && (
          <p role="status" className="text-sm text-muted-foreground">An organization owner must configure product type, PED category and certificate number before a product is available.</p>
        )}
        {selectedProduct && (
          <div className="grid grid-cols-1 gap-3 border-b py-3 text-sm sm:grid-cols-3 [&>div]:min-w-0 [&>div]:break-words">
            <div>
              <span className="block font-medium">Product type</span>
              <span className="text-muted-foreground">
                {productTypeLabel(selectedProduct.eu_doc_product_type)}
              </span>
            </div>
            <div>
              <span className="block font-medium">PED route</span>
              <span className="text-muted-foreground">
                {pedCategoryLabel(selectedProduct.eu_doc_ped_category)}
              </span>
            </div>
            <div>
              <span className="block font-medium">Certificate</span>
              <span
                className={
                  certificateNo
                    ? "text-muted-foreground"
                    : "font-medium text-destructive"
                }
              >
                {certificateNo || "Missing - generation blocked"}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setGeneratedPdfUrl(null);
    try {
      if (holdReason) throw new Error(holdReason);
      if (typeSlug === "eu-doc-serialised" && !declarationNumber) {
        throw new Error(SERIAL_NUMBER_FORMAT_MESSAGE);
      }
      // Lightweight validation for required fields present in schema
      const parse = typeDef.schema.safeParse(formValues);
      if (!parse.success) {
        const first = parse.error.issues[0];
        throw new Error(first?.message || "Please fill required fields");
      }

      if (requiresEuDocProduct && !productId) {
        throw new Error("Select a product before generating this DoC.");
      }

      const res = await fetch(
        `/api/generate-certification-pdf/${typeDef.slug}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            certification: formValues,
            organizationId,
            productId: productId || null,
            ...(requiresEuDocProduct ? { documentMode } : {}),
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to generate PDF");
      if (data?.url) {
        setGeneratedPdfUrl(data.url);
        router.refresh();
        toast.success(`${requiresEuDocProduct && documentMode === "test" ? "Test" : typeDef.title} PDF generated`, {
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
        {holdReason ? (
          <p role="status" className="text-sm text-muted-foreground">{holdReason}</p>
        ) : (
        <form onSubmit={handleSubmit} onChange={() => setGeneratedPdfUrl(null)} className="space-y-6">
          {requiresEuDocProduct && (
            <fieldset className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <legend className="mb-2 text-sm font-medium">Document status</legend>
              {(["test", "issued"] as const).map((mode) => (
                <label key={mode} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="documentMode" value={mode} checked={documentMode === mode}
                    onChange={() => { setDocumentMode(mode); setGeneratedPdfUrl(null); }} />
                  {mode === "test" ? "Test / not for issue (unsigned)" : "Issue signed DoC"}
                </label>
              ))}
            </fieldset>
          )}
          {renderEuDocProductSelector()}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {typeDef.fieldLayout.map((f) => (
              <div key={f.name} className="space-y-1.5">
                <Label htmlFor={f.name}>{f.label}</Label>
                {renderField(f)}
              </div>
            ))}
          </div>
          {generatedPdfUrl && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium text-foreground">
                      Certificate ready
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Open the latest generated {typeDef.title.toLowerCase()}.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => window.open(generatedPdfUrl, "_blank")}
                >
                  Open Certificate
                </Button>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="submit" disabled={isSubmitting || (requiresEuDocProduct && (!productId || Boolean(euDocProducts?.error)))}>
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {isSubmitting ? "Generating..." : requiresEuDocProduct && documentMode === "test" ? "Generate test PDF" : "Generate PDF"}
            </Button>
          </div>
        </form>
        )}
      </CardContent>
    </Card>
  );
}
