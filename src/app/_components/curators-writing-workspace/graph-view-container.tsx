"use client";

import type {
  CustomLinkType,
  CustomNodeType,
  GraphDocumentForFrontend,
  LayoutInstruction,
} from "@/app/const/types";
import { D3ForceGraph } from "@/app/_components/d3/force/graph";
import { GenerativeLayoutGraph } from "@/app/_components/d3/force/generative-layout-graph";
import { RelatedNodesAndLinksViewer } from "@/app/_components/view/graph-view/related-nodes-viewer";
import type { TopicSpace } from "@prisma/client";

interface GraphViewContainerProps {
  topicSpace: TopicSpace | null | undefined;
  graphDocument: GraphDocumentForFrontend | null;
  activeEntity: CustomNodeType | undefined;
  layoutInstruction: LayoutInstruction | null;
  filteredGraphData: GraphDocumentForFrontend | null;
  /** ストーリーボード「反映」で絞り込んだグラフ */
  storyFilteredGraph?: GraphDocumentForFrontend | null;
  isStorytellingMode?: boolean;
  isMetaGraphMode: boolean;
  metaGraphData: {
    metaGraph: GraphDocumentForFrontend;
    communityMap?: Record<string, string>;
  } | null;
  metaGraphSummaries: Array<{
    communityId: string;
    title: string;
    summary: string;
    order?: number;
  }>;
  narrativeFlow?: Array<{
    communityId: string;
    order: number;
    transitionText: string;
  }>;
  focusedCommunityId?: string | null;
  graphSize: { width: number; height: number };
  svgRef: React.RefObject<SVGSVGElement>;
  currentScale: number;
  setCurrentScale: React.Dispatch<React.SetStateAction<number>>;
  setFocusedNode: React.Dispatch<
    React.SetStateAction<CustomNodeType | undefined>
  >;
  tiptapGraphFilterOption: {
    mode: "non-filtered" | "focused" | "filtered";
    entities: string[];
  };
  graphDocumentForDisplay: GraphDocumentForFrontend;
  isGraphEditor: boolean;
  isGraphSelectionMode: boolean;
  selectedNodeIdsForAI: string[];
  completionWithSubgraphRef: React.MutableRefObject<
    ((subgraph: GraphDocumentForFrontend) => void) | null
  >;
  isDirectedLinks: boolean;
  setIsDirectedLinks: React.Dispatch<React.SetStateAction<boolean>>;
  magnifierMode: number;
  setMagnifierMode: React.Dispatch<React.SetStateAction<number>>;
  isRightPanelOpen: boolean;
  isLargeGraph: boolean;
  onGraphUpdate?: (additionalGraph: GraphDocumentForFrontend) => void;
  onNodeContextMenu?: (node: CustomNodeType) => void;
  onLinkContextMenu?: (link: CustomLinkType) => void;
  onNodeSelectionToggle?: (node: CustomNodeType) => void;
  selectedGraphData?: GraphDocumentForFrontend;
  toolComponent?: React.ReactNode;
  layoutOrientation?: "vertical" | "horizontal";
  isEditMode?: boolean;
}

export const GraphViewContainer = ({
  topicSpace,
  graphDocument,
  activeEntity,
  layoutInstruction,
  filteredGraphData,
  storyFilteredGraph = null,
  isStorytellingMode = false,
  isMetaGraphMode,
  metaGraphData,
  metaGraphSummaries,
  narrativeFlow,
  focusedCommunityId,
  graphSize,
  svgRef,
  currentScale,
  setCurrentScale,
  setFocusedNode,
  tiptapGraphFilterOption,
  graphDocumentForDisplay,
  isGraphEditor,
  isGraphSelectionMode,
  selectedNodeIdsForAI,
  completionWithSubgraphRef,
  isDirectedLinks,
  setIsDirectedLinks,
  magnifierMode,
  setMagnifierMode,
  isRightPanelOpen,
  isLargeGraph,
  onGraphUpdate,
  onNodeContextMenu,
  onLinkContextMenu,
  onNodeSelectionToggle,
  selectedGraphData,
  toolComponent,
  layoutOrientation = "vertical",
  isEditMode = false,
}: GraphViewContainerProps) => {
  if (!graphDocument) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p>グラフデータが見つかりません</p>
      </div>
    );
  }

  if (activeEntity) {
    return (
      <RelatedNodesAndLinksViewer
        node={activeEntity}
        contextId={topicSpace?.id ?? ""}
        contextType="topicSpace"
        className="h-full w-full"
        height={graphSize.height}
        width={graphSize.width}
        setFocusedNode={setFocusedNode}
        focusedNode={activeEntity}
        onClose={() => setFocusedNode(undefined)}
      />
    );
  }

  if (layoutInstruction ?? isMetaGraphMode) {
    return (
      <GenerativeLayoutGraph
        width={graphSize.width}
        height={graphSize.height}
        graphDocument={graphDocument}
        // Metaモードのときのメタグラフ表示用グラフ
        // - コミュニティ（MetaNode）は常に metaGraphData.metaGraph を使う
        // - Copilot など他用途の filteredGraphData は非Metaモード用に温存
        filteredGraphDocument={
          isMetaGraphMode && metaGraphData
            ? metaGraphData.metaGraph
            : (filteredGraphData ?? undefined)
        }
        layoutInstruction={layoutInstruction}
        onNodeClick={(node) => setFocusedNode(node)}
        viewMode={isMetaGraphMode ? "meta" : "detailed"}
        metaNodeData={metaGraphSummaries.map((s) => {
          // narrativeFlowからorderを取得（ストーリーに選ばれていないコミュニティはorderがundefined）
          const narrativeFlowItem = narrativeFlow?.find(
            (f) => f.communityId === s.communityId,
          );
          return {
            communityId: s.communityId,
            title: s.title,
            summary: s.summary,
            order: narrativeFlowItem?.order,
          };
        })}
        focusedCommunityId={focusedCommunityId}
        communityMap={isMetaGraphMode ? metaGraphData?.communityMap : undefined}
        // 詳細グラフ（ノードレベル）のレイアウト計算用グラフ
        // - ストーリーモードでフィルタが適用されていれば storyFilteredGraph
        // - それ以外のMetaモードでは元の graphDocument
        originalGraphDocument={
          isMetaGraphMode
            ? (storyFilteredGraph ?? graphDocument)
            : undefined
        }
        layoutOrientation={layoutOrientation}
        isEditMode={isEditMode}
      />
    );
  }

  return (
    <D3ForceGraph
      key={`graph-${isRightPanelOpen}-${graphSize.width}-${graphSize.height}`}
      svgRef={svgRef}
      width={graphSize.width}
      height={graphSize.height}
      graphDocument={graphDocumentForDisplay}
      isLinkFiltered={false}
      currentScale={currentScale}
      setCurrentScale={setCurrentScale}
      setFocusedNode={setFocusedNode}
      isDirectedLinks={isDirectedLinks}
      focusedNode={activeEntity}
      setFocusedLink={() => {
        // リンクフォーカス機能は現在使用しない
      }}
      selectedGraphData={selectedGraphData}
      toolComponent={toolComponent}
      focusedLink={undefined}
      isLargeGraph={isLargeGraph}
      isEditor={isGraphEditor}
      onGraphUpdate={onGraphUpdate}
      onNodeContextMenu={onNodeContextMenu}
      onLinkContextMenu={onLinkContextMenu}
      magnifierMode={magnifierMode}
      isSelectionMode={isGraphSelectionMode}
      onNodeSelectionToggle={onNodeSelectionToggle}
    />
  );
};
