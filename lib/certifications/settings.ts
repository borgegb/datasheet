export type CertificationSettings = {
  templateRevision: string;
  signatureConfigured?: boolean;
  signaturePreviewUrl?: string | null;
};

export const DEFAULT_CERTIFICATION_SETTINGS: CertificationSettings = {
  templateRevision: "01",
  signatureConfigured: false,
};

export type CertificationSettingsRow = {
  template_revision?: string | null;
  signature_storage_path?: string | null;
};

export function mapCertificationSettingsRow(
  row: CertificationSettingsRow | null | undefined
): CertificationSettings {
  return {
    templateRevision:
      row?.template_revision?.trim() ||
      DEFAULT_CERTIFICATION_SETTINGS.templateRevision,
    signatureConfigured: Boolean(row?.signature_storage_path),
  };
}
