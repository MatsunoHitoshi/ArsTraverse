"use client";

import React, { useRef, useState } from "react";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import { D3ForceGraph } from "@/app/_components/d3/force/graph";
import type { CustomNodeType, CustomLinkType } from "@/app/const/types";

interface GraphPreviewProps {
  graphData: GraphDocumentForFrontend;
}

export const GraphPreview: React.FC<GraphPreviewProps> = ({ graphData }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [currentScale, setCurrentScale] = useState(1);
  const [focusedNode, setFocusedNode] = useState<CustomNodeType | undefined>();
  const [focusedLink, setFocusedLink] = useState<CustomLinkType | undefined>();

  const width = 600;
  const height = 400;

  if (graphData.nodes.length === 0 && graphData.relationships.length === 0) {
    return (
      <div className="flex h-96 items-center justify-center rounded-lg border border-slate-600 bg-slate-800">
        <div className="text-slate-400">グラフデータがありません</div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-slate-700">
      <D3ForceGraph
        svgRef={svgRef}
        height={height}
        width={width}
        graphDocument={graphData}
        currentScale={currentScale}
        setCurrentScale={setCurrentScale}
        isLargeGraph={false}
        focusedNode={focusedNode}
        setFocusedNode={setFocusedNode}
        focusedLink={focusedLink}
        setFocusedLink={setFocusedLink}
        isDirectedLinks={true}
        graphIdentifier="preview"
      />
    </div>
  );
};
