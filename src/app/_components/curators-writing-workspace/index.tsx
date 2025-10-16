"use client";

import type {
  CustomLinkType,
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
import {
  ChevronLeftIcon,
  CrossLargeIcon,
  Pencil2Icon,
  PinLeftIcon,
  PinRightIcon,
  PlusIcon,
} from "../icons";
import { LinkButton } from "../button/link-button";
import { TopicSpaceAttachModal } from "../workspace/topic-space-attach-modal";
import { RelatedNodesAndLinksViewer } from "../view/graph-view/related-nodes-viewer";
import { findEntityHighlights } from "@/app/_utils/text/find-entity-highlights";
import { NodeDetailPanel } from "./node-detail-panel";
import { PDFDropZone } from "./pdf-drop-zone";
import { usePDFProcessing } from "./hooks/use-pdf-processing";
import { Modal } from "../modal/modal";
import { useGraphEditor } from "@/app/_hooks/use-graph-editor";
import {
  LinkPropertyEditModal,
  NodePropertyEditModal,
} from "../modal/node-link-property-edit-modal";
import { NodeLinkEditModal } from "../modal/node-link-edit-modal";
import { PlusCircleIcon } from "@heroicons/react/24/outline";

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

  const updateGraphData = api.topicSpaces.updateGraph.useMutation();
  const [isTopicSpaceAttachModalOpen, setIsTopicSpaceAttachModalOpen] =
    useState<boolean>(false);
  const [isPDFUploadModalOpen, setIsPDFUploadModalOpen] =
    useState<boolean>(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitle, setEditingTitle] = useState(workspace.name);
  const [displayTitle, setDisplayTitle] = useState(workspace.name);

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
  const { data: topicSpace } = api.topicSpaces.getById.useQuery({
    id: topicSpaceId ?? "",
  });
  const updateWorkspace = api.workspace.update.useMutation({
    onSuccess: (data) => {
      // 更新成功時に即座に表示タイトルを更新
      if (data?.name) {
        setDisplayTitle(data.name);
      }
      setIsEditingTitle(false);
      void refetch(); // データを再取得
    },
    onError: (error) => {
      console.error("ワークスペース名の更新に失敗しました:", error);
      setIsEditingTitle(false);
      setEditingTitle(workspace.name); // エラー時は元の名前に戻す
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

  const handleTitleEdit = (value: string) => {
    setIsEditingTitle(true);
    setEditingTitle(value);
  };

  const handleTitleSave = () => {
    const trimmedTitle = editingTitle.trim();

    // バリデーション: 空文字または変更なしの場合は編集を終了
    if (!trimmedTitle || trimmedTitle === workspace.name) {
      setIsEditingTitle(false);
      setEditingTitle(workspace.name);
      return;
    }

    // 更新中は編集モードを維持（isEditingTitleをfalseにしない）
    updateWorkspace.mutate({
      id: workspace.id,
      name: trimmedTitle,
    });
  };

  const handleTitleCancel = () => {
    setIsEditingTitle(false);
    setEditingTitle(workspace.name);
  };

  const handleTitleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleTitleSave();
    } else if (e.key === "Escape") {
      handleTitleCancel();
    }
  };

  const onRecordUpdate = () => {
    if (!graphDocument) return;
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
  };

  return (
    <div className="flex h-screen w-full gap-2 bg-slate-900 p-4 font-sans">
      {/* Left Column: Text Editor */}
      <div
        className={`flex h-[calc(100svh-80px)] flex-col transition-all duration-300 ${
          isRightPanelOpen ? (isGraphEditor ? "w-1/2" : "w-2/3") : "w-full"
        }`}
      >
        <div className="flex h-full flex-col bg-slate-900">
          <div className="mb-2 flex w-full flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <LinkButton
                href="/workspaces"
                className="flex !h-8 !w-8 items-center justify-center"
              >
                <div className="h-4 w-4">
                  <ChevronLeftIcon height={16} width={16} color="white" />
                </div>
              </LinkButton>
              {isEditingTitle ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onBlur={handleTitleSave}
                    onKeyDown={handleTitleKeyPress}
                    disabled={updateWorkspace.isPending}
                    className="bg-transparent text-lg font-semibold text-gray-400 outline-none focus:text-white disabled:opacity-50"
                    autoFocus
                  />
                  {updateWorkspace.isPending && (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"></div>
                  )}
                </div>
              ) : (
                <h2
                  className="cursor-pointer text-lg font-semibold text-gray-400 hover:text-white"
                  onClick={() => handleTitleEdit(displayTitle)}
                  title="クリックして編集"
                >
                  {displayTitle}
                </h2>
              )}
            </div>

            {/* Right Panel Toggle Button */}
            <Button
              size="small"
              onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
              className="flex items-center gap-1"
            >
              {isRightPanelOpen ? (
                <PinRightIcon height={16} width={16} color="white" />
              ) : (
                <PinLeftIcon height={16} width={16} color="white" />
              )}
            </Button>
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

      {/* Right Column: Knowledge Graph Viewer & Detail Panel */}
      {isRightPanelOpen && (
        <div
          className={`flex h-[calc(100svh-80px)] flex-col transition-all duration-300 ${
            isGraphEditor ? "w-1/2" : "w-1/3"
          }`}
        >
          {/* Knowledge Graph Viewer */}
          <div
            className={`min-h-0 flex-shrink-0 overflow-y-hidden ${
              isGraphEditor ? "flex-[3]" : "flex-1"
            }`}
          >
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
                          key={`graph-${isRightPanelOpen}-${graphSize.width}-${graphSize.height}`}
                          svgRef={svgRef}
                          width={graphSize.width}
                          height={graphSize.height}
                          // defaultPosition={defaultPosition}
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
                          toolComponent={
                            <div className="absolute ml-1 mt-1 flex flex-row items-center gap-1">
                              {!isGraphEditor ? (
                                <>
                                  <Button
                                    size="small"
                                    onClick={() =>
                                      setIsGraphEditor(!isGraphEditor)
                                    }
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
                                    onClick={() =>
                                      setIsPDFUploadModalOpen(true)
                                    }
                                    className="flex items-center gap-1"
                                  >
                                    <PlusIcon
                                      height={16}
                                      width={16}
                                      color="white"
                                    />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    size="small"
                                    onClick={() =>
                                      setIsGraphEditor(!isGraphEditor)
                                    }
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
                                      className="flex items-center gap-1 text-sm"
                                    >
                                      グラフを更新
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          }
                          focusedLink={undefined}
                          isLargeGraph={false}
                          isEditor={isGraphEditor}
                          onGraphUpdate={
                            isGraphEditor ? onGraphUpdate : undefined
                          }
                          onNodeContextMenu={
                            isGraphEditor ? onNodeContextMenu : undefined
                          }
                          onLinkContextMenu={
                            isGraphEditor ? onLinkContextMenu : undefined
                          }
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

          {/* Detail/Evidence Panel */}
          <div
            className={`relative flex-shrink-0 overflow-y-hidden ${
              isGraphEditor ? "flex-[1]" : "flex-1"
            }`}
          >
            {topicSpaceId ? (
              <NodeDetailPanel
                activeEntity={activeEntity}
                topicSpaceId={topicSpaceId}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-b-lg border border-t-0 border-gray-300 bg-slate-800 text-gray-400">
                <div className="text-center">
                  <p className="text-sm">
                    リポジトリを選択すると詳細パネルが表示されます
                  </p>
                </div>
              </div>
            )}
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
