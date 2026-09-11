import type { Metadata } from "next";
export const metadata: Metadata = { title: "The Library", description: "Books, paintings and letters made on the island, kept.", alternates: { canonical: "/library" }, openGraph: { title: "The Library · Unwatched", description: "Books, paintings and letters made on the island, kept.", url: "/library" } };
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
