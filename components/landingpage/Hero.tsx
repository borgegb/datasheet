import Link from "next/link";
import { Button } from "@/components/ui/button";
// import Image from "next/image"; // Removed Image

export default function Hero() {
  return (
    <section className="container flex flex-col items-center justify-center text-center py-20 md:py-32">
      {/* Adjusted layout to single column centered */}
      <div className="space-y-6 max-w-2xl">
        <main className="text-5xl md:text-6xl font-bold">
          <h1 className="inline">
            {/* Optional: Simpler title styling */}
            {/* <span className="inline bg-gradient-to-r from-[#61DAFB] to-[#1fb6ff] text-transparent bg-clip-text">
              Effortlessly Create
            </span>{" "} */}
            Effortlessly Create Professional
          </h1>{" "}
          Product Datasheets
        </main>

        <p className="text-xl text-muted-foreground">
          Generate branded PDFs instantly from simple product data entry. Get
          started now.
        </p>

        <div className="space-y-4 md:space-y-0 md:space-x-4">
          <Button className="w-full md:w-auto px-8" asChild>
            <Link href="/auth/sign-up">Get Started</Link>
          </Button>
        </div>
      </div>

      {/* Hero Image REMOVED */}
      {/* <div className="hidden lg:block rounded-lg overflow-hidden shadow-lg">
        <Image ... />
      </div> */}
    </section>
  );
}
