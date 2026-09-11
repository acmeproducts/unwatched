import type { Metadata } from "next";
import { Unbounded, Hanken_Grotesk } from "next/font/google";
import "./globals.css";

const unbounded = Unbounded({ subsets: ["latin", "latin-ext"], weight: ["500", "600", "700", "800"], variable: "--font-unbounded" });
const hanken = Hanken_Grotesk({ subsets: ["latin", "latin-ext"], weight: ["400", "700"], style: ["normal", "italic"], variable: "--font-hanken" });

export const metadata: Metadata = {
  title: { default: "Unwatched", template: "%s · Unwatched" },
  description: "A town that keeps living while you are away.",
  openGraph: { title: "Unwatched", description: "A town that keeps living while you are away.", images: [{ url: "/world-street.jpg", width: 1440, height: 810 }] },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${unbounded.variable} ${hanken.variable}`}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
