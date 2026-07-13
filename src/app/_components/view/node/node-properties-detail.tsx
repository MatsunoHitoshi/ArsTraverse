"use client";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import { Button } from "../../button/button";
import { ChevronRightIcon, Pencil2Icon } from "../../icons";
import Image from "next/image";
import { usePathname, useRouter } from "i18n/navigation";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { useCallback, useState, useTransition } from "react";
import { Loading } from "../../loading/loading";
import { PropertiesDetailPanel } from "../../d3/force/graph-info-panel";
import { NodePropertiesForm } from "../../form/node-properties-form";
import AdditionalGraphViewer from "../graph-view/additional-graph-viewer";
import type { CustomNodeType } from "@/app/const/types";
import { RelatedNodesAndLinksViewer } from "../graph-view/related-nodes-viewer";
import { NodeAnnotationSection } from "./node-annotation-section";

export const NodePropertiesDetail = ({
  node,
  contextId,
  contextType,
  refetch,
  enableEdit = false,
}: {
  node: CustomNodeType | undefined;
  contextId: string;
  contextType: "topicSpace" | "document";
  refetch?: () => void;
  enableEdit?: boolean;
}) => {
  const tCommon = useTranslations("common");
  const tGraph = useTranslations("graph");
  const router = useRouter();
  const pathname = usePathname();
  const utils = api.useUtils();
  const extractKG = api.kg.extractKG.useMutation();
  const integrateGraph = api.kg.integrateGraph.useMutation();
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [newGraphDocument, setNewGraphDocument] =
    useState<GraphDocumentForFrontend | null>(null);

  const [onEdit, setOnEdit] = useState<boolean>(false);
  const [isGraphEditorMode, setIsGraphEditorMode] = useState<boolean>(false);
  const [, startTransition] = useTransition();

  const navigateToNode = useCallback(
    (targetNode: CustomNodeType) => {
      if (targetNode.id === node?.id) return;
      startTransition(() => {
        router.replace(`${pathname}?list=true&nodeId=${targetNode.id}`, {
          scroll: false,
        });
      });
    },
    [node?.id, pathname, router, startTransition],
  );

  if (!node) {
    return null;
  }

  const generateGraphFromDescription = () => {
    setIsExtracting(true);
    const textContent = `${node.name}:${node.label}\n${node.properties.description}`;
    if (!textContent) return;
    const fileUrl = `data:text/plain;base64,${Buffer.from(textContent).toString("base64")}`;

    extractKG.mutate(
      {
        fileUrl: fileUrl,
        extractMode: "langChain",
        isPlaneTextMode: true,
      },
      {
        onSuccess: (res) => {
          setNewGraphDocument(res.data.graph);
          setIsExtracting(false);
        },
        onError: (e) => {
          console.log(e);
          setIsExtracting(false);
        },
      },
    );
  };

  const onGraphUpdate = (additionalGraph: GraphDocumentForFrontend) => {
    // トピックスペースの詳細画面では、モーダルの「グラフに反映」で
    // 抽出・編集したグラフを直接リポジトリの既存グラフへ統合する。
    if (contextType === "topicSpace" && contextId) {
      const graphDocumentToIntegrate = {
        nodes: additionalGraph.nodes
          .filter((node) => !node.id.startsWith("context-"))
          .map((node) => ({
            id: node.id,
            name: node.name,
            label: node.label,
            properties: node.properties ?? {},
          })),
        relationships: additionalGraph.relationships
          .filter(
            (rel) =>
              !rel.id.startsWith("context-") &&
              !rel.sourceId.startsWith("context-") &&
              !rel.targetId.startsWith("context-"),
          )
          .map((rel) => ({
            id: rel.id,
            type: rel.type,
            properties: rel.properties ?? {},
            sourceId: rel.sourceId,
            targetId: rel.targetId,
          })),
      };

      integrateGraph.mutate(
        {
          topicSpaceId: contextId,
          graphDocument: graphDocumentToIntegrate,
        },
        {
          onSuccess: () => {
            setNewGraphDocument(null);
            setIsGraphEditorMode(false);
            refetch?.();
            // Node詳細パネルの隣接グラフビュー（getRelatedNodes）を再取得して更新する
            void utils.kg.getRelatedNodes.invalidate({
              nodeId: node.id,
              contextId,
              contextType,
            });
          },
          onError: (e) => {
            console.error("グラフの統合に失敗しました", e);
            alert(tGraph("integrateFailed"));
          },
        },
      );
      return;
    }

    // トピックスペース以外（ドキュメント等）は従来どおり編集ビューにステージングする。
    setNewGraphDocument(additionalGraph);
    setIsGraphEditorMode(true);
  };

  return (
    <div className="flex w-full flex-col gap-4 px-6 py-2">
      <div className="flex flex-col gap-8">
        <Button
          className="!h-6 !p-1"
          onClick={() => router.push(`${pathname}?list=true`)}
        >
          <ChevronRightIcon width={16} height={16} />
        </Button>
        <div className="flex w-full flex-col gap-4">
          <div className="flex flex-col gap-1">
            <div className="text-lg font-bold">{node.name}</div>
            <div className="text-sm text-gray-500">{node.label}</div>
          </div>

          {node.properties?.imageUrl && (
            <div className="flex flex-col gap-1">
              <div className="relative aspect-video max-h-64 w-full max-w-md overflow-hidden rounded bg-slate-800">
                <Image
                  src={node.properties.imageUrl}
                  alt={node.properties.imageAlt ?? node.name}
                  fill
                  className="object-contain"
                  sizes="(max-width: 448px) 100vw, 448px"
                />
              </div>
              {node.properties.imageCaption && (
                <p className="text-sm text-slate-400">
                  {node.properties.imageCaption}
                </p>
              )}
            </div>
          )}

          <div className="flex w-full flex-col gap-4">
            <div className="flex w-full flex-col items-start gap-1">
              <RelatedNodesAndLinksViewer
                node={node}
                contextId={contextId}
                contextType={contextType}
                onSelectNode={navigateToNode}
                className="flex w-full flex-col gap-1 rounded-md border border-gray-600"
              />
              {contextType === "topicSpace" && (
                <a
                  className="w-max cursor-pointer rounded-md bg-slate-500 p-2 text-sm text-white"
                  href={`/topic-spaces/${contextId}/tree/${node.id}`}
                >
                  {tGraph("treeView")}
                </a>
              )}
            </div>

            <div className="flex flex-row items-center gap-3">
              <div className="text-xs">{tGraph("properties")}</div>

              {enableEdit && (
                <>
                  <Button
                    className="!p-1 !text-sm"
                    onClick={() => setOnEdit(!onEdit)}
                  >
                    {onEdit ? (
                      tCommon("cancel")
                    ) : (
                      <Pencil2Icon width={18} height={18} color="white" />
                    )}
                  </Button>
                  {node.properties.description && (
                    <Button
                      onClick={generateGraphFromDescription}
                      className="!p-1 !text-sm"
                      disabled={isExtracting}
                    >
                      {isExtracting ? (
                        <Loading color="white" size={12} />
                      ) : (
                        <>
                          {newGraphDocument
                            ? tGraph("regenerateFromDescription")
                            : tGraph("extendKnowledgeGraph")}
                        </>
                      )}
                    </Button>
                  )}
                </>
              )}
            </div>

            {onEdit && enableEdit && refetch ? (
              <div className="flex w-full flex-col gap-1">
                <NodePropertiesForm
                  node={node}
                  topicSpaceId={contextType === "topicSpace" ? contextId : ""}
                  refetch={refetch}
                  setIsEditing={setOnEdit}
                  enableProposalMode={true}
                />
              </div>
            ) : (
              <PropertiesDetailPanel
                data={node}
                contextId={contextId}
                contextType={contextType}
              />
            )}

            {contextType === "topicSpace" && (
              <div className="flex w-full flex-col gap-4">
                <NodeAnnotationSection
                  node={node}
                  topicSpaceId={contextType === "topicSpace" ? contextId : ""}
                  setFocusedNode={(target) => {
                    const resolved =
                      typeof target === "function" ? target(node) : target;
                    if (resolved) navigateToNode(resolved);
                  }}
                  setIsGraphEditor={setIsGraphEditorMode}
                  onGraphUpdate={onGraphUpdate}
                />
              </div>
            )}

            {contextType === "topicSpace" &&
              refetch &&
              newGraphDocument &&
              isGraphEditorMode && (
                <AdditionalGraphViewer
                  newGraphDocument={newGraphDocument}
                  setGraphDocument={setNewGraphDocument}
                  topicSpaceId={contextId}
                  refetch={refetch}
                />
              )}
          </div>
        </div>
      </div>
    </div>
  );
};
