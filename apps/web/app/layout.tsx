import type { Metadata } from "next";
import { Familjen_Grotesk } from "next/font/google";
import "./globals.css";

const familjen = Familjen_Grotesk({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"], variable: "--font-familjen" });

export const metadata: Metadata = {
  title: { default: "Unwatched", template: "%s · Unwatched" },
  description: "A town that keeps living while you are away.",
  openGraph: { title: "Unwatched", description: "A town that keeps living while you are away.", images: [{ url: "/world-street.jpg", width: 1440, height: 810 }] },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={familjen.variable}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
