export type CertificationSettings = {
  templateRevision: string;
  catIiCertificateNo: string;
  catIiiCertificateNo: string;
};

export const DEFAULT_CERTIFICATION_SETTINGS: CertificationSettings = {
  templateRevision: "01",
  catIiCertificateNo: "HPiVS-iP1283-001-1",
  catIiiCertificateNo: "HPiVS-iP1283-001-I-03-00",
};

export type CertificationSettingsRow = {
  template_revision?: string | null;
  cat_ii_certificate_no?: string | null;
  cat_iii_certificate_no?: string | null;
};

export function mapCertificationSettingsRow(
  row: CertificationSettingsRow | null | undefined
): CertificationSettings {
  return {
    templateRevision:
      row?.template_revision?.trim() ||
      DEFAULT_CERTIFICATION_SETTINGS.templateRevision,
    catIiCertificateNo:
      row?.cat_ii_certificate_no?.trim() ||
      DEFAULT_CERTIFICATION_SETTINGS.catIiCertificateNo,
    catIiiCertificateNo:
      row?.cat_iii_certificate_no?.trim() ||
      DEFAULT_CERTIFICATION_SETTINGS.catIiiCertificateNo,
  };
}
