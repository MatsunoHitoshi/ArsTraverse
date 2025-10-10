"use client";

import { useParams } from "next/navigation";
import CuratorsWritingWorkspace from "@/app/_components/curators-writing-workspace";
import { api } from "@/trpc/react";

export default function WorkspacePage() {
  const params = useParams();
  const workspaceId = params.id as string;

  // tRPCのqueryを使用してワークスペースデータを取得
  const {
    data: workspaceData,
    isLoading,
    error,
    refetch,
  } = api.workspace.getById.useQuery(
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
          <div>ワークスペースを読み込み中...</div>
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
          <h1 className="mb-4 text-2xl font-bold">
            ワークスペースが見つかりません
          </h1>
          <p className="text-gray-400">
            指定されたワークスペースは存在しないか、アクセス権限がありません
          </p>
        </div>
      </div>
    );
  }

  return (
    <main className="z-0 flex min-h-screen flex-col items-center justify-center bg-slate-900">
      <div className="flex h-screen w-full flex-col items-center  justify-center pt-12">
        <CuratorsWritingWorkspace
          topicSpaceId={workspaceData.referencedTopicSpaces[0]?.id}
          workspace={workspaceData}
          // documentId={null}
          refetch={refetch}
        />
      </div>
    </main>
  );
}
