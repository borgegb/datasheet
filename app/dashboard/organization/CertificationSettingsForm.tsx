"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle2, ImageIcon, Loader2, RefreshCw, Save, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CertificationSettings } from "@/lib/certifications/settings";
import { fetchCertificationSettingsForOrg, updateCertificationSettings } from "../actions";

export default function CertificationSettingsForm({
  settings,
  errorMessage,
}: {
  settings: CertificationSettings;
  errorMessage?: string;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [storedPreview, setStoredPreview] = useState(settings.signaturePreviewUrl || null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [disableSignature, setDisableSignature] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();

  useEffect(() => {
    setStoredPreview(settings.signaturePreviewUrl || null);
    setPreviewFailed(false);
  }, [settings.signaturePreviewUrl]);

  useEffect(() => () => {
    if (localPreview) URL.revokeObjectURL(localPreview);
  }, [localPreview]);

  function clearSelection() {
    setSelectedFile(null);
    setLocalPreview(null);
    setPreviewFailed(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  const [state, submit, isPending] = useActionState(
    async (_previous: { error: string | null }, formData: FormData) => {
      // Preserve the selected File if React reset the native input after an earlier error.
      if (selectedFile) formData.set("signatureFile", selectedFile);
      if (disableSignature) formData.set("removeSignature", "on");
      else formData.delete("removeSignature");
      try {
        const result = await updateCertificationSettings(formData);
        if (result.error) return { error: result.error.message };
        clearSelection();
        setDisableSignature(false);
        toast.success("Certification settings updated.");
        return { error: null };
      } catch {
        return { error: "Could not save certification settings. Please try again." };
      }
    },
    { error: null }
  );

  const previewUrl = localPreview || storedPreview;
  const status = disableSignature
    ? "Will be disabled on save"
    : selectedFile
      ? "Signature ready to save"
      : settings.signatureConfigured
        ? "Signature configured"
        : "No signature configured";

  return (
    <form action={submit} className="min-w-0 space-y-6">
      {errorMessage && <p className="text-sm text-destructive" role="alert">{errorMessage}</p>}

      <div className="max-w-48 space-y-2">
        <Label htmlFor="template-revision">Template revision</Label>
        <Input id="template-revision" name="templateRevision" defaultValue={settings.templateRevision} required disabled={isPending} />
      </div>

      <section className="min-w-0 space-y-4 border-t pt-6" aria-labelledby="signature-heading">
        <div className="space-y-1">
          <h3 id="signature-heading" className="text-sm font-medium">Mark Clendennen&apos;s signature</h3>
          <p className="text-sm text-muted-foreground">Managing Director</p>
        </div>

        <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))]">
          <div className="min-w-0 space-y-3">
            <div className="flex aspect-[3/1] w-full items-center justify-center overflow-hidden rounded-md border bg-white p-4">
              {previewUrl && !previewFailed ? (
                // The stored URL is short-lived and issued only to the organization owner.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt={selectedFile ? "Selected signature preview" : "Stored signature preview"}
                  className={`h-full w-full object-contain ${disableSignature ? "opacity-40" : ""}`}
                  referrerPolicy="no-referrer"
                  onError={() => setPreviewFailed(true)}
                />
              ) : (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <ImageIcon className="size-4 shrink-0" aria-hidden="true" />
                  <span>{settings.signatureConfigured || selectedFile ? "Preview unavailable" : "No signature uploaded"}</span>
                </div>
              )}
            </div>
            <div className="flex min-h-8 items-center justify-between gap-3">
              <p role="status" className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                {settings.signatureConfigured && !selectedFile && !disableSignature && <CheckCircle2 className="size-4 shrink-0 text-green-700" aria-hidden="true" />}
                {status}
              </p>
              {settings.signatureConfigured && !selectedFile && (
                <Button
                  type="button" variant="ghost" size="icon" className="size-8 shrink-0"
                  aria-label="Refresh signature preview" title="Refresh signature preview"
                  disabled={isRefreshing || isPending}
                  onClick={() => startRefresh(async () => {
                    try {
                      const result = await fetchCertificationSettingsForOrg();
                      if (result.error || !result.data.signaturePreviewUrl) {
                        toast.error("Signature preview is unavailable. Refresh the page or replace the image.");
                        return;
                      }
                      setStoredPreview(result.data.signaturePreviewUrl);
                      setPreviewFailed(false);
                    } catch {
                      toast.error("Could not refresh the signature preview.");
                    }
                  })}
                >
                  <RefreshCw className={`size-4 ${isRefreshing ? "animate-spin" : ""}`} />
                </Button>
              )}
            </div>
          </div>

          <div className="min-w-0 space-y-4">
            <div className="space-y-2">
              <input
                ref={fileInput} id="certification-signature" name="signatureFile" type="file" accept="image/png" className="sr-only"
                aria-label="Signature PNG file" disabled={isPending}
                onChange={event => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (file.type !== "image/png" || file.size > 512 * 1024) {
                    clearSelection();
                    toast.error("Choose a PNG image, 512 KB or smaller.");
                    return;
                  }
                  setSelectedFile(file);
                  setLocalPreview(URL.createObjectURL(file));
                  setPreviewFailed(false);
                  setDisableSignature(false);
                }}
              />
              <Button type="button" variant="outline" disabled={isPending} onClick={() => fileInput.current?.click()}>
                <Upload className="size-4" />
                {settings.signatureConfigured ? "Replace signature" : "Upload signature"}
              </Button>
              <p className="text-sm text-muted-foreground">PNG, up to 512 KB</p>
              {selectedFile && (
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 break-all text-sm">{selectedFile.name}</p>
                  <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" title="Clear selected file" aria-label="Clear selected file" onClick={clearSelection} disabled={isPending}><X className="size-4" /></Button>
                </div>
              )}
            </div>
            {settings.signatureConfigured && (
              <div className="flex items-center gap-2 pt-1">
                <Checkbox
                  id="remove-certification-signature" name="removeSignature" checked={disableSignature} disabled={isPending}
                  onCheckedChange={checked => {
                    setDisableSignature(checked === true);
                    if (checked) clearSelection();
                  }}
                />
                <Label htmlFor="remove-certification-signature" className="font-normal">Disable signature</Label>
              </div>
            )}
          </div>
        </div>
      </section>

      {state.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
      <div className="flex justify-end border-t pt-4">
        <Button type="submit" className="w-full sm:w-auto" disabled={isPending || Boolean(selectedFile && previewFailed)}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {isPending ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
