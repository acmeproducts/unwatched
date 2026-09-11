import type { Metadata } from "next";
export const metadata: Metadata = { title: "The Gazette", description: "The island's own paper: what happened yesterday, written by the people it happened to.", alternates: { canonical: "/gazette" }, openGraph: { title: "The Gazette · Unwatched", description: "The island's own paper: what happened yesterday, written by the people it happened to.", url: "/gazette" } };
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
