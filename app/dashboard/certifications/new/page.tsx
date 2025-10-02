import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NewCertificationPage() {
  return (
    <div className="p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-xl font-semibold">Choose a certificate type</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button asChild>
            <Link href="/dashboard/certifications/hydrostatic-test/new">
              Hydrostatic Test
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
