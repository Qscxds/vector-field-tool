/** sitemap.xml: the three public pages. /embed and /widget are not pages of their own. */
import type { MetadataRoute } from "next";
import { configuredBaseUrl } from "@/base-url";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = configuredBaseUrl ?? "http://localhost:3000";
  return [
    { url: `${origin}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${origin}/vector-field`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${origin}/help`, changeFrequency: "monthly", priority: 0.6 },
  ];
}
