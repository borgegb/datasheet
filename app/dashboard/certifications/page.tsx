import React from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { CERT_TYPES } from "./registry";

export default async function CertificationsPage() {
  return (
    <div className="flex flex-col flex-1 p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
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

      <div className="rounded-md border p-6">
        <h2 className="font-medium mb-3">Available certificate types</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {Object.values(CERT_TYPES).map((t) => (
            <Button key={t.slug} variant="outline" asChild>
              <Link href={`/dashboard/certifications/${t.slug}/new`}>
                {t.title}
              </Link>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
