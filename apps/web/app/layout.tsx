import type { Metadata } from "next";
import { Sora, Nunito_Sans } from "next/font/google";
import "./globals.css";

const sora = Sora({ subsets: ["latin", "latin-ext"], weight: ["400", "600", "700"], variable: "--font-sora" });
const nunito = Nunito_Sans({ subsets: ["latin", "latin-ext"], weight: ["400", "600", "700"], style: ["normal", "italic"], variable: "--font-nunito" });

export const metadata: Metadata = { title: "Ferry Town", description: "A town that keeps living while you are away." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sora.variable} ${nunito.variable}`}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
