"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn, useSession } from "next-auth/react";
import dayjs from "dayjs";
import { api } from "@/trpc/react";
import { Button } from "@/app/_components/button/button";
import { FadeIn } from "@/app/_components/animation/fade-in";
import { ScanSessionMenu } from "@/features/field/components/scan-session-menu";
import { ScanSessionRenameModal } from "@/features/field/components/scan-session-rename-modal";
import { ScanSessionDeleteModal } from "@/features/field/components/scan-session-delete-modal";

type SessionTarget = {
  id: string;
  name: string;
};

export function FieldSessionList() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [renameTarget, setRenameTarget] = useState<SessionTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SessionTarget | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const {
    data,
    isLoading,
    error,
    refetch,
  } = api.scan.listSessions.useQuery(
    { page: 1, limit: 30 },
    { enabled: !!session },
  );
  const deleteSession = api.scan.deleteSession.useMutation({
    onSuccess: () => {
      setDeleteTarget(null);
      setDeleteError(null);
      void refetch();
    },
    onError: (mutationError) => {
      setDeleteError(mutationError.message ?? "削除に失敗しました");
    },
  });

  if (status === "loading") {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col px-4 py-8">
        <p className="text-center text-sm text-slate-400">読み込み中...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <FadeIn>
        <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-8">
          <div className="text-center">
            <h1 className="mb-2 text-2xl font-bold text-slate-50">
              フィールドリサーチ
            </h1>
            <p className="text-sm text-slate-300">
              現地で撮影した資料から知識グラフを作成し、公開アーカイブと照合できます。
            </p>
          </div>
          <Button
            onClick={() => signIn("google", { callbackUrl: "/field" })}
            className="w-full bg-orange-400 text-white hover:bg-orange-500"
          >
            Google でログイン
          </Button>
        </div>
      </FadeIn>
    );
  }

  return (
    <FadeIn>
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-6 pb-24">
        <div>
          <h1 className="mb-1 text-2xl font-bold text-slate-50">
            フィールドリサーチ
          </h1>
          <p className="text-sm text-slate-300">
            スキャンセッションの一覧です。新しい資料はカメラから追加できます。
          </p>
        </div>

        <Button
          onClick={() => router.push("/field/scan")}
          className="w-full bg-orange-400 text-white hover:bg-orange-500"
        >
          新規スキャン
        </Button>

        {isLoading && (
          <p className="text-center text-sm text-slate-400">読み込み中...</p>
        )}
        {error && (
          <p className="text-center text-sm text-red-400">
            セッション一覧の取得に失敗しました
          </p>
        )}

        {data && data.items.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-600 p-6 text-center text-sm text-slate-400">
            まだスキャンがありません。「新規スキャン」から始めてください。
          </div>
        )}

        {data && data.items.length > 0 && (
          <ul className="flex flex-col gap-3">
            {data.items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800/70 transition hover:border-orange-400/60"
              >
                <Link
                  href={`/field/scan/${item.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3 p-3"
                >
                  {item.sourceImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.sourceImageUrl}
                      alt=""
                      className="h-16 w-16 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-700 text-xs text-slate-300">
                      画像なし
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-50">
                      {item.name}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {dayjs(item.createdAt).format("YYYY/MM/DD HH:mm")} · ノード{" "}
                      {item.nodeCount}
                    </div>
                  </div>
                </Link>
                <ScanSessionMenu
                  className="mr-2 shrink-0"
                  ariaLabel={`${item.name} の操作メニュー`}
                  onRename={() => setRenameTarget({ id: item.id, name: item.name })}
                  onDelete={() => {
                    setDeleteError(null);
                    setDeleteTarget({ id: item.id, name: item.name });
                  }}
                />
              </li>
            ))}
          </ul>
        )}

        <ScanSessionRenameModal
          isOpen={renameTarget != null}
          setIsOpen={(open) => {
            if (!open) setRenameTarget(null);
          }}
          sessionId={renameTarget?.id ?? null}
          initialName={renameTarget?.name}
          onSuccess={() => void refetch()}
        />

        <ScanSessionDeleteModal
          isOpen={deleteTarget != null}
          setIsOpen={(open) => {
            if (!open) {
              setDeleteTarget(null);
              setDeleteError(null);
            }
          }}
          sessionName={deleteTarget?.name}
          errorMessage={deleteError}
          isPending={deleteSession.isPending}
          onConfirm={() => {
            if (!deleteTarget) return;
            deleteSession.mutate({ id: deleteTarget.id });
          }}
        />
      </div>
    </FadeIn>
  );
}
