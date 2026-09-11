import type { Metadata } from "next";
export const metadata: Metadata = { title: "How it fits together", description: "The engine, the citizens, the boat, the paper: how Unwatched is built.", alternates: { canonical: "/overview" }, openGraph: { title: "How it fits together · Unwatched", description: "The engine, the citizens, the boat, the paper: how Unwatched is built.", url: "/overview" } };
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
