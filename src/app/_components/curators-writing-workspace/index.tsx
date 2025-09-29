"use client";

import type {
  CustomNodeType,
  GraphDocumentForFrontend,
  TiptapGraphFilterOption,
} from "@/app/const/types";
import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  createContext,
} from "react";
import { D3ForceGraph } from "../d3/force/graph";
import TipTapEditor from "./tiptap/tip-tap-editor";
import type { Workspace } from "@prisma/client";
import { api } from "@/trpc/react";
import { Button } from "../button/button";
import type { JSONContent } from "@tiptap/react";
import { ChevronLeftIcon } from "../icons";
import { LinkButton } from "../button/link-button";
import { TopicSpaceAttachModal } from "../workspace/topic-space-attach-modal";
import { RelatedNodesAndLinksViewer } from "../view/graph-view/related-nodes-viewer";
import { findEntityHighlights } from "@/app/_utils/text/find-entity-highlights";

interface CuratorsWritingWorkspaceProps {
  // 既存のprops（後方互換性のため）
  graphDocument?: GraphDocumentForFrontend | null;
  // 新しいprops（独立したワークスペース用）
  topicSpaceId?: string | null;
  // documentId?: string | null;
  workspace: Workspace;
  refetch: () => void;
}

export const TiptapGraphFilterContext = createContext<{
  tiptapGraphFilterOption: TiptapGraphFilterOption;
  setTiptapGraphFilterOption: React.Dispatch<
    React.SetStateAction<TiptapGraphFilterOption>
  >;
}>({
  tiptapGraphFilterOption: {
    mode: "non-filtered",
    entities: [],
  },
  setTiptapGraphFilterOption: () => {
    console.log("setTiptapGraphFilterOption");
  },
});

const CuratorsWritingWorkspace = ({
  topicSpaceId,
  // documentId,
  workspace,
  refetch,
}: CuratorsWritingWorkspaceProps) => {
  const DEFAULT_CONTENT: JSONContent = {
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

  const [isTopicSpaceAttachModalOpen, setIsTopicSpaceAttachModalOpen] =
    useState<boolean>(false);

  const [editorContent, setEditorContent] = useState<JSONContent>(
    (workspace.content as JSONContent) ?? DEFAULT_CONTENT,
  );
  const [activeEntity, setActiveEntity] = useState<CustomNodeType | undefined>(
    undefined,
  );
  const { data: topicSpace } = api.topicSpaces.getById.useQuery({
    id: topicSpaceId ?? "",
  });
  const updateWorkspace = api.workspace.update.useMutation();
  const [defaultPosition, setDefaultPosition] = useState<{
    x: number;
    y: number;
  }>({
    x: 0,
    y: 0,
  });
  const [tiptapGraphFilterOption, setTiptapGraphFilterOption] =
    useState<TiptapGraphFilterOption>({
      mode: "non-filtered",
      entities: [],
    });

  // --- Graph State ---
  const svgRef = useRef<SVGSVGElement>(null);
  const [currentScale, setCurrentScale] = useState<number>(1);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const [graphSize, setGraphSize] = useState({ width: 400, height: 400 });
  const graphDocument = topicSpace?.graphData;
  const nodes = graphDocument?.nodes ?? [];

  const tiptapFilteredGraphDocument = useMemo(() => {
    if (!graphDocument) return null;
    const filteredNodes = graphDocument?.nodes.filter((node) =>
      tiptapGraphFilterOption.entities.includes(node.name),
    );
    const filteredRelationships = graphDocument?.relationships.filter(
      (relationship) => {
        const ids = filteredNodes.map((node) => node.id);
        return (
          ids.includes(relationship.sourceId) ||
          ids.includes(relationship.targetId)
        );
      },
    );
    const neighborNodes = graphDocument?.nodes.filter((node) =>
      filteredRelationships.some(
        (relationship) =>
          relationship.sourceId === node.id ||
          relationship.targetId === node.id,
      ),
    );
    return {
      nodes: neighborNodes,
      relationships: filteredRelationships,
    };
  }, [graphDocument, tiptapGraphFilterOption]);

  const tiptapSelectedGraphDocument = useMemo(() => {
    if (!graphDocument) return null;

    const selectedNodes = graphDocument?.nodes.filter((node) =>
      tiptapGraphFilterOption.entities.includes(node.name),
    );
    const selectedRelationships = graphDocument?.relationships.filter(
      (relationship) => {
        const ids = selectedNodes.map((node) => node.id);
        return (
          ids.includes(relationship.sourceId) &&
          ids.includes(relationship.targetId)
        );
      },
    );
    return {
      nodes: selectedNodes,
      relationships: selectedRelationships,
    };
  }, [graphDocument, tiptapGraphFilterOption]);

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setGraphSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    if (graphContainerRef.current) {
      observer.observe(graphContainerRef.current);
      // Set initial size
      setGraphSize({
        width: graphContainerRef.current.clientWidth,
        height: graphContainerRef.current.clientHeight,
      });
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  // エンティティ名のクリック処理
  const handleEntityClick = (entityName: string) => {
    const foundNode = nodes.find((n: CustomNodeType) => n.name === entityName);
    if (foundNode) {
      setActiveEntity(foundNode);
    }
  };

  const onEditorContentUpdate = (
    content: JSONContent,
    updateAllowed: boolean,
  ) => {
    console.log("onSave");

    const entitiesInText = findEntityHighlights(content.content ?? []);
    const names = entitiesInText.map((entity) => entity.name);
    const diffCheck =
      names.length !== tiptapGraphFilterOption.entities.length ||
      names.some(
        (name, index) => name !== tiptapGraphFilterOption.entities[index],
      );
    if (diffCheck) {
      console.log("diffCheck: ", diffCheck);
      setTiptapGraphFilterOption({
        ...tiptapGraphFilterOption,
        entities: names,
      });
    }
    if (!updateAllowed) return;
    updateWorkspace.mutate({
      id: workspace.id,
      content: {
        type: "doc",
        content: content.content,
      },
    });
    setEditorContent(content);
  };

  return (
    <div className="flex h-screen w-full gap-2 bg-slate-900 p-4 font-sans">
      {/* Left Column: Text Editor (2/3) */}
      <div className="flex h-[calc(100svh-72px)] w-2/3 flex-col">
        <div className="flex h-full flex-col bg-slate-900">
          <div className="mb-2 flex w-full flex-row items-center gap-2">
            <LinkButton
              href="/workspaces"
              className="flex !h-8 !w-8 items-center justify-center"
            >
              <div className="h-4 w-4">
                <ChevronLeftIcon height={16} width={16} color="white" />
              </div>
            </LinkButton>
            <h2 className="text-lg font-semibold text-gray-400">
              {workspace.name}
            </h2>
          </div>

          {/* TipTapエディタ */}
          <div className="h-full max-h-full flex-grow overflow-y-hidden">
            <TiptapGraphFilterContext.Provider
              value={{ tiptapGraphFilterOption, setTiptapGraphFilterOption }}
            >
              <TipTapEditor
                content={editorContent}
                onUpdate={onEditorContentUpdate}
                entities={nodes}
                onEntityClick={handleEntityClick}
                workspaceId={workspace.id}
              />
            </TiptapGraphFilterContext.Provider>
          </div>
        </div>
      </div>

      {/* Right Column: Knowledge Graph Viewer & Detail Panel (1/3) */}
      <div className="flex w-1/3 flex-col">
        {/* Knowledge Graph Viewer */}
        <div className="flex-1">
          <div
            ref={graphContainerRef}
            className="relative flex h-full w-full flex-col items-center justify-center rounded-t-lg border border-b-0 border-gray-300 bg-slate-900 text-gray-400"
          >
            {topicSpace ? (
              <>
                {graphDocument ? (
                  <>
                    {activeEntity ? (
                      <RelatedNodesAndLinksViewer
                        node={activeEntity}
                        topicSpaceId={topicSpace.id}
                        className="h-full w-full"
                        height={graphSize.height}
                        width={graphSize.width}
                        onClose={() => setActiveEntity(undefined)}
                      />
                    ) : (
                      <D3ForceGraph
                        svgRef={svgRef}
                        width={graphSize.width}
                        height={graphSize.height}
                        defaultPosition={defaultPosition}
                        graphDocument={
                          tiptapGraphFilterOption.mode === "filtered"
                            ? tiptapFilteredGraphDocument ?? graphDocument
                            : graphDocument
                        }
                        isLinkFiltered={false}
                        currentScale={currentScale}
                        setCurrentScale={setCurrentScale}
                        setFocusedNode={setActiveEntity}
                        focusedNode={activeEntity}
                        setFocusedLink={() => {
                          // リンクフォーカス機能は現在使用しない
                        }}
                        selectedGraphData={
                          tiptapGraphFilterOption.mode !== "non-filtered"
                            ? tiptapSelectedGraphDocument ?? undefined
                            : undefined
                        }
                        focusedLink={undefined}
                        isLargeGraph={false}
                        isEditor={false}
                      />
                    )}
                  </>
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <p>グラフデータが見つかりません</p>
                  </div>
                )}
              </>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4">
                <p>参照するリポジトリが選択されていません</p>
                <Button onClick={() => setIsTopicSpaceAttachModalOpen(true)}>
                  参照するリポジトリを選択
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Detail/Evidence Panel */}
        <div className="flex-1">
          <div className="h-full rounded-b-lg border border-gray-300 bg-slate-900 p-4 shadow-sm">
            <h2 className="text-md mb-4 font-semibold text-gray-400">詳細</h2>
            {activeEntity ? (
              <div className="text-white">
                <h3 className="font-semibold text-white">
                  {activeEntity.name}
                </h3>
                <p className="text-sm text-gray-400">{activeEntity.label}</p>
                <p className="mt-2 text-sm">
                  {activeEntity.properties?.description ?? "No description"}
                </p>
                <hr className="my-4" />
                <h3 className="font-semibold text-gray-400">参照</h3>
              </div>
            ) : (
              <p className="text-gray-300">
                Editor内でハイライトされたエンティティをクリックすると詳細が表示されます。
              </p>
            )}
          </div>
        </div>
      </div>

      <TopicSpaceAttachModal
        isOpen={isTopicSpaceAttachModalOpen}
        setIsOpen={setIsTopicSpaceAttachModalOpen}
        workspaceId={workspace.id}
        refetch={refetch}
      />
    </div>
  );
};

export default CuratorsWritingWorkspace;
