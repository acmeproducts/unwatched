import type { Metadata } from "next";
export const metadata: Metadata = { title: "Other islands", description: "Every island running the Unwatched engine, and how to start your own.", alternates: { canonical: "/towns" }, openGraph: { title: "Other islands · Unwatched", description: "Every island running the Unwatched engine, and how to start your own.", url: "/towns" } };
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
