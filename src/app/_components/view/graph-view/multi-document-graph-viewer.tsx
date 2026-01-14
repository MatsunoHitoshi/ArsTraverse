import { NodeLinkList } from "@/app/_components/list/node-link-list";
import { useRef, useState } from "react";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import type { CustomNodeType, CustomLinkType } from "@/app/const/types";
import { D3ForceGraph } from "@/app/_components/d3/force/graph";
import { D3SphericalGraph } from "@/app/_components/d3/spherical/spherical-graph";
import { GraphInfoPanel } from "@/app/_components/d3/force/graph-info-panel";
import { GraphTool } from "./graph-tool";
import { useWindowSize } from "@/app/_hooks/use-window-size";
import { NodePropertiesDetail } from "../node/node-properties-detail";
import { useSearchParams } from "next/navigation";
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import { Fragment } from "react";

// 編集は扱わない
export const MultiDocumentGraphViewer = ({
  graphDocument,
  contextId,
  contextType,
  refetch,
  highlightData,
}: {
  graphDocument: GraphDocumentForFrontend;
  contextId: string;
  contextType: "topicSpace" | "document";
  refetch: () => void;
  highlightData?: {
    addedNodeIds: Set<string>;
    removedNodeIds: Set<string>;
    addedLinkIds: Set<string>;
    removedLinkIds: Set<string>;
  };
}) => {
  const [innerWidth, innerHeight] = useWindowSize();
  const graphAreaWidth = (innerWidth ?? 100) / 2 - 24;
  const graphAreaHeight = (innerHeight ?? 300) - 128;

  const searchParams = useSearchParams();
  const nodeId = searchParams.get("nodeId");
  const node = graphDocument.nodes.find((n) => String(n.id) === nodeId);
  const isList = searchParams.get("list") === "true";

  const [focusedNode, setFocusedNode] = useState<CustomNodeType>();
  const [focusedLink, setFocusedLink] = useState<CustomLinkType>();
  const [isDirectedLinks, setIsDirectedLinks] = useState(true);
  const [magnifierMode, setMagnifierMode] = useState(0);
  //   const [tags, setTags] = useState<TagOption>();
  //   const nodeLabels = Array.from(
  //     new Set(graphDocument.nodes.map((n) => n.label)),
  //   );
  //   const tagOptions = nodeLabels.map((l, i) => {
  //     return { label: l, id: String(i), type: "label" };
  //   }) as TagOption[];
  //    const [tagFilter, setTagFilter] = useState<boolean>(false);
  //    const [tagFilterOption, setTagFilterOption] =
  //      useState<TopicGraphFilterOption>();

  const [currentScale, setCurrentScale] = useState<number>(1);
  const [graphViewMode, setGraphViewMode] = useState<"2d" | "3d">("2d");
  const svgRef = useRef<SVGSVGElement>(null);

  const isLargeGraph = graphDocument.nodes.length > 1300;

  return (
    <>
      {isList ? (
        <div className="flex h-full w-full flex-row gap-1 bg-white/20">
          <div
            className={`overflow-scroll bg-slate-900 ${nodeId ? "w-1/3" : "w-full"}`}
          >
            <NodeLinkList
              graphDocument={graphDocument}
              contextId={contextId ?? ""}
              contextType={contextType}
              refetch={refetch}
              focusedNode={focusedNode}
            />
          </div>
          {nodeId && (
            <div className="w-2/3 overflow-scroll bg-slate-900">
              <NodePropertiesDetail
                node={node}
                contextId={contextId}
                contextType={contextType}
                refetch={refetch}
              />
            </div>
          )}
        </div>
      ) : (
        <TabGroup
          selectedIndex={graphViewMode === "2d" ? 0 : 1}
          onChange={(index) => setGraphViewMode(index === 0 ? "2d" : "3d")}
        >
          <TabList className="flex flex-row items-center gap-2 border-b border-slate-600 bg-slate-900 text-sm">
            <Tab as={Fragment}>
              {({ selected }) => (
                <button
                  className={`flex cursor-pointer flex-row items-center gap-1 rounded-t-sm px-3 py-2 text-sm font-semibold ${
                    selected ? "border-b-2 border-white outline-none" : ""
                  } hover:bg-white/10`}
                >
                  2Dグラフ
                </button>
              )}
            </Tab>
            {process.env.NODE_ENV === "development" && (
              <Tab as={Fragment}>
                {({ selected }) => (
                  <button
                    className={`flex cursor-pointer flex-row items-center gap-1 rounded-t-sm px-3 py-2 text-sm font-semibold ${
                      selected ? "border-b-2 border-white outline-none" : ""
                    } hover:bg-white/10`}
                  >
                    3D球面グラフ
                  </button>
                )}
              </Tab>
            )}
          </TabList>
          <TabPanels>
            <TabPanel>
              <D3ForceGraph
                svgRef={svgRef}
                width={graphAreaWidth}
                height={graphAreaHeight}
                isLargeGraph={isLargeGraph}
                graphDocument={graphDocument}
                currentScale={currentScale}
                setCurrentScale={setCurrentScale}
                focusedNode={focusedNode}
                setFocusedNode={setFocusedNode}
                focusedLink={focusedLink}
                setFocusedLink={setFocusedLink}
                isDirectedLinks={isDirectedLinks}
                magnifierMode={magnifierMode}
                highlightData={highlightData}
                toolComponent={
                  <>
                    <GraphTool
                      svgRef={svgRef}
                      currentScale={currentScale}
                      isLargeGraph={isLargeGraph}
                      isDirectedLinks={isDirectedLinks}
                      setIsDirectedLinks={setIsDirectedLinks}
                      magnifierMode={magnifierMode}
                      setMagnifierMode={setMagnifierMode}
                    />
                    <GraphInfoPanel
                      focusedNode={focusedNode}
                      focusedLink={focusedLink}
                      graphDocument={graphDocument}
                      contextId={contextId}
                      contextType={contextType}
                      // maxHeight={height}
                      setFocusNode={setFocusedNode}
                    />
                  </>
                }
              />
            </TabPanel>
            {process.env.NODE_ENV === "development" && (
              <TabPanel>
                <D3SphericalGraph
                  width={graphAreaWidth}
                  height={graphAreaHeight}
                  graphDocument={graphDocument}
                  currentScale={currentScale}
                  focusedNode={focusedNode}
                  setFocusedNode={setFocusedNode}
                  focusedLink={focusedLink}
                  setFocusedLink={setFocusedLink}
                  isGraphFullScreen={false}
                  isClustered={false}
                  nodeSearchQuery=""
                  onNodeContextMenu={(_node) => {
                    // 必要に応じてコンテキストメニューの処理を追加
                  }}
                  onLinkContextMenu={(_link) => {
                    // 必要に応じてコンテキストメニューの処理を追加
                  }}
                />
                <GraphInfoPanel
                  focusedNode={focusedNode}
                  focusedLink={focusedLink}
                  graphDocument={graphDocument}
                  contextId={contextId}
                  contextType={contextType}
                  setFocusNode={setFocusedNode}
                />
              </TabPanel>
            )}
          </TabPanels>
        </TabGroup>
      )}
    </>
  );
};
