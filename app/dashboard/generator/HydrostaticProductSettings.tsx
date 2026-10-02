"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { EMPTY_HYDROSTATIC_PROFILE, hydrostaticProfileSchema, type HydrostaticProfile } from "@/lib/certifications/hydrostatic";

const fields = [
  ["modelCode", "Certificate model code", "text"],
  ["equipmentDescription", "Equipment description", "text"],
  ["maxPressureBar", "Maximum allowable pressure (bar)", "number"],
  ["minTemperatureC", "Minimum temperature (C)", "number"],
  ["maxTemperatureC", "Maximum temperature (C)", "number"],
  ["volumeLitres", "Volume (litres)", "number"],
] as const;

export default function HydrostaticProductSettings({ value, onChange, disabled }: {
  value: HydrostaticProfile | null;
  onChange: (value: HydrostaticProfile | null) => void;
  disabled: boolean;
}) {
  const parsed = hydrostaticProfileSchema.safeParse(value);
  const profile = parsed.success ? parsed.data : { ...EMPTY_HYDROSTATIC_PROFILE, ...value };
  return (
    <fieldset disabled={disabled} className="space-y-4 border-t pt-4">
      <legend className="text-base font-semibold">Certificate Product Specifications</legend>
      <input type="hidden" name="hydrostaticProfile" value={JSON.stringify(value)} disabled={disabled} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value !== null} onChange={event => onChange(event.target.checked ? { ...EMPTY_HYDROSTATIC_PROFILE } : null)} />
        Product specifications configured
      </label>
      {value && <>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map(([key, label, type]) => <div key={key} className="min-w-0 space-y-1.5">
            <Label htmlFor={`hydro-${key}`}>{label}</Label>
            <Input id={`hydro-${key}`} type={type} step={type === "number" ? "any" : undefined}
              value={profile[key]} onChange={event => onChange({ ...profile, [key]: event.target.value })} />
          </div>)}
          <div className="space-y-1.5">
            <Label htmlFor="hydro-pressure">Hydrostatic test pressure (bar)</Label>
            <NativeSelect id="hydro-pressure" value={profile.testPressureBar}
              onChange={event => onChange({ ...profile, testPressureBar: event.target.value as HydrostaticProfile["testPressureBar"] })}>
              <option value="20">20</option><option value="15">15</option><option value="">Not applicable</option>
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hydro-requirement">Hydrostatic certificate</Label>
            <NativeSelect id="hydro-requirement" value={profile.requirement}
              onChange={event => onChange({ ...profile, requirement: event.target.value as HydrostaticProfile["requirement"] })}>
              <option value="mandatory">Mandatory</option><option value="optional">Optional (SEP)</option><option value="not-applicable">Not applicable (PTO compressor)</option>
            </NativeSelect>
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={profile.issueEnabled}
            onChange={event => onChange({ ...profile, issueEnabled: event.target.checked })} />
          Approved for signed Hydrostatic certificates
        </label>
      </>}
    </fieldset>
  );
}
