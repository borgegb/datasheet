export interface CertificationDataModel {
  titleTop: string;
  titleBottom: string;
  euDirective: string;
  manufacturer: string;
  equipmentDescription: string;
  model: string;
  serialNumber: string;
  dateOfTest: string; // ISO date
  ped: { header: string; columns: string[]; row: string[] };
  safeWorkingPressurePSI: number;
  designedTemperatureC: number;
  hydrostaticTestPressurePSI: number;
  signLineLead: string;
  signatoryName: string;
  signatoryTitle: string;
  validityMonths: number;
  branding: {
    companyName: string;
    tagline: string;
    leftRibbonText: string;
    showQcStamp: boolean;
  };
}

