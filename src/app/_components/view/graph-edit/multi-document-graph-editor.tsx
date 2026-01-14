import { NodeLinkList } from "@/app/_components/list/node-link-list";
import { useEffect, useRef, useState } from "react";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import type { CustomNodeType, CustomLinkType } from "@/app/const/types";
import { D3ForceGraph } from "@/app/_components/d3/force/graph";
import { GraphInfoPanel } from "../../d3/force/graph-info-panel";
import { GraphTool } from "../graph-view/graph-tool";
import { useWindowSize } from "@/app/_hooks/use-window-size";
import type { TopicGraphFilterOption } from "@/app/const/types";
import type { TagOption } from "../../input/tags-input";
import { useSearchParams } from "next/navigation";
import { NodePropertiesDetail } from "../node/node-properties-detail";
import {
  LinkPropertyEditModal,
  NodePropertyEditModal,
} from "../../modal/node-link-property-edit-modal";
import { NodeLinkEditModal } from "../../modal/node-link-edit-modal";
import { api } from "@/trpc/react";
import { useGraphEditor } from "@/app/_hooks/use-graph-editor";
import { Button } from "../../button/button";
import { Switch } from "@headlessui/react";

export const MultiDocumentGraphEditor = ({
  defaultGraphDocument,
  graphDocument,
  setGraphDocument,
  topicSpaceId,
  refetch,
  isGraphFullScreen,
  setIsGraphFullScreen,
  isClustered,
  selectedPathData,
  selectedGraphData,
  isLinkFiltered,
  nodeSearchQuery,
}: {
  defaultGraphDocument: GraphDocumentForFrontend;
  graphDocument: GraphDocumentForFrontend;
  setGraphDocument: React.Dispatch<
    React.SetStateAction<GraphDocumentForFrontend | null>
  >;
  topicSpaceId: string;
  refetch: () => void;
  isGraphFullScreen: boolean;
  setIsGraphFullScreen: React.Dispatch<React.SetStateAction<boolean>>;
  isClustered: boolean;
  selectedPathData?: GraphDocumentForFrontend;
  selectedGraphData?: GraphDocumentForFrontend;
  isLinkFiltered: boolean;
  nodeSearchQuery: string;
}) => {
  const updateGraph = api.topicSpaces.updateGraph.useMutation();

  // カスタムフックを使用
  const {
    graphDocument: localGraphDocument,
    setGraphDocument: setLocalGraphDocument,
    isEditor,
    setIsEditor,
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
    defaultGraphDocument: graphDocument,
    onUpdateSuccess: () => {
      void refetch();
    },
    onUpdateError: (error) => {
      console.error("グラフの更新に失敗しました", error);
    },
  });

  // 親コンポーネントの状態を同期（更新時のみ）
  useEffect(() => {
    if (localGraphDocument && isGraphUpdated) {
      setGraphDocument(localGraphDocument);
    }
  }, [localGraphDocument, setGraphDocument, isGraphUpdated]);

  const [innerWidth, innerHeight] = useWindowSize();
  const graphAreaWidth =
    (2 * (innerWidth ?? 100)) / (isGraphFullScreen ? 2 : 3) - 22;
  const graphAreaHeight = (innerHeight ?? 300) - 128;
  const [isDirectedLinks, setIsDirectedLinks] = useState(true);

  const searchParams = useSearchParams();
  const isList = searchParams.get("list") === "true";
  const nodeId = searchParams.get("nodeId");
  const node = localGraphDocument?.nodes.find((n) => String(n.id) === nodeId);

  const [tags, setTags] = useState<TagOption>();
  const nodeLabels = Array.from(
    new Set(localGraphDocument?.nodes.map((n) => n.label) ?? []),
  );
  const tagOptions = nodeLabels.map((l, i) => {
    return { label: l, id: String(i), type: "label" };
  }) as TagOption[];
  const [tagFilterOption] = useState<TopicGraphFilterOption>();

  const [currentScale, setCurrentScale] = useState<number>(1);
  const svgRef = useRef<SVGSVGElement>(null);
  const [magnifierMode, setMagnifierMode] = useState(0);

  const isLargeGraph = (localGraphDocument?.nodes.length ?? 0) > 1300;

  const onRecordUpdate = () => {
    if (!localGraphDocument) return;
    updateGraph.mutate(
      {
        id: topicSpaceId,
        dataJson: localGraphDocument,
      },
      {
        onSuccess: (res) => {
          void refetch();
          resetGraphUpdated();
          setIsEditor(false);
        },
        onError: () => {
          console.error("グラフの更新に失敗しました");
        },
      },
    );
  };

  return (
    <>
      {isList ? (
        <div className="flex h-full w-full flex-row gap-1 bg-white/20">
          <div
            className={`overflow-scroll bg-slate-900 ${nodeId ? "w-1/3" : "w-full"}`}
          >
            {localGraphDocument && (
              <NodeLinkList
                graphDocument={localGraphDocument}
                contextId={topicSpaceId ?? ""}
                contextType="topicSpace"
                isEditor={true}
                focusedNode={focusedNode}
                refetch={refetch}
                isClustered={isClustered}
              />
            )}
          </div>
          {nodeId && (
            <div className="w-2/3 overflow-scroll bg-slate-900">
              <NodePropertiesDetail
                node={node}
                contextId={topicSpaceId}
                contextType="topicSpace"
                refetch={refetch}
                enableEdit={true}
              />
            </div>
          )}
        </div>
      ) : (
        <>
          {localGraphDocument && (
            <>
              <D3ForceGraph
                svgRef={svgRef}
                width={graphAreaWidth}
                height={graphAreaHeight}
                isLargeGraph={isLargeGraph}
                graphDocument={localGraphDocument}
                currentScale={currentScale}
                setCurrentScale={setCurrentScale}
                focusedNode={focusedNode}
                setFocusedNode={setFocusedNode}
                focusedLink={focusedLink}
                setFocusedLink={setFocusedLink}
                isGraphFullScreen={isGraphFullScreen}
                isClustered={isClustered}
                isEditor={isEditor}
                selectedPathData={selectedPathData}
                selectedGraphData={selectedGraphData}
                isLinkFiltered={isLinkFiltered}
                nodeSearchQuery={nodeSearchQuery}
                isDirectedLinks={isDirectedLinks}
                onGraphUpdate={isEditor ? onGraphUpdate : undefined}
                onNodeContextMenu={isEditor ? onNodeContextMenu : undefined}
                onLinkContextMenu={isEditor ? onLinkContextMenu : undefined}
                magnifierMode={magnifierMode}
                toolComponent={
                  <>
                    <GraphTool
                      svgRef={svgRef}
                      currentScale={currentScale}
                      isLargeGraph={isLargeGraph}
                      hasTagFilter={true}
                      tags={tags}
                      setTags={setTags}
                      tagOptions={tagOptions}
                      tagFilterOption={tagFilterOption}
                      isGraphFullScreen={isGraphFullScreen}
                      setIsGraphFullScreen={setIsGraphFullScreen}
                      isDirectedLinks={isDirectedLinks}
                      setIsDirectedLinks={setIsDirectedLinks}
                      magnifierMode={magnifierMode}
                      setMagnifierMode={setMagnifierMode}
                    />

                    <GraphInfoPanel
                      focusedNode={focusedNode}
                      focusedLink={focusedLink}
                      graphDocument={localGraphDocument}
                      contextId={topicSpaceId}
                      contextType="topicSpace"
                      // maxHeight={height}
                      setFocusNode={setFocusedNode}
                    />

                    <div className="absolute mt-12 flex flex-col items-start gap-2">
                      <div className="flex flex-row items-center gap-2">
                        <div className="text-sm">編集モード</div>
                        <Switch
                          checked={isEditor}
                          onChange={setIsEditor}
                          className="group inline-flex h-6 w-11 items-center rounded-full bg-slate-400 transition data-[checked]:bg-orange-400 data-[disabled]:bg-slate-700"
                        >
                          <span className="size-4 translate-x-1 rounded-full bg-white transition group-data-[checked]:translate-x-6" />
                        </Switch>
                      </div>
                      {isGraphUpdated && isEditor && (
                        <Button
                          onClick={onRecordUpdate}
                          isLoading={updateGraph.isPending}
                          className="!w-max !p-2 !text-xs"
                        >
                          グラフを更新
                        </Button>
                      )}
                    </div>
                  </>
                }
              />

              {isEditor && (
                <>
                  <NodePropertyEditModal
                    isOpen={isNodePropertyEditModalOpen}
                    setIsOpen={setIsNodePropertyEditModalOpen}
                    graphDocument={localGraphDocument}
                    setGraphDocument={setLocalGraphDocument}
                    graphNode={focusedNode}
                  />
                  <LinkPropertyEditModal
                    isOpen={isLinkPropertyEditModalOpen}
                    setIsOpen={setIsLinkPropertyEditModalOpen}
                    graphDocument={localGraphDocument}
                    setGraphDocument={setLocalGraphDocument}
                    graphLink={focusedLink}
                  />
                  <NodeLinkEditModal
                    isOpen={isNodeLinkAttachModalOpen}
                    setIsOpen={setIsNodeLinkAttachModalOpen}
                    graphDocument={localGraphDocument}
                    setGraphDocument={setLocalGraphDocument}
                    additionalGraph={additionalGraph}
                    setAdditionalGraph={setAdditionalGraph}
                  />
                </>
              )}
            </>
          )}
        </>
      )}
    </>
  );
};
