import type { Metadata } from "next";
export const metadata: Metadata = { title: "The people", description: "Everyone on the island, who they are and what they are up to.", alternates: { canonical: "/people" }, openGraph: { title: "The people · Unwatched", description: "Everyone on the island, who they are and what they are up to.", url: "/people" } };
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
