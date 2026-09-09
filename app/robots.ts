/** robots.txt: the pages are public; /embed (iframes only) and /mcp (an API) are not for crawlers. */
import type { MetadataRoute } from "next";
import { configuredBaseUrl } from "@/base-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/embed", "/mcp"] },
    sitemap: `${configuredBaseUrl ?? "http://localhost:3000"}/sitemap.xml`,
  };
}
