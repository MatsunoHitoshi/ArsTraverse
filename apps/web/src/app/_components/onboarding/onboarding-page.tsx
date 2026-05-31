"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/app/_components/button/button";
import { api } from "@/trpc/react";
import { signIn, useSession } from "next-auth/react";
import { FileTextIcon, Pencil2Icon } from "@/app/_components/icons/icons";
import { FadeIn } from "../animation/fade-in";

export const OnboardingPage = () => {
  const { data: session } = useSession();
  const router = useRouter();

  const { mutate: createEmptyWorkspace } =
    api.workspace.createEmpty.useMutation();

  const ActionButton = ({
    onClick,
    children,
  }: {
    onClick: () => void;
    children: React.ReactNode;
  }) => {
    return (
      <Button
        onClick={onClick}
        className="w-full bg-orange-400 text-white hover:bg-orange-500"
      >
        {children}
      </Button>
    );
  };

  const handleCreateWorkspace = () => {
    if (!session) {
      // ログインが必要な場合の処理
      return;
    }

    createEmptyWorkspace(
      {},
      {
        onSuccess: (workspace) => {
          router.push(`/workspaces/${workspace.id}`);
        },
        onError: (error) => {
          console.error("ワークスペース作成エラー:", error);
        },
      },
    );
  };

  const handleUploadDocument = () => {
    router.push("/documents/new");
  };

  return (
    <FadeIn>
      <div className="w-full max-w-4xl text-center">
        {/* ヘッダー */}
        <div className="mb-12">
          <div className="mb-10 flex flex-col items-center justify-center gap-3">
            <h1 className="text-4xl font-bold text-slate-50">
              ArsTraverse へようこそ
            </h1>
            <p className="text-base text-slate-300">
              芸術文化の文脈を可視化・編集するアーカイブツールです
            </p>
          </div>
        </div>

        {/* 選択肢 */}
        <p className="mb-6 text-2xl font-bold text-white">
          どちらから始めましょうか？
        </p>
        <div className="grid gap-6 md:grid-cols-2">
          {/* ワークスペース作成 */}
          <div className="hover:bg-slate-750 rounded-xl border border-slate-600 bg-slate-800 p-8 transition-all hover:border-orange-400">
            <div className="mb-4 flex justify-center">
              <div className="rounded-full bg-orange-500 p-4">
                <Pencil2Icon width={32} height={32} />
              </div>
            </div>
            <h2 className="mb-3 text-xl font-semibold text-slate-50">
              文章の執筆から始める
            </h2>
            <p className="mb-6 text-left text-sm text-slate-300">
              空のワークスペースを作って、関連資料を参照しながら文章を書き始められます。
              別の資料の情報を素早く参照しながら執筆したい時に役立ちます。
            </p>
            {session ? (
              <ActionButton onClick={handleCreateWorkspace}>
                ワークスペースを作成
              </ActionButton>
            ) : (
              <ActionButton
                onClick={() => signIn("google", { callbackUrl: "/" })}
              >
                ログインして始める
              </ActionButton>
            )}
          </div>

          {/* 文章アップロード */}
          <div className="hover:bg-slate-750 rounded-xl border border-slate-600 bg-slate-800 p-8 transition-all hover:border-orange-400">
            <div className="mb-4 flex justify-center">
              <div className="rounded-full bg-orange-500 p-4">
                <FileTextIcon width={32} height={32} />
              </div>
            </div>
            <h2 className="mb-3 text-xl font-semibold text-slate-50">
              手元にあるテキストから始める
            </h2>
            <p className="mb-6 text-left text-sm text-slate-300">
              お手持ちのテキストをアップロードすると、AIが自動的に知識グラフを構築・可視化します。
              まずは手元にある資料から知識をマッピングしたい時に役立ちます。
            </p>
            <ActionButton onClick={handleUploadDocument}>
              テキストをアップロード
            </ActionButton>
          </div>
        </div>
      </div>
    </FadeIn>
  );
};
