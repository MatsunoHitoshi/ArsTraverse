import { NodeLinkList } from "@/app/_components/list/node-link-list";
import { useRef, useState } from "react";
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
import { createQueryUtilsProxy } from "@trpc/react-query/shared";

export const MultiDocumentGraphEditor = ({
  graphDocument,
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
  graphDocument: GraphDocumentForFrontend;
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
  const [innerWidth, innerHeight] = useWindowSize();
  const graphAreaWidth =
    (2 * (innerWidth ?? 100)) / (isGraphFullScreen ? 2 : 3) - 22;
  const graphAreaHeight = (innerHeight ?? 300) - 128;

  const searchParams = useSearchParams();
  const isList = searchParams.get("list") === "true";
  const nodeId = searchParams.get("nodeId");
  const node = graphDocument.nodes.find((n) => String(n.id) === nodeId);

  const [isListOpen, setIsListOpen] = useState(isList);
  const [focusedNode, setFocusedNode] = useState<CustomNodeType>();
  const [focusedLink, setFocusedLink] = useState<CustomLinkType>();
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
  const svgRef = useRef<SVGSVGElement>(null);

  const isLargeGraph = graphDocument.nodes.length > 1300;

  return (
    <>
      {isListOpen ? (
        <div className="flex h-full w-full flex-row gap-1 bg-white/20">
          <div
            className={`overflow-scroll bg-slate-900 ${nodeId ? "w-1/3" : "w-full"}`}
          >
            <NodeLinkList
              graphDocument={graphDocument}
              setIsListOpen={setIsListOpen}
              isListOpen={isListOpen}
              topicSpaceId={topicSpaceId ?? ""}
              isEditor={true}
              focusedNode={focusedNode}
              refetch={refetch}
              isClustered={isClustered}
            />
          </div>
          {nodeId && (
            <div className="w-2/3 overflow-scroll bg-slate-900">
              <NodePropertiesDetail
                node={node}
                topicSpaceId={topicSpaceId}
                refetch={refetch}
                enableEdit={true}
              />
            </div>
          )}
        </div>
      ) : (
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
          isEditor={true}
          selectedPathData={selectedPathData}
          selectedGraphData={selectedGraphData}
          isLinkFiltered={isLinkFiltered}
          nodeSearchQuery={nodeSearchQuery}
          toolComponent={
            <>
              <GraphTool
                svgRef={svgRef}
                currentScale={currentScale}
                setIsListOpen={setIsListOpen}
                isListOpen={isListOpen}
                isLargeGraph={isLargeGraph}
                hasTagFilter={true}
                tags={tags}
                setTags={setTags}
                tagOptions={tagOptions}
                tagFilterOption={tagFilterOption}
                isGraphFullScreen={isGraphFullScreen}
                setIsGraphFullScreen={setIsGraphFullScreen}
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
      )}
    </>
  );
};
