import React from "react";
import CertificateTypeChoices from "../components/CertificateTypeChoices";

export default function NewCertificationPage() {
  return (
    <div className="p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-xl font-semibold">Choose a certificate type</h1>
        <CertificateTypeChoices />
      </div>
    </div>
  );
}
