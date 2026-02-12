import type { MetadataRoute } from "next";
import { db } from "@/server/db";
import { WorkspaceStatus } from "@prisma/client";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://arstraverse.com";

  // 公開済みの全ワークスペース（記事）を取得
  const publishedWorkspaces = await db.workspace.findMany({
    where: {
      status: WorkspaceStatus.PUBLISHED,
      isDeleted: false,
    },
    select: {
      id: true,
      updatedAt: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  const articleEntries: MetadataRoute.Sitemap = publishedWorkspaces.map(
    (workspace) => ({
      url: `${baseUrl}/articles/${workspace.id}`,
      lastModified: workspace.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }),
  );

  // 静的ページ
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.9,
    },
  ];

  return [...staticEntries, ...articleEntries];
}
