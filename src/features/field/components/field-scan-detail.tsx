"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { api } from "@/trpc/react";
import { Button } from "@/app/_components/button/button";
import { FadeIn } from "@/app/_components/animation/fade-in";
import { GraphPreview } from "@/app/_components/curators-writing-workspace/graph-preview";
import { GraphSummary } from "@/features/field/components/graph-summary";
import { ScanImageWithRegions } from "@/features/field/components/scan-image-with-regions";
import { ScanSessionMenu } from "@/features/field/components/scan-session-menu";
import { ScanSessionRenameModal } from "@/features/field/components/scan-session-rename-modal";
import { ScanSessionDeleteModal } from "@/features/field/components/scan-session-delete-modal";
import type { OcrRegion } from "@/server/api/schemas/scan";
import { ChevronLeftIcon } from "@/app/_components/icons";
import { LinkButton } from "@/app/_components/button/link-button";

type FieldScanDetailProps = {
  sessionId: string;
};

export function FieldScanDetail({ sessionId }: FieldScanDetailProps) {
  const router = useRouter();
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = api.scan.getSession.useQuery({
    id: sessionId,
  });
  const deleteSession = api.scan.deleteSession.useMutation({
    onSuccess: () => {
      setIsDeleteOpen(false);
      router.push("/field");
    },
    onError: (mutationError) => {
      setDeleteError(mutationError.message ?? "削除に失敗しました");
    },
  });

  const ocrRegions = useMemo((): OcrRegion[] => {
    const raw = data?.ocrMetadata?.regions;
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (item): item is OcrRegion =>
        typeof item === "object" &&
        item != null &&
        "x" in item &&
        typeof item.x === "number",
    );
  }, [data?.ocrMetadata?.regions]);

  if (isLoading) {
    return (
      <div className="px-4 py-16 text-center text-sm text-slate-400">
        読み込み中...
      </div>
    );
  }

  if (error != null || data == null) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="mb-4 text-sm text-red-300">
          スキャンセッションを取得できませんでした
        </p>
        <Link href="/field" className="text-sm text-sky-400 hover:underline">
          一覧に戻る
        </Link>
      </div>
    );
  }

  return (
    <FadeIn>
      <div className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 py-6 pb-24">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <LinkButton
              href="/field"
              className="flex !h-8 !w-8 shrink-0 items-center justify-center"
            >
              <div className="h-4 w-4">
                <ChevronLeftIcon width={16} height={16} color="white" />
              </div>
            </LinkButton>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold text-slate-50">
                {data.name}
              </h1>
              <p className="mt-1 text-xs text-slate-400">
                {dayjs(data.createdAt).format("YYYY/MM/DD HH:mm")}
              </p>
            </div>
          </div>
          <ScanSessionMenu
            className="shrink-0"
            onRename={() => setIsRenameOpen(true)}
            onDelete={() => {
              setDeleteError(null);
              setIsDeleteOpen(true);
            }}
          />
        </div>

        {data.sourceImageUrl && (
          <ScanImageWithRegions
            imageUrl={data.sourceImageUrl}
            regions={ocrRegions}
          />
        )}

        <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">OCR テキスト</h2>
            {data.ocrMetadata?.confidence != null && (
              <span className="text-xs text-slate-400">
                信頼度 {Math.round(Number(data.ocrMetadata.confidence))}%
              </span>
            )}
          </div>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-sm text-slate-200">
            {data.plainText}
          </pre>
        </section>

        <section className="">
          <GraphPreview graphData={data.graph} />
        </section>

        <GraphSummary
          graph={data.graph}
          matchCandidates={data.matchCandidates}
        />

        <div className="flex flex-col gap-3">
          <Button
            onClick={() => router.push(`/graph/${data.graphId}`)}
            className="w-full bg-slate-700 text-white"
          >
            フルグラフビューで開く
          </Button>
          <Link
            href="/field/scan"
            className="text-center text-sm text-orange-300 hover:underline"
          >
            新しいスキャンを追加
          </Link>
        </div>

        <ScanSessionRenameModal
          isOpen={isRenameOpen}
          setIsOpen={setIsRenameOpen}
          sessionId={sessionId}
          initialName={data.name}
          onSuccess={() => void refetch()}
        />

        <ScanSessionDeleteModal
          isOpen={isDeleteOpen}
          setIsOpen={setIsDeleteOpen}
          sessionName={data.name}
          errorMessage={deleteError}
          isPending={deleteSession.isPending}
          onConfirm={() => deleteSession.mutate({ id: sessionId })}
        />
      </div>
    </FadeIn>
  );
}
