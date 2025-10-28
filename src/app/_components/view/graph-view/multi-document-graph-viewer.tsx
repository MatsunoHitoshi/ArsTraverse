import { NodeLinkList } from "@/app/_components/list/node-link-list";
import { useRef, useState } from "react";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import type { CustomNodeType, CustomLinkType } from "@/app/const/types";
import { D3ForceGraph } from "@/app/_components/d3/force/graph";
import { GraphInfoPanel } from "@/app/_components/d3/force/graph-info-panel";
import { GraphTool } from "./graph-tool";
import { useWindowSize } from "@/app/_hooks/use-window-size";
import { NodePropertiesDetail } from "../node/node-properties-detail";
import { useSearchParams } from "next/navigation";

// 編集は扱わない
export const MultiDocumentGraphViewer = ({
  graphDocument,
  topicSpaceId,
  refetch,
}: {
  graphDocument: GraphDocumentForFrontend;
  topicSpaceId: string;
  refetch: () => void;
}) => {
  const [innerWidth, innerHeight] = useWindowSize();
  const graphAreaWidth = (innerWidth ?? 100) / 2 - 24;
  const graphAreaHeight = (innerHeight ?? 300) - 128;

  const searchParams = useSearchParams();
  const nodeId = searchParams.get("nodeId");
  const node = graphDocument.nodes.find((n) => String(n.id) === nodeId);

  const [isListOpen, setIsListOpen] = useState(false);
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
              refetch={refetch}
              focusedNode={focusedNode}
            />
          </div>
          {nodeId && (
            <div className="w-2/3 overflow-scroll bg-slate-900">
              <NodePropertiesDetail
                node={node}
                topicSpaceId={topicSpaceId}
                refetch={refetch}
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
          isDirectedLinks={isDirectedLinks}
          magnifierMode={magnifierMode}
          toolComponent={
            <>
              <GraphTool
                svgRef={svgRef}
                currentScale={currentScale}
                setIsListOpen={setIsListOpen}
                isListOpen={isListOpen}
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
