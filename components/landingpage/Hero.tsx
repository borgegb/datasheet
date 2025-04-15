import Link from "next/link";
import { Button } from "@/components/ui/button";
import Image from "next/image";

export default function Hero() {
  return (
    <section className="container grid lg:grid-cols-2 place-items-center py-20 md:py-32 gap-10">
      <div className="text-center lg:text-start space-y-6">
        <main className="text-5xl md:text-6xl font-bold">
          <h1 className="inline">
            <span className="inline bg-gradient-to-r from-[#61DAFB] to-[#1fb6ff] text-transparent bg-clip-text">
              Effortlessly Create
            </span>{" "}
            Professional
          </h1>{" "}
          Product Datasheets
        </main>

        <p className="text-xl text-muted-foreground md:w-10/12 mx-auto lg:mx-0">
          Generate branded PDFs or Word documents instantly from simple product
          data entry.
        </p>

        <div className="space-y-4 md:space-y-0 md:space-x-4">
          <Button
            className="w-full md:w-1/3 bg-blue-600 hover:bg-blue-700 text-white"
            asChild
          >
            <Link href="/auth/sign-up">Get Started</Link>
          </Button>
        </div>
      </div>

      <div className="hidden lg:block rounded-lg overflow-hidden shadow-lg">
        <Image
          src="https://source.unsplash.com/random/600x400/?technology,software"
          alt="Product Datasheet Generator interface example"
          width={600}
          height={400}
          className="aspect-[3/2] object-cover"
        />
      </div>
    </section>
  );
}
 