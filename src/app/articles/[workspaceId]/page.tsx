"use client";

import { useParams } from "next/navigation";
import { api } from "@/trpc/react";
import { PublicArticleViewer } from "@/app/_components/article/public-article-viewer";
import type { JSONContent } from "@tiptap/react";
import { ArticleFooter } from "@/app/_components/article/article-footer";
import { ProfileCard } from "@/app/_components/article/profile-card";

export default function ArticlePage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;

  const {
    data: workspaceData,
    isLoading,
    error,
  } = api.workspace.getPublishedById.useQuery(
    { id: workspaceId },
    {
      enabled: !!workspaceId,
    },
  );

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center text-center text-white">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600"></div>
          <div>記事を読み込み中...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <div className="text-center text-white">
          <h1 className="mb-4 text-2xl font-bold">エラー</h1>
          <p className="text-red-400">{error.message}</p>
        </div>
      </div>
    );
  }

  if (!workspaceData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <div className="text-center text-white">
          <h1 className="mb-4 text-2xl font-bold">記事が見つかりません</h1>
          <p className="text-gray-400">
            指定された記事は存在しないか、公開されていません
          </p>
        </div>
      </div>
    );
  }

  const content = (workspaceData.content as JSONContent) ?? {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "",
          },
        ],
      },
    ],
  };

  const topicSpaceId = workspaceData.referencedTopicSpaces[0]?.id ?? "";

  if (!topicSpaceId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <div className="text-center text-white">
          <h1 className="mb-4 text-2xl font-bold">エラー</h1>
          <p className="text-gray-400">
            この記事には参照されているリポジトリがありません
          </p>
        </div>
      </div>
    );
  }

  return (
    <main className="z-0 flex min-h-screen flex-col items-center justify-center bg-slate-900">
      <div className="flex w-full flex-col items-center justify-center pt-12">
        <div className="flex flex-col gap-1 xl:flex-row">
          <div className="fixed left-0 top-24 hidden flex-col gap-1 px-2 xl:flex">
            <ProfileCard userId={workspaceData.userId} />
          </div>
          <PublicArticleViewer
            content={content}
            graphDocument={workspaceData.graphDocument}
            topicSpaceId={topicSpaceId}
            workspaceName={workspaceData.name}
            userName={workspaceData.user.name ?? ""}
            userImage={workspaceData.user.image ?? ""}
          />
          <div className="flex w-full flex-col gap-1 p-4 xl:hidden">
            <ProfileCard userId={workspaceData.userId} />
          </div>
        </div>

        <div className="w-full text-white">
          <ArticleFooter />
        </div>
      </div>
    </main>
  );
}
