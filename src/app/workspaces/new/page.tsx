"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/_components/button/button";
import { TextInput } from "@/app/_components/input/text-input";
import { api } from "@/trpc/react";

interface WorkspaceFormData {
  name: string;
  description: string;
  baseTopicSpaceId?: string;
  baseDocumentId?: string;
}

export default function NewWorkspacePage() {
  const router = useRouter();
  const [formData, setFormData] = useState<WorkspaceFormData>({
    name: "",
    description: "",
  });
  const [error, setError] = useState<string | null>(null);

  // tRPCのmutationを使用
  const createWorkspaceMutation = api.workspace.create.useMutation();

  const handleInputChange = (field: keyof WorkspaceFormData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      setError("ワークスペース名は必須です");
      return;
    }

    setError(null);

    // tRPCのmutationを使用してワークスペースを作成
    createWorkspaceMutation.mutate(
      {
        name: formData.name,
        description: formData.description,
      },
      {
        onSuccess: (workspace) => {
          // 作成されたワークスペースページにリダイレクト
          router.push(`/workspaces/${workspace.id}`);
        },
        onError: (error) => {
          setError(error.message);
        },
      },
    );
  };

  return (
    <main className="z-0 flex min-h-screen flex-col items-center justify-center bg-slate-900">
      <div className="flex h-screen w-full flex-col items-center  justify-center pt-12">
        {/* <div className="min-h-screen bg-slate-900 py-12"> */}
        <div className="mx-auto max-w-2xl px-4">
          <div className="py-8 text-center">
            <h1 className="mb-4 text-3xl font-bold text-white">
              新しいワークスペースを作成
            </h1>
            <p className="text-gray-400">
              執筆とナレッジグラフを組み合わせた新しいワークスペースを作成します
            </p>
          </div>

          <div className="rounded-lg border border-gray-700 bg-slate-800 p-8 text-gray-300 shadow-lg">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* ワークスペース名 */}
              <div>
                <label className="mb-2 block text-sm font-medium">
                  ワークスペース名 <span className="text-red-400">*</span>
                </label>

                <TextInput
                  value={formData.name}
                  onChange={(value) => handleInputChange("name", value)}
                  placeholder="例: 社会彫刻の研究"
                />
              </div>

              {/* 説明 */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  説明
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    handleInputChange("description", e.target.value)
                  }
                  placeholder="このワークスペースの目的や内容について説明してください"
                  rows={4}
                  className="w-full rounded-md border border-gray-600 bg-slate-700 px-3 py-2 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* エラー表示 */}
              {error && (
                <div className="rounded-md border border-red-700 bg-red-900/20 p-4">
                  <p className="text-red-400">{error}</p>
                </div>
              )}

              {/* ボタン */}
              <div className="flex justify-end space-x-4">
                <Button
                  type="button"
                  onClick={() => router.back()}
                  className="bg-gray-600 hover:bg-gray-700"
                  disabled={createWorkspaceMutation.isPending}
                >
                  キャンセル
                </Button>
                <Button
                  type="submit"
                  disabled={
                    createWorkspaceMutation.isPending || !formData.name.trim()
                  }
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {createWorkspaceMutation.isPending ? (
                    <div className="flex items-center">
                      <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                      作成中...
                    </div>
                  ) : (
                    "ワークスペースを作成"
                  )}
                </Button>
              </div>
            </form>
          </div>

          {/* 機能説明 */}
          <div className="mt-8 rounded-lg border border-gray-700 bg-slate-800/50 p-6">
            <h2 className="mb-4 text-lg font-semibold text-white">
              ワークスペースでできること
            </h2>
            <ul className="space-y-2 text-gray-300">
              <li className="flex items-start">
                <span className="mr-2 mt-1 h-2 w-2 rounded-full bg-blue-500"></span>
                リッチテキストエディタでの執筆
              </li>
              <li className="flex items-start">
                <span className="mr-2 mt-1 h-2 w-2 rounded-full bg-blue-500"></span>
                エンティティの自動ハイライト
              </li>
              <li className="flex items-start">
                <span className="mr-2 mt-1 h-2 w-2 rounded-full bg-blue-500"></span>
                ナレッジグラフとの連携
              </li>
              <li className="flex items-start">
                <span className="mr-2 mt-1 h-2 w-2 rounded-full bg-blue-500"></span>
                エンティティ詳細の表示
              </li>
            </ul>
          </div>
        </div>
        {/* </div> */}
      </div>
    </main>
  );
}
