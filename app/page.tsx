import Header from "@/components/landingpage/Header";
import Hero from "@/components/landingpage/Hero";
import Footer from "@/components/landingpage/Footer";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen px-10">
      <Header />
      <main className="flex-1">
        <Hero />
      </main>
      <Footer />
    </div>
  );
}
