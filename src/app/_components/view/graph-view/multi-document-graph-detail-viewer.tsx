import { NodeLinkList } from "@/app/_components/list/node-link-list";
import { useRef, useState } from "react";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import type { CustomNodeType, CustomLinkType } from "@/app/const/types";
import { D3ForceGraph } from "@/app/_components/d3/force/graph";
import { D3SphericalGraph } from "@/app/_components/d3/spherical/spherical-graph";
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
}: {
  graphDocument: GraphDocumentForFrontend;
  topicSpaceId: string;
  isGraphFullScreen?: boolean;
  setIsGraphFullScreen?: React.Dispatch<React.SetStateAction<boolean>>;
  isClustered?: boolean;
  selectedPathData?: GraphDocumentForFrontend;
  selectedGraphData?: GraphDocumentForFrontend;
  nodeSearchQuery: string;
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
          </TabPanels>
        </TabGroup>
      )}
    </>
  );
};
