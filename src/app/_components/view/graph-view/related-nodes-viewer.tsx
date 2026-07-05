"use client";
import type { CustomNodeType, CustomLinkType } from "@/app/const/types";
import { D3ForceGraph } from "../../d3/force/graph";
import { api } from "@/trpc/react";
import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import { ContainerSizeProvider } from "@/providers/container-size";
import { ChevronLeftIcon } from "../../icons";
import { Button } from "../../button/button";

const SIZE_SETTLE_MS = 80;

export const RelatedNodesAndLinksViewer = ({
  node,
  contextId,
  contextType,
  className,
  height,
  width,
  onSelectNode,
  onClose,
}: {
  node: CustomNodeType;
  contextId: string;
  contextType: "topicSpace" | "document";
  className?: string;
  height?: number;
  width?: number;
  /** 近傍グラフ上の別ノードが選択されたとき（現在の node 以外） */
  onSelectNode?: (node: CustomNodeType) => void;
  onClose?: () => void;
}) => {
  const { data: relatedNodesAndLinks } = api.kg.getRelatedNodes.useQuery({
    nodeId: node.id,
    contextId: contextId,
    contextType: contextType,
  });
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(width ?? 0);
  const [containerHeight, setContainerHeight] = useState<number>(height ?? 0);
  const [stableSize, setStableSize] = useState<{ width: number; height: number }>(
    { width: width ?? 0, height: height ?? 0 },
  );
  const [currentScale, setCurrentScale] = useState<number>(1);
  const [focusedLink, setFocusedLink] = useState<CustomLinkType | undefined>(
    undefined,
  );
  const hasSettledSizeRef = useRef(false);

  const handleGraphNodeSelect = useCallback(
    (selected: SetStateAction<CustomNodeType | undefined>) => {
      const resolved =
        typeof selected === "function" ? selected(node) : selected;
      if (!resolved || resolved.id === node.id) return;
      onSelectNode?.(resolved);
    },
    [node, onSelectNode],
  );

  useEffect(() => {
    setCurrentScale(1);
    setFocusedLink(undefined);
  }, [node.id]);

  useEffect(() => {
    const measuredWidth = width ?? containerWidth;
    const measuredHeight = height ?? containerHeight;
    if (measuredWidth <= 0 || measuredHeight <= 0) return;

    if (!hasSettledSizeRef.current) {
      const timer = window.setTimeout(() => {
        setStableSize({ width: measuredWidth, height: measuredHeight });
        hasSettledSizeRef.current = true;
      }, SIZE_SETTLE_MS);
      return () => window.clearTimeout(timer);
    }

    setStableSize({ width: measuredWidth, height: measuredHeight });
  }, [width, height, containerWidth, containerHeight]);

  const graphWidth = stableSize.width - 2;
  const graphHeight = stableSize.height - 2;
  const isContainerReady = graphWidth > 0 && graphHeight > 0;

  if (!relatedNodesAndLinks) {
    return <div className="mt-6">Loading...</div>;
  }

  return (
    <ContainerSizeProvider
      containerRef={containerRef}
      setContainerWidth={setContainerWidth}
      setContainerHeight={setContainerHeight}
      className={`${className ?? ""} aspect-[5/2] w-full min-h-[280px]`}
    >
      {isContainerReady ? (
        <D3ForceGraph
          graphDocument={relatedNodesAndLinks}
          svgRef={svgRef}
          height={graphHeight}
          width={graphWidth}
          currentScale={currentScale}
          setCurrentScale={setCurrentScale}
          isLargeGraph={false}
          enableLiveSimulation={true}
          focusedNode={node}
          setFocusedNode={handleGraphNodeSelect}
          focusedLink={focusedLink}
          setFocusedLink={setFocusedLink}
          toolComponent={
            onClose && (
              <div className="absolute rounded-lg bg-slate-950/20 p-2 backdrop-blur-sm">
                <Button
                  className="z-10 !h-8 !w-8 bg-transparent !p-2 text-sm hover:bg-slate-50/10"
                  onClick={onClose}
                >
                  <ChevronLeftIcon width={16} height={16} color="white" />
                </Button>
              </div>
            )
          }
        />
      ) : (
        <div className="h-full min-h-[280px] w-full" aria-hidden />
      )}
    </ContainerSizeProvider>
  );
};
