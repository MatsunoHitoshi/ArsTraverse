"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import dayjs from "dayjs";
import { api } from "@/trpc/react";
import { Button } from "@/app/_components/button/button";
import { FadeIn } from "@/app/_components/animation/fade-in";

export function FieldSessionList() {
  const router = useRouter();
  const { data: session } = useSession();
  const { data, isLoading, error } = api.scan.listSessions.useQuery(
    { page: 1, limit: 30 },
    { enabled: !!session },
  );

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
              <li key={item.id}>
                <Link
                  href={`/field/scan/${item.id}`}
                  className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/70 p-3 transition hover:border-orange-400/60"
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </FadeIn>
  );
}
