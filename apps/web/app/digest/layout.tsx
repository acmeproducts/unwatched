import type { Metadata } from "next";
export const metadata: Metadata = { title: "The digest", description: "What your citizen did, thought and felt today, in their own words.", alternates: { canonical: "/digest" }, openGraph: { title: "The digest · Unwatched", description: "What your citizen did, thought and felt today, in their own words.", url: "/digest" } };
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
