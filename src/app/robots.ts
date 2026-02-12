import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://arstraverse.com";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/articles/", "/about"],
        disallow: [
          "/api/",
          "/dashboard",
          "/workspaces",
          "/topic-spaces",
          "/documents",
          "/account",
          "/annotations",
          "/proposals",
          "/graph",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
