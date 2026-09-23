import React from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import CertificateTypeChoices from "./components/CertificateTypeChoices";
import { fetchCertificationsForOrg } from "./actions";
import CertificationsTable from "./components/CertificationsTable";

export default async function CertificationsPage() {
  const { data, error } = await fetchCertificationsForOrg();
  return (
    <div className="flex flex-col flex-1 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Certifications</h1>
          <p className="text-muted-foreground">
            Generate and manage certificates
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/certifications/new">New Certificate</Link>
        </Button>
      </div>

      <div className="space-y-6">
        <section>
          <h2 className="font-medium mb-3">Available certificate types</h2>
          <CertificateTypeChoices />
        </section>

        <section>
          <h2 className="font-medium mb-3">Certificates</h2>
          {error ? <p role="alert" className="text-sm text-destructive">{error.message}</p> : <CertificationsTable initialData={data || []} />}
        </section>
      </div>
    </div>
  );
}
