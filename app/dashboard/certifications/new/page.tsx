import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CERT_TYPES } from "../registry";

export default function NewCertificationPage() {
  return (
    <div className="p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-xl font-semibold">Choose a certificate type</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Object.values(CERT_TYPES).map((typeDef) => (
            <Button key={typeDef.slug} asChild>
              <Link href={`/dashboard/certifications/${typeDef.slug}/new`}>
                {typeDef.title}
              </Link>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
