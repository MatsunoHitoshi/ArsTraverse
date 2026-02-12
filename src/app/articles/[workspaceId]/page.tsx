import type { Metadata } from "next";
import { db } from "@/server/db";
import { WorkspaceStatus } from "@prisma/client";
import { PUBLIC_USER_SELECT } from "@/server/lib/user-select";
import { extractTextFromTiptap } from "@/app/_utils/text/extract-text-from-tiptap";
import ArticlePageClient from "./article-page-client";

/** サーバーサイドでワークスペースの基本情報を取得（メタデータ用） */
async function getWorkspaceForMeta(workspaceId: string) {
  const workspace = await db.workspace.findFirst({
    where: {
      id: workspaceId,
      status: WorkspaceStatus.PUBLISHED,
      isDeleted: false,
    },
    select: {
      id: true,
      name: true,
      description: true,
      content: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: PUBLIC_USER_SELECT,
      },
      tags: {
        select: { name: true },
      },
    },
  });
  return workspace;
}

/** 動的メタデータ生成 – 検索エンジンと SNS シェアに必要な情報を返す */
export async function generateMetadata({
  params,
}: {
  params: { workspaceId: string };
}): Promise<Metadata> {
  const workspace = await getWorkspaceForMeta(params.workspaceId);

  if (!workspace) {
    return {
      title: "記事が見つかりません | ArsTraverse",
      description: "指定された記事は存在しないか、公開されていません。",
    };
  }

  const description =
    workspace.description ??
    (extractTextFromTiptap(workspace.content, 160) ||
      `${workspace.name} – ArsTraverse で公開された記事`);

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://arstraverse.com";
  const articleUrl = `${baseUrl}/articles/${workspace.id}`;

  return {
    title: `${workspace.name} | ArsTraverse`,
    description,
    openGraph: {
      title: workspace.name,
      description,
      url: articleUrl,
      siteName: "ArsTraverse",
      type: "article",
      publishedTime: workspace.createdAt.toISOString(),
      modifiedTime: workspace.updatedAt.toISOString(),
      authors: workspace.user.name ? [workspace.user.name] : undefined,
      tags: workspace.tags.map((t) => t.name),
    },
    twitter: {
      card: "summary",
      title: workspace.name,
      description,
    },
    alternates: {
      canonical: articleUrl,
    },
  };
}

/** JSON-LD 構造化データ（Article スキーマ） */
function ArticleJsonLd({
  workspace,
  baseUrl,
}: {
  workspace: NonNullable<Awaited<ReturnType<typeof getWorkspaceForMeta>>>;
  baseUrl: string;
}) {
  const description =
    workspace.description ??
    (extractTextFromTiptap(workspace.content, 160) ||
      `${workspace.name} – ArsTraverse で公開された記事`);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: workspace.name,
    description,
    url: `${baseUrl}/articles/${workspace.id}`,
    datePublished: workspace.createdAt.toISOString(),
    dateModified: workspace.updatedAt.toISOString(),
    author: {
      "@type": "Person",
      name: workspace.user.name ?? "Unknown",
    },
    publisher: {
      "@type": "Organization",
      name: "ArsTraverse",
    },
    keywords: workspace.tags.map((t) => t.name),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export default async function ArticlePage({
  params,
}: {
  params: { workspaceId: string };
}) {
  const workspace = await getWorkspaceForMeta(params.workspaceId);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://arstraverse.com";

  return (
    <>
      {/* JSON-LD 構造化データ: 検索結果でのリッチスニペット表示に利用 */}
      {workspace && <ArticleJsonLd workspace={workspace} baseUrl={baseUrl} />}

      {/* SEO 用の非表示テキスト: クローラーがコンテンツを読み取れるようにする */}
      {workspace && (
        <div className="sr-only" aria-hidden="false">
          <h1>{workspace.name}</h1>
          {workspace.user.name && <p>著者: {workspace.user.name}</p>}
          {workspace.description && <p>{workspace.description}</p>}
          {workspace.content && (
            <p>{extractTextFromTiptap(workspace.content, 1000)}</p>
          )}
          {workspace.tags.length > 0 && (
            <p>タグ: {workspace.tags.map((t) => t.name).join(", ")}</p>
          )}
        </div>
      )}

      {/* インタラクティブなクライアントコンポーネント */}
      <ArticlePageClient />
    </>
  );
}
