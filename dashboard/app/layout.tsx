import type { Metadata } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import IndexTabsRail from "@/components/IndexTabsRail";

const fraunces = Fraunces({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-fraunces" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Obol — the book that keeps the books",
  description: "The financial operating system for your entire AI portfolio.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${fraunces.variable} ${inter.variable} ${mono.variable}`}>
        <div className="book">
          <IndexTabsRail />
          <main className="sheet">{children}</main>
        </div>
      </body>
    </html>
  );
}
