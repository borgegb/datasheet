"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EMPTY_HYDROSTATIC_PROFILE, type HydrostaticProfile } from "@/lib/certifications/hydrostatic";

const fields = [
  ["modelCode", "Certificate model code", "text"],
  ["equipmentDescription", "Equipment description", "text"],
  ["maxPressureBar", "Maximum allowable pressure (bar)", "number"],
  ["minTemperatureC", "Minimum temperature (C)", "number"],
  ["maxTemperatureC", "Maximum temperature (C)", "number"],
] as const;

export default function HydrostaticProductSettings({ value, onChange, disabled }: {
  value: HydrostaticProfile | null;
  onChange: (value: HydrostaticProfile | null) => void;
  disabled: boolean;
}) {
  const profile = value || EMPTY_HYDROSTATIC_PROFILE;
  return (
    <fieldset disabled={disabled} className="space-y-4 border-t pt-4">
      <legend className="text-base font-semibold">Hydrostatic Certificate Settings</legend>
      <input type="hidden" name="hydrostaticProfile" value={JSON.stringify(value)} disabled={disabled} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value !== null} onChange={event => onChange(event.target.checked ? { ...EMPTY_HYDROSTATIC_PROFILE } : null)} />
        Hydrostatic profile
      </label>
      {value && <>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map(([key, label, type]) => <div key={key} className="min-w-0 space-y-1.5">
            <Label htmlFor={`hydro-${key}`}>{label}</Label>
            <Input id={`hydro-${key}`} type={type} step={type === "number" ? "any" : undefined}
              value={profile[key]} onChange={event => onChange({ ...profile, [key]: event.target.value })} />
          </div>)}
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
