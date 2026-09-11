import type { MetadataRoute } from "next";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return { name: SITE_NAME, short_name: SITE_NAME, description: SITE_TAGLINE, start_url: "/town", display: "standalone", background_color: "#F7F6F3", theme_color: "#14161A", icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" }] };
}
