"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { api } from "@/trpc/react";
import { Button } from "@/app/_components/button/button";
import { FadeIn } from "@/app/_components/animation/fade-in";
import { GraphSummary } from "@/features/field/components/graph-summary";
import { PublishedNodeMatches } from "@/features/field/components/published-node-matches";
import { ScanImageWithRegions } from "@/features/field/components/scan-image-with-regions";
import type { OcrRegion } from "@/server/api/schemas/scan";

type FieldScanDetailProps = {
  sessionId: string;
};

export function FieldScanDetail({ sessionId }: FieldScanDetailProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const { data, isLoading, error, refetch } = api.scan.getSession.useQuery({
    id: sessionId,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: searchResults, isFetching: isSearching } =
    api.workspace.searchPublishedNodes.useQuery(
      { query: debouncedQuery, limit: 10 },
      { enabled: debouncedQuery.length >= 2 },
    );

  const displayedMatches = useMemo(() => {
    if (debouncedQuery.length >= 2 && searchResults) {
      return searchResults;
    }
    return data?.matchCandidates ?? [];
  }, [debouncedQuery, searchResults, data?.matchCandidates]);

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
          <div>
            <h1 className="text-xl font-bold text-slate-50">{data.name}</h1>
            <p className="mt-1 text-xs text-slate-400">
              {dayjs(data.createdAt).format("YYYY/MM/DD HH:mm")}
            </p>
          </div>
          <Link href="/field" className="shrink-0 text-sm text-sky-400 hover:underline">
            一覧
          </Link>
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

        <GraphSummary graph={data.graph} />

        <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-200">
            公開ノードを検索
          </h2>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="ノード名の一部を入力（2文字以上）"
            className="mb-3 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          />
          {isSearching && (
            <p className="mb-2 text-xs text-slate-400">検索中...</p>
          )}
          <PublishedNodeMatches
            matches={displayedMatches}
            title={
              debouncedQuery.length >= 2
                ? "検索結果"
                : "公開グラフとの一致候補"
            }
          />
        </section>

        <div className="flex flex-col gap-3">
          <Button
            onClick={() => router.push(`/graph/${data.graphId}`)}
            className="w-full bg-slate-700 text-white"
          >
            フルグラフビューで開く
          </Button>
          <Button
            onClick={() => void refetch()}
            className="w-full bg-slate-800 text-slate-100"
          >
            一致候補を再取得
          </Button>
          <Link
            href="/field/scan"
            className="text-center text-sm text-orange-300 hover:underline"
          >
            新しいスキャンを追加
          </Link>
        </div>
      </div>
    </FadeIn>
  );
}
