import type { CustomNodeType, CustomLinkType } from "@/app/const/types";
import { D3ForceGraph } from "../../d3/force/graph";
import { api } from "@/trpc/react";
import { useEffect, useRef, useState } from "react";
import { ContainerSizeProvider } from "@/providers/container-size";
import { ChevronLeftIcon } from "../../icons";
import { Button } from "../../button/button";

export const RelatedNodesAndLinksViewer = ({
  node,
  contextId,
  contextType,
  className,
  height,
  width,
  setFocusedNode,
  focusedNode,
  onClose,
}: {
  node: CustomNodeType;
  contextId: string;
  contextType: "topicSpace" | "document";
  className?: string;
  height?: number;
  width?: number;
  setFocusedNode: React.Dispatch<
    React.SetStateAction<CustomNodeType | undefined>
  >;
  focusedNode: CustomNodeType | undefined;
  onClose?: () => void;
}) => {
  const { data: relatedNodesAndLinks } = api.kg.getRelatedNodes.useQuery({
    nodeId: node.id,
    contextId: contextId,
    contextType: contextType,
  });
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(width ?? 400);
  const [containerHeight, setContainerHeight] = useState<number>(height ?? 400);
  const [currentScale, setCurrentScale] = useState<number>(1);
  // const [focusedNode, setFocusedNode] = useState<CustomNodeType | undefined>(
  //   undefined,
  // );
  const [focusedLink, setFocusedLink] = useState<CustomLinkType | undefined>(
    undefined,
  );

  useEffect(() => {
    setCurrentScale(1);
    setFocusedNode(node);
    setFocusedLink(undefined);
  }, [node]);

  if (!relatedNodesAndLinks) {
    return <div className="mt-6">Loading...</div>;
  }

  return (
    <ContainerSizeProvider
      containerRef={containerRef}
      setContainerWidth={setContainerWidth}
      setContainerHeight={setContainerHeight}
      className={className}
    >
      <D3ForceGraph
        graphDocument={relatedNodesAndLinks}
        svgRef={svgRef}
        height={containerHeight - 2}
        width={containerWidth - 2}
        currentScale={currentScale}
        setCurrentScale={setCurrentScale}
        isLargeGraph={false}
        focusedNode={focusedNode}
        setFocusedNode={setFocusedNode}
        focusedLink={focusedLink}
        setFocusedLink={setFocusedLink}
        toolComponent={
          onClose && (
            <div
              className={`absolute !w-[${containerWidth}px] rounded-lg bg-slate-950/20 p-2 backdrop-blur-sm`}
            >
              <Button
                className="z-10 !h-8 !w-8 bg-transparent !p-2 text-sm hover:bg-slate-50/10"
                onClick={() => {
                  setFocusedNode(undefined);
                  onClose();
                }}
              >
                <ChevronLeftIcon width={16} height={16} color="white" />
              </Button>
            </div>
          )
        }
      />
    </ContainerSizeProvider>
  );
};
