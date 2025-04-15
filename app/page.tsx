import Header from "@/components/landingpage/Header";
import Hero from "@/components/landingpage/Hero";
import Features from "@/components/landingpage/Features";
import HowItWorks from "@/components/landingpage/HowItWorks";
import Testimonials from "@/components/landingpage/Testimonials";
import Pricing from "@/components/landingpage/Pricing";
import FAQ from "@/components/landingpage/FAQ";
import Contact from "@/components/landingpage/Contact";
import Footer from "@/components/landingpage/Footer";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1">
        <Hero />
        <Features />
        <HowItWorks />
        <Testimonials />
        <Pricing />
        <FAQ />
        <Contact />
      </main>
      <Footer />
    </div>
  );
}
