import React from "react";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import GenericCertificationForm from "../../components/GenericCertificationForm";
import { CERT_TYPES } from "../../registry";

interface Props {
  params: { type: string };
}

export default function NewCertificationTypePage({ params }: Props) {
  const typeDef = CERT_TYPES[params.type];
  if (!typeDef) return notFound();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/certifications">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Certifications
              </Link>
            </Button>
            <div />
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="w-full max-w-2xl mx-auto">
          <GenericCertificationForm typeSlug={params.type} />
        </div>
      </div>
    </div>
  );
}
