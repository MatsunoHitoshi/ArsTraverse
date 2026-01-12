import { NodeLinkList } from "@/app/_components/list/node-link-list";
import { useRef, useState } from "react";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import type { CustomNodeType, CustomLinkType } from "@/app/const/types";
import { D3ForceGraph } from "@/app/_components/d3/force/graph";
import { D3SphericalGraph } from "@/app/_components/d3/spherical/spherical-graph";
import { D3MultiLayerGraph } from "@/app/_components/d3/layer/multi-layer-graph";
import { GraphInfoPanel } from "../../d3/force/graph-info-panel";
import { GraphTool } from "../graph-view/graph-tool";
import { useWindowSize } from "@/app/_hooks/use-window-size";
import type { TopicGraphFilterOption } from "@/app/const/types";
import type { TagOption } from "../../input/tags-input";
import { useSession } from "next-auth/react";
import { NodePropertiesDetail } from "../node/node-properties-detail";
import { useSearchParams } from "next/navigation";
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import { Fragment } from "react";

export const MultiDocumentGraphDetailViewer = ({
  graphDocument,
  topicSpaceId,
  isGraphFullScreen,
  setIsGraphFullScreen,
  isClustered,
  selectedPathData,
  selectedGraphData,
  nodeSearchQuery,
  sourceDocuments,
}: {
  graphDocument: GraphDocumentForFrontend;
  topicSpaceId: string;
  isGraphFullScreen?: boolean;
  setIsGraphFullScreen?: React.Dispatch<React.SetStateAction<boolean>>;
  isClustered?: boolean;
  selectedPathData?: GraphDocumentForFrontend;
  selectedGraphData?: GraphDocumentForFrontend;
  nodeSearchQuery: string;
  sourceDocuments?: Array<{
    id: string;
    graph?: { id: string; dataJson: GraphDocumentForFrontend } | null;
  }>;
}) => {
  const [innerWidth, innerHeight] = useWindowSize();
  const { data: session } = useSession();
  const graphAreaWidth =
    (2 * (innerWidth ?? 100)) / (isGraphFullScreen ? 2 : 3) - 22;
  const graphAreaHeight = (innerHeight ?? 300) - (session ? 128 : 80);

  const searchParams = useSearchParams();
  const nodeId = searchParams.get("nodeId");
  const node = graphDocument.nodes.find((n) => String(n.id) === nodeId);
  const isList = searchParams.get("list") === "true";

  const [focusedNode, setFocusedNode] = useState<CustomNodeType>();
  const [focusedLink, setFocusedLink] = useState<CustomLinkType>();
  const [isDirectedLinks, setIsDirectedLinks] = useState(true);
  const [tags, setTags] = useState<TagOption>();
  const nodeLabels = Array.from(
    new Set(graphDocument.nodes.map((n) => n.label)),
  );
  const tagOptions = nodeLabels.map((l, i) => {
    return { label: l, id: String(i), type: "label" };
  }) as TagOption[];
  const [tagFilterOption, setTagFilterOption] =
    useState<TopicGraphFilterOption>();

  const [currentScale, setCurrentScale] = useState<number>(1);
  const [magnifierMode, setMagnifierMode] = useState<number>(0);
  const [graphViewMode, setGraphViewMode] = useState<
    "2d" | "3d" | "multilayer"
  >("2d");
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [layoutMode, setLayoutMode] = useState<"unified" | "layered">(
    "unified",
  );
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
              topicSpaceId={topicSpaceId ?? ""}
              focusedNode={focusedNode}
            />
          </div>
          {nodeId && (
            <div className="w-2/3 overflow-scroll bg-slate-900">
              <NodePropertiesDetail node={node} topicSpaceId={topicSpaceId} />
            </div>
          )}
        </div>
      ) : (
        <TabGroup
          selectedIndex={
            graphViewMode === "2d"
              ? 0
              : graphViewMode === "3d"
                ? 1
                : process.env.NODE_ENV === "development"
                  ? 2
                  : 0
          }
          onChange={(index) => {
            if (process.env.NODE_ENV === "development") {
              setGraphViewMode(
                index === 0 ? "2d" : index === 1 ? "3d" : "multilayer",
              );
            } else {
              setGraphViewMode(index === 0 ? "2d" : "3d");
            }
          }}
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
            {/* <Tab as={Fragment}>
              {({ selected }) => (
                <button
                  className={`flex cursor-pointer flex-row items-center gap-1 rounded-t-sm px-3 py-2 text-sm font-semibold ${
                    selected ? "border-b-2 border-white outline-none" : ""
                  } hover:bg-white/10`}
                >
                  3D球面グラフ
                </button>
              )}
            </Tab> */}
            {process.env.NODE_ENV === "development" && (
              <Tab as={Fragment}>
                {({ selected }) => (
                  <button
                    className={`flex cursor-pointer flex-row items-center gap-1 rounded-t-sm px-3 py-2 text-sm font-semibold ${
                      selected ? "border-b-2 border-white outline-none" : ""
                    } hover:bg-white/10`}
                  >
                    多層グラフ
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
                isGraphFullScreen={isGraphFullScreen}
                isClustered={isClustered}
                selectedPathData={selectedPathData}
                selectedGraphData={selectedGraphData}
                nodeSearchQuery={nodeSearchQuery}
                isDirectedLinks={isDirectedLinks}
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
                      graphDocument={graphDocument}
                      topicSpaceId={topicSpaceId}
                      // maxHeight={height}
                      setFocusNode={setFocusedNode}
                    />
                  </>
                }
              />
            </TabPanel>
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
                isGraphFullScreen={isGraphFullScreen}
                isClustered={isClustered}
                selectedPathData={selectedPathData}
                selectedGraphData={selectedGraphData}
                nodeSearchQuery={nodeSearchQuery}
                tagFilterOption={tagFilterOption}
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
                topicSpaceId={topicSpaceId}
                setFocusNode={setFocusedNode}
              />
            </TabPanel>
            {process.env.NODE_ENV === "development" && (
              <TabPanel>
                <div
                  className="relative"
                  style={{ width: graphAreaWidth, height: graphAreaHeight }}
                >
                  <div className="absolute left-2 top-2 z-10 flex flex-row gap-2">
                    <button
                      onClick={() => setShowLabels(!showLabels)}
                      className={`rounded-lg p-2 backdrop-blur-sm ${
                        showLabels ? "bg-orange-500/40" : "bg-black/20"
                      }`}
                      title={showLabels ? "ラベルを非表示" : "ラベルを表示"}
                    >
                      <svg
                        width={16}
                        height={16}
                        viewBox="0 0 15 15"
                        fill={showLabels ? "orange" : "white"}
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M7.5 11C4.80285 11 2.52952 9.62184 1.09622 7.50001C2.52952 5.37816 4.80285 4 7.5 4C10.1971 4 12.4705 5.37816 13.9038 7.50001C12.4705 9.62183 10.1971 11 7.5 11ZM7.5 3C4.30786 3 1.65639 4.70638 0.0760002 7.23501C-0.0253338 7.39715 -0.0253334 7.60288 0.0760014 7.76501C1.65639 10.2936 4.30786 12 7.5 12C10.6921 12 13.3436 10.2936 14.924 7.76501C15.0253 7.60288 15.0253 7.39715 14.924 7.23501C13.3436 4.70638 10.6921 3 7.5 3ZM7.5 9.5C8.60457 9.5 9.5 8.60457 9.5 7.5C9.5 6.39543 8.60457 5.5 7.5 5.5C6.39543 5.5 5.5 6.39543 5.5 7.5C5.5 8.60457 6.39543 9.5 7.5 9.5Z"
                          fillRule="evenodd"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={() =>
                        setLayoutMode(
                          layoutMode === "unified" ? "layered" : "unified",
                        )
                      }
                      className={`rounded-lg px-3 py-2 text-xs backdrop-blur-sm ${
                        layoutMode === "layered"
                          ? "bg-blue-500/40 text-white"
                          : "bg-black/20 text-white"
                      }`}
                      title={
                        layoutMode === "unified"
                          ? "層ごとに独立したレイアウトに切り替え"
                          : "統一レイアウトに切り替え"
                      }
                    >
                      {layoutMode === "unified" ? "統一" : "層別"}
                    </button>
                  </div>
                  <D3MultiLayerGraph
                    width={graphAreaWidth}
                    height={graphAreaHeight}
                    graphDocument={graphDocument}
                    currentScale={currentScale}
                    focusedNode={focusedNode}
                    setFocusedNode={setFocusedNode}
                    focusedLink={focusedLink}
                    setFocusedLink={setFocusedLink}
                    isGraphFullScreen={isGraphFullScreen}
                    isClustered={isClustered}
                    selectedPathData={selectedPathData}
                    selectedGraphData={selectedGraphData}
                    nodeSearchQuery={nodeSearchQuery}
                    tagFilterOption={tagFilterOption}
                    showLabels={showLabels}
                    setShowLabels={setShowLabels}
                    sourceDocuments={sourceDocuments?.map((doc) => ({
                      id: doc.id,
                      graph: doc.graph
                        ? {
                            id: (doc.graph as { id?: string }).id ?? doc.id,
                            dataJson: doc.graph.dataJson,
                          }
                        : null,
                    }))}
                    layoutMode={layoutMode}
                    onNodeContextMenu={(_node) => {
                      // 必要に応じてコンテキストメニューの処理を追加
                    }}
                    onLinkContextMenu={(_link) => {
                      // 必要に応じてコンテキストメニューの処理を追加
                    }}
                  />
                </div>
                <GraphInfoPanel
                  focusedNode={focusedNode}
                  focusedLink={focusedLink}
                  graphDocument={graphDocument}
                  topicSpaceId={topicSpaceId}
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
