"use client";

import { Link, useRouter } from "i18n/navigation";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  GraphDocumentForFrontend,
  LocaleEnum,
  NodeTypeForFrontend,
} from "@/app/const/types";
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

function normalizePropertiesToString(
  properties: Record<string, string | number | boolean | null> | undefined,
): Record<string, string> {
  if (!properties) return {};
  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [key, String(value ?? "")]),
  );
}

function syncNodeNameWithLocaleProperties(
  node: NodeTypeForFrontend,
  locale: LocaleEnum,
): NodeTypeForFrontend {
  const properties = normalizePropertiesToString(node.properties);
  properties[`name_${locale}`] = node.name;
  return { ...node, properties };
}

function toDocumentGraphMutationPayload(
  graph: GraphDocumentForFrontend,
  locale: LocaleEnum,
): GraphDocumentForFrontend {
  return {
    nodes: graph.nodes.map((node) => syncNodeNameWithLocaleProperties(node, locale)),
    relationships: graph.relationships.map((relationship) => ({
      ...relationship,
      properties: normalizePropertiesToString(relationship.properties),
    })),
  };
}

export function FieldScanDetail({ sessionId }: FieldScanDetailProps) {
  const t = useTranslations("field");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { data: authSession } = useSession();
  const preferredLocale = (authSession?.user?.preferredLocale ?? "ja") as LocaleEnum;
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [graphEditError, setGraphEditError] = useState<string | null>(null);
  const [editedGraph, setEditedGraph] =
    useState<GraphDocumentForFrontend | null>(null);
  const graphSyncedSessionRef = useRef<string | null>(null);
  const { data, isLoading, error, refetch } = api.scan.getSession.useQuery({
    id: sessionId,
  });

  const applyServerGraph = (graph: GraphDocumentForFrontend) => {
    setEditedGraph(graph);
  };

  const syncGraphFromServer = async () => {
    const result = await refetch();
    if (result.data?.graph) {
      applyServerGraph(result.data.graph);
    }
    return result;
  };

  const updateGraph = api.documentGraph.updateGraph.useMutation({
    onSuccess: async () => {
      setGraphEditError(null);
      await syncGraphFromServer();
    },
    onError: async (mutationError) => {
      setGraphEditError(mutationError.message ?? t("graphSaveFailed"));
      await syncGraphFromServer();
    },
  });

  useEffect(() => {
    graphSyncedSessionRef.current = null;
    setEditedGraph(null);
  }, [sessionId]);

  useEffect(() => {
    if (!data?.graph) return;
    if (graphSyncedSessionRef.current === sessionId) return;
    applyServerGraph(data.graph);
    graphSyncedSessionRef.current = sessionId;
  }, [data?.graph, sessionId]);
  const deleteSession = api.scan.deleteSession.useMutation({
    onSuccess: () => {
      setIsDeleteOpen(false);
      router.push("/field");
    },
    onError: (mutationError) => {
      setDeleteError(mutationError.message ?? t("deleteFailed"));
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
        {tCommon("loading")}
      </div>
    );
  }

  const displayGraph = editedGraph ?? data?.graph ?? null;

  const handleGraphChange = (nextGraph: GraphDocumentForFrontend) => {
    if (!data?.graphId) return;
    setGraphEditError(null);
    const payload = toDocumentGraphMutationPayload(nextGraph, preferredLocale);
    setEditedGraph(payload);
    updateGraph.mutate({
      id: data.graphId,
      dataJson: payload,
    });
  };

  if (error != null || data == null) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="mb-4 text-sm text-red-300">
          {t("sessionFetchFailed")}
        </p>
        <Link href="/field" className="text-sm text-sky-400 hover:underline">
          {t("backToList")}
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
            <h2 className="text-sm font-semibold text-slate-200">{t("ocrText")}</h2>
            {data.ocrMetadata?.confidence != null && (
              <span className="text-xs text-slate-400">
                {t("confidence")} {Math.round(Number(data.ocrMetadata.confidence))}%
              </span>
            )}
          </div>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-sm text-slate-200">
            {data.plainText}
          </pre>
        </section>

        {displayGraph && (
          <section className="">
            <GraphPreview graphData={displayGraph} />
          </section>
        )}

        {displayGraph && (
          <GraphSummary
            graph={displayGraph}
            matchCandidates={data.matchCandidates}
            onGraphChange={handleGraphChange}
            onRefreshNodeMatches={() => {
              if (updateGraph.isPending) return;
              void syncGraphFromServer();
            }}
          />
        )}

        {graphEditError && (
          <p className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            {graphEditError}
          </p>
        )}

        <div className="flex flex-col gap-3">
          <Button
            onClick={() => router.push(`/graph/${data.graphId}`)}
            className="w-full bg-slate-700 text-white"
          >
            {t("openFullGraphView")}
          </Button>
          <Link
            href="/field/scan"
            className="text-center text-sm text-orange-300 hover:underline"
          >
            {t("addNewScan")}
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
