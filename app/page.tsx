import Header from "@/components/landingpage/Header";
import Hero from "@/components/landingpage/Hero";
import Footer from "@/components/landingpage/Footer";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen px-4 sm:px-6 md:px-8 lg:px-10 items-center">
      <Header />
      <main className="flex-1 w-full">
        <Hero />
      </main>
      <Footer />
    </div>
  );
}
