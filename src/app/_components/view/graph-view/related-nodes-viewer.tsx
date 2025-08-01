import type { CustomNodeType, CustomLinkType } from "@/app/const/types";
import { D3ForceGraph } from "../../d3/force/graph";
import { api } from "@/trpc/react";
import { useEffect, useRef, useState } from "react";
import { ContainerSizeProvider } from "@/providers/container-size";

export const RelatedNodesAndLinksViewer = ({
  node,
  topicSpaceId,
}: {
  node: CustomNodeType;
  topicSpaceId: string;
}) => {
  const { data: relatedNodesAndLinks } = api.kg.getRelatedNodes.useQuery({
    nodeId: node.id,
    topicSpaceId: topicSpaceId,
  });
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(400);
  const [currentScale, setCurrentScale] = useState<number>(1);
  const [focusedNode, setFocusedNode] = useState<CustomNodeType | undefined>(
    undefined,
  );
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
      className="flex flex-col gap-1 rounded-md border border-gray-600"
    >
      <D3ForceGraph
        graphDocument={relatedNodesAndLinks}
        svgRef={svgRef}
        height={500}
        width={containerWidth - 2}
        currentScale={currentScale}
        setCurrentScale={setCurrentScale}
        isLargeGraph={false}
        focusedNode={focusedNode}
        setFocusedNode={setFocusedNode}
        focusedLink={focusedLink}
        setFocusedLink={setFocusedLink}
        toolComponent={<></>}
      />
    </ContainerSizeProvider>
  );
};
