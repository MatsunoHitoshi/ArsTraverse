"use client";

import type {
  CustomNodeType,
  GraphDocumentForFrontend,
  TiptapGraphFilterOption,
  LayoutInstruction,
  CuratorialContext,
} from "@/app/const/types";
import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  createContext,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import TipTapEditor from "./tiptap/tip-tap-editor";
import type { Workspace } from "@prisma/client";
import { api } from "@/trpc/react";
import { Button } from "../button/button";
import type { JSONContent } from "@tiptap/react";
import {
  CheckIcon,
  CrossLargeIcon,
  Pencil2Icon,
  PlusIcon,
  ShareIcon,
  ZoomInIcon,
  ChatBubbleIcon,
  ResetIcon,
} from "../icons";

import { TopicSpaceAttachModal } from "../workspace/topic-space-attach-modal";

import { findEntityHighlights } from "@/app/_utils/text/find-entity-highlights";

import { PDFDropZone } from "./pdf-drop-zone";
import { usePDFProcessing } from "./hooks/use-pdf-processing";
import { Modal } from "../modal/modal";
import { useGraphEditor } from "@/app/_hooks/use-graph-editor";
import { createSubgraphFromSelectedNodes } from "@/app/_utils/kg/create-subgraph-from-selected-nodes";
import { filterGraphByEntityNames } from "@/app/_utils/kg/filter-graph-by-entity-names";
import {
  LinkPropertyEditModal,
  NodePropertyEditModal,
} from "../modal/node-link-property-edit-modal";
import { NodeLinkEditModal } from "../modal/node-link-edit-modal";
import { ProposalCreateModal } from "./proposal-create-modal";
import { ShareTopicSpaceModal } from "./share-topic-space-modal";
import { PublishWorkspaceModal } from "./publish-workspace-modal";
import { DirectedLinksToggleButton } from "../view/graph-view/directed-links-toggle-button";
import { SnapshotStoryboard } from "./artifact/snapshot-storyboard";
import { useMetaGraphStory } from "@/app/_hooks/use-meta-graph-story";
import { WorkspaceToolbar } from "./workspace-toolbar";
import { GraphViewContainer } from "./graph-view-container";
import { RightPanelContainer } from "./right-panel-container";
// import { PlusCircleIcon } from "@heroicons/react/24/outline";

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();

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

  const updateGraphData = api.topicSpaces.updateGraph.useMutation();
  const [isTopicSpaceAttachModalOpen, setIsTopicSpaceAttachModalOpen] =
    useState<boolean>(false);
  const [isPDFUploadModalOpen, setIsPDFUploadModalOpen] =
    useState<boolean>(false);
  const [isProposalCreateModalOpen, setIsProposalCreateModalOpen] =
    useState<boolean>(false);
  const [isShareTopicSpaceModalOpen, setIsShareTopicSpaceModalOpen] =
    useState<boolean>(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [displayTitle, setDisplayTitle] = useState(workspace.name);
  const [magnifierMode, setMagnifierMode] = useState(0);
  const [isGraphSelectionMode, setIsGraphSelectionMode] =
    useState<boolean>(false);
  const [selectedNodeIdsForAI, setSelectedNodeIdsForAI] = useState<string[]>(
    [],
  );
  const [isPublishModalOpen, setIsPublishModalOpen] = useState<boolean>(false);
  const completionWithSubgraphRef = useRef<
    null | ((subgraph: GraphDocumentForFrontend) => void)
  >(null);

  // 右パネルの状態管理
  const [rightPanelMode, setRightPanelMode] = useState<"detail" | "copilot">(
    "detail",
  );
  const [layoutInstruction, setLayoutInstruction] =
    useState<LayoutInstruction | null>(null);
  const [filteredGraphData, setFilteredGraphData] =
    useState<GraphDocumentForFrontend | null>(null);

  // ストーリーテリングモード
  const [isStorytellingMode, setIsStorytellingMode] = useState<boolean>(false);

  // ストーリー編集モード（並び替えモード）
  const [isStoryEditMode, setIsStoryEditMode] = useState<boolean>(false);

  // メタグラフ関連の状態
  const [isMetaGraphMode, setIsMetaGraphMode] = useState<boolean>(false);

  // 現在フォーカス中のコミュニティID（ストーリーテリングモード用）
  const [focusedCommunityId, setFocusedCommunityId] = useState<string | null>(
    null,
  );

  // レイアウト方向
  const [layoutOrientation, setLayoutOrientation] = useState<"vertical" | "horizontal">("vertical");

  // workspace.nameが更新されたらdisplayTitleも更新
  useEffect(() => {
    setDisplayTitle(workspace.name);
  }, [workspace.name]);

  const [editorContent, setEditorContent] = useState<JSONContent>(
    (workspace.content as JSONContent) ?? DEFAULT_CONTENT,
  );
  const [activeEntity, setActiveEntity] = useState<CustomNodeType | undefined>(
    undefined,
  );
  const { data: topicSpace } = api.topicSpaces.getByIdPublic.useQuery({
    id: topicSpaceId ?? "",
  });

  const isAdmin = topicSpace?.admins?.some(
    (admin) => admin.id === session?.user?.id,
  );

  // URLクエリパラメータからactiveEntityのIDを取得
  const activeEntityId = searchParams.get("entityId");

  // activeEntityが変更されたときにURLを更新
  const updateActiveEntity = (entity: CustomNodeType | undefined) => {
    setActiveEntity(entity);

    const params = new URLSearchParams(searchParams.toString());
    if (entity) {
      params.set("entityId", entity.id);
    } else {
      params.delete("entityId");
    }

    // URLを更新（ブラウザ履歴に追加）
    router.push(`?${params.toString()}`, { scroll: false });
  };

  // setFocusedNode用のラッパー関数（型互換性のため）
  const setFocusedNodeWrapper = (
    value: React.SetStateAction<CustomNodeType | undefined>,
  ) => {
    if (typeof value === "function") {
      const newValue = value(activeEntity);
      updateActiveEntity(newValue);
    } else {
      updateActiveEntity(value);
    }
  };
  const updateWorkspace = api.workspace.update.useMutation({
    onSuccess: (data) => {
      // 更新成功時に即座に表示タイトルを更新
      if (data?.name) {
        setDisplayTitle(data.name);
      }
      void refetch(); // データを再取得
    },
    onError: (error) => {
      console.error("ワークスペース名の更新に失敗しました:", error);
      // エラー時は元の名前に戻す
      setDisplayTitle(workspace.name);
    },
  });

  // const [defaultPosition, setDefaultPosition] = useState<{
  //   x: number;
  //   y: number;
  // }>({
  //   x: 0,
  //   y: 0,
  // });
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
  const defaultGraphDocument = topicSpace?.graphData;
  const [isDirectedLinks, setIsDirectedLinks] = useState<boolean>(false);

  // グラフ編集用のカスタムフック
  const {
    graphDocument,
    setGraphDocument,
    isEditor: isGraphEditor,
    setIsEditor: setIsGraphEditor,
    isGraphUpdated,
    isNodePropertyEditModalOpen,
    setIsNodePropertyEditModalOpen,
    isLinkPropertyEditModalOpen,
    setIsLinkPropertyEditModalOpen,
    isNodeLinkAttachModalOpen,
    setIsNodeLinkAttachModalOpen,
    focusedNode,
    setFocusedNode,
    focusedLink,
    setFocusedLink,
    additionalGraph,
    setAdditionalGraph,
    onNodeContextMenu,
    onLinkContextMenu,
    onGraphUpdate,
    resetGraphUpdated,
  } = useGraphEditor({
    defaultGraphDocument,
    onUpdateSuccess: () => {
      void refetch();
    },
    onUpdateError: (error) => {
      console.error("グラフの更新に失敗しました", error);
    },
  });

  // メタグラフストーリー生成用のカスタムフック
  const metaGraphStory = useMetaGraphStory(
    graphDocument,
    filteredGraphData,
    workspace,
    isMetaGraphMode,
  );

  // PDF処理用のカスタムフック
  const { isProcessingPDF, processingStep, processingError, handlePDFUpload } =
    usePDFProcessing(
      workspace.id,
      () => {
        void refetch();
      },
      topicSpaceId,
      () => {
        // 処理完了後にモーダルを閉じる
        setIsPDFUploadModalOpen(false);
      },
    );

  const nodes = graphDocument?.nodes ?? [];

  // URLクエリパラメータに基づいてactiveEntityを設定
  useEffect(() => {
    if (activeEntityId && graphDocument?.nodes) {
      const foundNode = graphDocument.nodes.find(
        (node) => node.id === activeEntityId,
      );
      if (foundNode) {
        setActiveEntity(foundNode);
      }
    } else if (!activeEntityId) {
      setActiveEntity(undefined);
    }
  }, [activeEntityId, graphDocument?.nodes]);

  const tiptapFilteredGraphDocument = useMemo(() => {
    return filterGraphByEntityNames(
      graphDocument,
      tiptapGraphFilterOption.entities,
    );
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

  // 右パネルが開いた時にグラフサイズを再計算
  useEffect(() => {
    if (isRightPanelOpen && graphContainerRef.current) {
      // 少し遅延させてからサイズを再計算
      const timeoutId = setTimeout(() => {
        const rect = graphContainerRef.current?.getBoundingClientRect();
        if (rect) {
          setGraphSize({
            width: rect.width,
            height: rect.height,
          });
        }
      }, 300);

      return () => clearTimeout(timeoutId);
    }
  }, [isRightPanelOpen]);

  // エンティティ名のクリック処理
  const handleEntityClick = (entityName: string) => {
    const foundNode = nodes.find((n: CustomNodeType) => n.name === entityName);
    if (foundNode) {
      updateActiveEntity(foundNode);
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

  const handleTitleSave = (newTitle: string) => {
    if (newTitle !== workspace.name) {
      updateWorkspace.mutate({
        id: workspace.id,
        name: newTitle,
      });
    }
  };

  const onRecordUpdate = () => {
    if (!graphDocument) return;

    if (isAdmin) {
      // adminの場合は直接グラフを更新
      updateGraphData.mutate(
        {
          id: topicSpaceId ?? "",
          dataJson: graphDocument,
        },
        {
          onSuccess: (res) => {
            console.log("グラフの更新に成功しました", res);
            void refetch();
            setIsGraphEditor(false);
            resetGraphUpdated();
          },
          onError: (error) => {
            console.error("グラフの更新に失敗しました", error);
          },
        },
      );
    } else {
      // adminでない場合は変更提案作成モーダルを開く
      setIsProposalCreateModalOpen(true);
    }
  };

  return (
    <div className="flex h-screen w-full gap-2 bg-slate-900 p-4 font-sans">
      {/* Left Column: Text Editor */}
      <div
        className={`flex h-[calc(100svh-80px)] flex-col transition-all duration-300 ${isRightPanelOpen
          ? isGraphEditor || isGraphSelectionMode
            ? "w-1/2"
            : "w-2/3"
          : "w-full"
          }`}
      >
        <div className="flex h-full flex-col bg-slate-900">
          <WorkspaceToolbar
            workspace={workspace}
            displayTitle={displayTitle}
            onTitleSave={handleTitleSave}
            isTitlePending={updateWorkspace.isPending}
            isStorytellingMode={isStorytellingMode}
            onStorytellingModeToggle={() => {
              if (!isStorytellingMode) {
                setIsMetaGraphMode(true);
              }
              setIsStorytellingMode(!isStorytellingMode);
            }}
            isMetaGraphMode={isMetaGraphMode}
            onMetaGraphModeToggle={() => {
              if (isMetaGraphMode) {
                setIsStorytellingMode(false);
              }
              setIsMetaGraphMode(!isMetaGraphMode);
            }}
            isRightPanelOpen={isRightPanelOpen}
            onRightPanelToggle={() => setIsRightPanelOpen(!isRightPanelOpen)}
            onPublish={() => setIsPublishModalOpen(true)}
            onShare={() => setIsShareTopicSpaceModalOpen(true)}
            graphDocument={graphDocument}
            isMetaGraphGenerating={metaGraphStory.isLoading}
          />

          {/* TipTapエディタ */}
          <div className="h-full max-h-full flex-grow overflow-y-hidden">
            {isStorytellingMode ? (
              <SnapshotStoryboard
                workspaceId={workspace.id}
                metaGraphSummaries={metaGraphStory.metaGraphData?.summaries}
                narrativeFlow={metaGraphStory.metaGraphData?.narrativeFlow}
                detailedStories={metaGraphStory.metaGraphData?.detailedStories}
                preparedCommunities={
                  metaGraphStory.metaGraphData?.preparedCommunities
                }
                narrativeActions={metaGraphStory.actions}
                isRegeneratingTransitions={
                  metaGraphStory.isRegeneratingTransitions
                }
                onCommunityFocus={(communityId) => {
                  // コミュニティにフォーカスしたときにグラフビューを更新
                  setFocusedCommunityId(communityId);
                }}
                metaGraphData={
                  metaGraphStory.metaGraphData
                    ? {
                      metaNodes: [],
                      metaGraph: metaGraphStory.metaGraphData.metaGraph,
                    }
                    : undefined
                }
                currentContent={editorContent}
                onContentUpdate={(content) => {
                  setEditorContent(content);
                  void refetch();
                }}
                referencedTopicSpaceId={topicSpaceId ?? undefined}
                metaGraphStoryData={metaGraphStory.metaGraphData}
                setIsStorytellingMode={setIsStorytellingMode}
                onEditModeChange={setIsStoryEditMode}
                onStoryDelete={() => {
                  setIsStorytellingMode(false);
                  setIsMetaGraphMode(false);
                }}
              />
            ) : (
              <TiptapGraphFilterContext.Provider
                value={{ tiptapGraphFilterOption, setTiptapGraphFilterOption }}
              >
                <TipTapEditor
                  content={editorContent}
                  onUpdate={onEditorContentUpdate}
                  entities={nodes}
                  onEntityClick={handleEntityClick}
                  workspaceId={workspace.id}
                  onGraphUpdate={onGraphUpdate}
                  setIsGraphEditor={setIsGraphEditor}
                  setIsGraphSelectionMode={setIsGraphSelectionMode}
                  completionWithSubgraphRef={
                    completionWithSubgraphRef as React.MutableRefObject<
                      ((subgraph: GraphDocumentForFrontend) => void) | null
                    >
                  }
                />
              </TiptapGraphFilterContext.Provider>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Knowledge Graph Viewer & Detail Panel */}
      {isRightPanelOpen && (
        <div
          className={`flex h-[calc(100svh-80px)] flex-col transition-all duration-300 ${isGraphEditor || isGraphSelectionMode || isStorytellingMode
            ? "w-1/2"
            : "w-1/3"
            }`}
        >
          {/* Knowledge Graph Viewer */}
          <div
            className={`min-h-0 flex-shrink-0 overflow-y-hidden ${isGraphEditor ? "flex-[3]" : "flex-1"
              }`}
          >
            <div
              ref={graphContainerRef}
              className="relative flex h-full w-full flex-col items-center justify-center rounded-t-lg border border-b-0 border-gray-300 bg-slate-900 text-gray-400"
            >
              {topicSpace ? (
                <>
                  {graphDocument ? (
                    <GraphViewContainer
                      topicSpace={topicSpace}
                      graphDocument={graphDocument}
                      activeEntity={activeEntity}
                      layoutInstruction={layoutInstruction}
                      filteredGraphData={filteredGraphData}
                      isMetaGraphMode={isMetaGraphMode}
                      metaGraphData={
                        metaGraphStory.metaGraphData
                          ? {
                            metaGraph: metaGraphStory.metaGraphData.metaGraph,
                            communityMap:
                              metaGraphStory.metaGraphData.communityMap,
                          }
                          : null
                      }
                      metaGraphSummaries={
                        metaGraphStory.metaGraphData?.summaries ?? []
                      }
                      narrativeFlow={
                        metaGraphStory.metaGraphData?.narrativeFlow
                      }
                      focusedCommunityId={focusedCommunityId}
                      graphSize={graphSize}
                      svgRef={svgRef}
                      currentScale={currentScale}
                      setCurrentScale={setCurrentScale}
                      setFocusedNode={setFocusedNodeWrapper}
                      tiptapGraphFilterOption={tiptapGraphFilterOption}
                      graphDocumentForDisplay={
                        tiptapGraphFilterOption.mode === "filtered"
                          ? (tiptapFilteredGraphDocument ?? graphDocument)
                          : graphDocument
                      }
                      isGraphEditor={isGraphEditor}
                      isGraphSelectionMode={isGraphSelectionMode}
                      selectedNodeIdsForAI={selectedNodeIdsForAI}
                      completionWithSubgraphRef={completionWithSubgraphRef}
                      isDirectedLinks={isDirectedLinks}
                      setIsDirectedLinks={setIsDirectedLinks}
                      magnifierMode={magnifierMode}
                      setMagnifierMode={setMagnifierMode}
                      isRightPanelOpen={isRightPanelOpen}
                      isLargeGraph={false}
                      onGraphUpdate={isGraphEditor ? onGraphUpdate : undefined}
                      onNodeContextMenu={
                        isGraphEditor ? onNodeContextMenu : undefined
                      }
                      onLinkContextMenu={
                        isGraphEditor ? onLinkContextMenu : undefined
                      }
                      onNodeSelectionToggle={(node) => {
                        setSelectedNodeIdsForAI((prev) =>
                          prev.includes(node.id)
                            ? prev.filter((id) => id !== node.id)
                            : [...prev, node.id],
                        );
                      }}
                      selectedGraphData={(() => {
                        if (isGraphSelectionMode) {
                          if (
                            graphDocument &&
                            selectedNodeIdsForAI.length > 0
                          ) {
                            const selectedNodes = graphDocument.nodes.filter(
                              (n) => selectedNodeIdsForAI.includes(n.id),
                            );
                            const selectedRelationships =
                              graphDocument.relationships.filter(
                                (r) =>
                                  selectedNodeIdsForAI.includes(r.sourceId) &&
                                  selectedNodeIdsForAI.includes(r.targetId),
                              );
                            return {
                              nodes: selectedNodes,
                              relationships: selectedRelationships,
                            };
                          }
                          return undefined;
                        }
                        if (tiptapGraphFilterOption.mode !== "non-filtered") {
                          return tiptapSelectedGraphDocument ?? undefined;
                        }
                        return undefined;
                      })()}
                      toolComponent={
                        <div className="absolute ml-1 mt-1 flex flex-row items-center gap-1">
                          {!isGraphEditor ? (
                            <>
                              <Button
                                size="small"
                                onClick={() =>
                                  setMagnifierMode((prev) => (prev + 1) % 3)
                                }
                                className={`flex items-center gap-1 ${magnifierMode === 1
                                  ? "bg-orange-500/40"
                                  : magnifierMode === 2
                                    ? "bg-orange-700/40"
                                    : ""
                                  }`}
                              >
                                <ZoomInIcon
                                  height={16}
                                  width={16}
                                  color={magnifierMode > 0 ? "orange" : "white"}
                                />
                              </Button>
                              {isGraphSelectionMode && (
                                <div className="ml-2 flex items-center gap-2 rounded-md bg-slate-900/80 px-2 py-1 text-xs text-orange-200 backdrop-blur-sm">
                                  <span>AIモード: ノードを選択</span>
                                  {selectedNodeIdsForAI.length > 0 && (
                                    <Button
                                      size="small"
                                      className="flex !h-6 !w-6 items-center justify-center !p-1 text-xs"
                                      onClick={() => {
                                        if (
                                          !graphDocument ||
                                          !completionWithSubgraphRef?.current
                                        )
                                          return;
                                        const subgraph =
                                          createSubgraphFromSelectedNodes(
                                            graphDocument,
                                            selectedNodeIdsForAI,
                                          );
                                        completionWithSubgraphRef.current(
                                          subgraph,
                                        );
                                        setIsGraphSelectionMode(false);
                                        setSelectedNodeIdsForAI([]);
                                      }}
                                    >
                                      <CheckIcon
                                        height={16}
                                        width={16}
                                        color="green"
                                      />
                                    </Button>
                                  )}
                                  <Button
                                    size="small"
                                    className="flex !h-6 !w-6 items-center justify-center !p-1 text-xs"
                                    onClick={() => {
                                      setIsGraphSelectionMode(false);
                                      setSelectedNodeIdsForAI([]);
                                    }}
                                  >
                                    <CrossLargeIcon
                                      height={14}
                                      width={14}
                                      color="red"
                                    />
                                  </Button>
                                </div>
                              )}
                              <Button
                                size="small"
                                onClick={() => setIsGraphEditor(!isGraphEditor)}
                                className="flex items-center gap-1"
                              >
                                <Pencil2Icon
                                  height={16}
                                  width={16}
                                  color="white"
                                />
                              </Button>
                              <Button
                                size="small"
                                onClick={() => {
                                  setRightPanelMode(
                                    rightPanelMode === "copilot"
                                      ? "detail"
                                      : "copilot",
                                  );
                                }}
                                className={`flex items-center gap-1 ${rightPanelMode === "copilot"
                                  ? "bg-blue-600"
                                  : ""
                                  }`}
                              >
                                <ChatBubbleIcon
                                  height={16}
                                  width={16}
                                  color="white"
                                />
                              </Button>
                              <Button
                                size="small"
                                onClick={() => setIsPDFUploadModalOpen(true)}
                                className="flex items-center gap-1"
                              >
                                <PlusIcon
                                  height={16}
                                  width={16}
                                  color="white"
                                />
                              </Button>
                              <Button
                                size="small"
                                onClick={() =>
                                  setIsShareTopicSpaceModalOpen(true)
                                }
                                className="flex items-center gap-1"
                              >
                                <ShareIcon
                                  height={16}
                                  width={16}
                                  color="white"
                                />
                              </Button>
                              <DirectedLinksToggleButton
                                isDirectedLinks={isDirectedLinks}
                                setIsDirectedLinks={setIsDirectedLinks}
                              />
                              {layoutInstruction && (
                                <Button
                                  size="small"
                                  onClick={() => setLayoutInstruction(null)}
                                  className="flex items-center gap-1 bg-red-500/80 hover:bg-red-600/80"
                                >
                                  <ResetIcon
                                    height={16}
                                    width={16}
                                    color="white"
                                  />
                                  レイアウトをリセット
                                </Button>
                              )}
                            </>
                          ) : (
                            <>
                              <Button
                                size="small"
                                onClick={() => setIsGraphEditor(!isGraphEditor)}
                                className="flex items-center gap-1"
                              >
                                <CrossLargeIcon
                                  height={16}
                                  width={16}
                                  color="white"
                                />
                              </Button>
                              {isGraphUpdated && (
                                <Button
                                  size="small"
                                  onClick={onRecordUpdate}
                                  className="flex items-center gap-1 text-xs"
                                >
                                  {isAdmin ? "グラフを更新" : "変更提案を作成"}
                                </Button>
                              )}
                              <DirectedLinksToggleButton
                                isDirectedLinks={isDirectedLinks}
                                setIsDirectedLinks={setIsDirectedLinks}
                              />
                            </>
                          )}
                        </div>
                      }
                      layoutOrientation={layoutOrientation}
                      isEditMode={isStoryEditMode}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <p>グラフデータが見つかりません</p>
                    </div>
                  )}
                </>
              ) : (
                <PDFDropZone
                  isProcessingPDF={isProcessingPDF}
                  processingStep={processingStep}
                  processingError={processingError}
                  onPDFUpload={handlePDFUpload}
                  onSelectExistingRepository={() =>
                    setIsTopicSpaceAttachModalOpen(true)
                  }
                  withTopicSpaceOption={true}
                />
              )}
            </div>
          </div>

          {/* Detail/Evidence Panel or Copilot */}
          <div
            className={`relative flex-shrink-0 overflow-y-hidden ${isGraphEditor ? "flex-[1]" : "flex-1"
              }`}
          >
            <RightPanelContainer
              rightPanelMode={rightPanelMode}
              activeEntity={activeEntity}
              topicSpaceId={topicSpaceId}
              setFocusedNode={setFocusedNodeWrapper}
              setIsGraphEditor={setIsGraphEditor}
              onGraphUpdate={onGraphUpdate}
              workspaceId={workspace.id}
              currentGraphData={graphDocument}
              curatorialContext={
                workspace.curatorialContext as CuratorialContext | null
              }
              onLayoutInstruction={(instruction) => {
                console.log("Layout instruction received:", instruction);
                setLayoutInstruction(instruction);
              }}
              onFilteredGraphData={(filteredGraph) => {
                setFilteredGraphData(filteredGraph);
              }}
              isGraphEditor={isGraphEditor}
            />
          </div>
        </div>
      )}

      <TopicSpaceAttachModal
        isOpen={isTopicSpaceAttachModalOpen}
        setIsOpen={setIsTopicSpaceAttachModalOpen}
        workspaceId={workspace.id}
        refetch={refetch}
      />

      {/* PDFアップロードモーダル */}
      <Modal
        isOpen={isPDFUploadModalOpen}
        setIsOpen={setIsPDFUploadModalOpen}
        title="新しいドキュメントを追加する"
      >
        <PDFDropZone
          isProcessingPDF={isProcessingPDF}
          processingStep={processingStep}
          processingError={processingError}
          onPDFUpload={handlePDFUpload}
          onSelectExistingRepository={() => {
            setIsPDFUploadModalOpen(false);
            setIsTopicSpaceAttachModalOpen(true);
          }}
        />
      </Modal>

      {/* 変更提案作成モーダル */}
      {graphDocument && (
        <ProposalCreateModal
          isOpen={isProposalCreateModalOpen}
          setIsOpen={setIsProposalCreateModalOpen}
          topicSpaceId={topicSpaceId ?? ""}
          graphDocument={graphDocument}
          onSuccess={(proposalId) => {
            router.push(`/proposals/${proposalId}`);
            setIsGraphEditor(false);
            resetGraphUpdated();
          }}
        />
      )}

      {/* TopicSpace共有モーダル */}
      <ShareTopicSpaceModal
        isOpen={isShareTopicSpaceModalOpen}
        setIsOpen={setIsShareTopicSpaceModalOpen}
        topicSpaceId={topicSpace?.id ?? ""}
        topicSpaceName={topicSpace?.name ?? ""}
      />

      {/* 記事公開モーダル */}
      <PublishWorkspaceModal
        isOpen={isPublishModalOpen}
        setIsOpen={setIsPublishModalOpen}
        workspaceId={workspace.id}
        workspaceStatus={workspace.status}
        workspaceName={workspace.name}
        onSuccess={() => {
          void refetch();
        }}
      />

      {/* グラフ編集用モーダル */}
      {isGraphEditor && graphDocument && (
        <>
          <NodePropertyEditModal
            isOpen={isNodePropertyEditModalOpen}
            setIsOpen={setIsNodePropertyEditModalOpen}
            graphDocument={graphDocument}
            setGraphDocument={setGraphDocument}
            graphNode={focusedNode}
          />
          <LinkPropertyEditModal
            isOpen={isLinkPropertyEditModalOpen}
            setIsOpen={setIsLinkPropertyEditModalOpen}
            graphDocument={graphDocument}
            setGraphDocument={setGraphDocument}
            graphLink={focusedLink}
          />
          <NodeLinkEditModal
            isOpen={isNodeLinkAttachModalOpen}
            setIsOpen={setIsNodeLinkAttachModalOpen}
            graphDocument={graphDocument}
            setGraphDocument={setGraphDocument}
            additionalGraph={additionalGraph}
            setAdditionalGraph={setAdditionalGraph}
          />
        </>
      )}
    </div>
  );
};

export default CuratorsWritingWorkspace;
