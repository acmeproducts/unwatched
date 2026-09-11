import type { Metadata } from "next";
export const metadata: Metadata = { title: "Watch the town", description: "The island live: every citizen on the street right now, under the real sky of a real coast.", alternates: { canonical: "/town" }, openGraph: { title: "Watch the town · Unwatched", description: "The island live: every citizen on the street right now, under the real sky of a real coast.", url: "/town" } };
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
