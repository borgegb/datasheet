import Link from "next/link";
import { Button } from "@/components/ui/button";
import { euDocHoldReason } from "@/lib/certifications/release";
import { CERT_TYPES } from "../registry";

// Keep the same family pairs on the dashboard and the new-certificate screen.
const groups = [
  { name: "Blast Machines", choices: [
    { slug: "eu-doc-serialised", productType: "blast-machine" },
    { slug: "eu-doc-owner-manual-blasting", productType: "blast-machine" },
  ] },
  { name: "PTO Compressors", choices: [
    { slug: "eu-doc-serialised", productType: "pto-compressor", title: "EU DoC - Serialised - PTO Compressors" },
    { slug: "eu-doc-owner-manual-pto-compressors", productType: "pto-compressor" },
  ] },
  { name: "Hydrostatic Test", choices: [
    { slug: "hydrostatic-test", productType: undefined },
  ] },
];

export default function CertificateTypeChoices() {
  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.name} role="group" aria-label={group.name} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {group.choices.map((choice) => {
            const title = "title" in choice ? choice.title : CERT_TYPES[choice.slug].title;
            const held = euDocHoldReason(choice.slug, choice.productType);
            const className = "h-auto min-h-14 w-full min-w-0 whitespace-normal px-4 py-3 text-center leading-5";
            return held ? (
              <Button key={choice.slug} variant="outline" disabled className={className}>
                {title} (on hold)
              </Button>
            ) : (
              <Button key={choice.slug} variant="outline" asChild className={className}>
                <Link href={`/dashboard/certifications/${choice.slug}/new`}>{title}</Link>
              </Button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
