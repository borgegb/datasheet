import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import "./fonts.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Applied Studio",
  description: "Effortlessly create professional product datasheets",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/fonts/geist/geist-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/geist/geist-mono-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className="antialiased">
        {children}
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
