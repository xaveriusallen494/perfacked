import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import { BottomNav } from "@/components/layout/BottomNav";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SipTrack",
  description: "Ultra-fast, mobile-first social drink tracker.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SipTrack",
  },
  themeColor: "#09090b",
};

export const viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased bg-zinc-950 text-zinc-50 overflow-hidden`}
      >
        <Providers>
          <div className="flex flex-col h-[100dvh] overflow-hidden">
            <main className="flex-1 overflow-y-auto pt-safe pb-[calc(env(safe-area-inset-bottom)+3.5rem)]">
              {children}
            </main>
            <BottomNav />
          </div>
          <Toaster theme="dark" />
        </Providers>
      </body>
    </html>
  );
}
