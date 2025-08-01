import type { GraphDocumentForFrontend } from "@/app/const/types";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceX,
  forceY,
  forceCollide,
} from "d3";
import { useEffect, useMemo, useRef, useState } from "react";
import { D3ZoomProvider } from "../zoom";
import type { TopicGraphFilterOption } from "@/app/const/types";
import {
  dragEditorExtension,
  type DragState,
} from "../extension/drag-editor-extension";

import type { CustomNodeType, CustomLinkType } from "@/app/const/types";
import { getNodeByIdForFrontend } from "@/app/_utils/kg/filter";

// export interface CustomNodeType extends SimulationNodeDatum, NodeType {}
// export interface CustomLinkType
//   extends SimulationLinkDatum<CustomNodeType>,
//     RelationshipType {}

const linkFilter = (nodes: CustomNodeType[], links: CustomLinkType[]) => {
  const filteredNodes = nodes.filter((node) => {
    return links.find((link) => {
      return link.sourceId === node.id || link.targetId === node.id;
    });
  });
  return filteredNodes;
};

const isNodeFiltered = (
  node: CustomNodeType,
  filterOption?: TopicGraphFilterOption,
) => {
  if (!filterOption) return true;
  switch (filterOption.type) {
    case "label":
      return node.label.toLowerCase() === filterOption.value;
    case "tag":
      return node.properties.tag === filterOption.value;
  }
};

// const circlePosition = (index: number, length: number, type: "sin" | "cos") => {
//   const dig = index / length;
//   const radius = 400;
//   const angle = dig * Math.PI * 2;
//   return type === "sin" ? radius * Math.sin(angle) : radius * Math.cos(angle);
// };

export const D3ForceGraph = ({
  svgRef,
  height,
  width,
  graphDocument,
  selectedGraphData,
  selectedPathData,
  toolComponent,
  tagFilterOption: filterOption,
  nodeSearchQuery,
  isLinkFiltered = false,
  isClustered = false,
  isGraphFullScreen = false,
  isEditor = false,
  isLargeGraph,
  currentScale,
  setCurrentScale,
  focusedNode,
  setFocusedNode,
  focusedLink,
  setFocusedLink,
  onLinkContextMenu,
  onNodeContextMenu,
  onGraphUpdate,
  graphIdentifier = "graph",
}: {
  svgRef: React.RefObject<SVGSVGElement>;
  height: number;
  width: number;
  graphDocument: GraphDocumentForFrontend;
  selectedGraphData?: GraphDocumentForFrontend;
  selectedPathData?: GraphDocumentForFrontend;
  toolComponent?: React.ReactNode;
  tagFilterOption?: TopicGraphFilterOption;
  nodeSearchQuery?: string;
  currentScale: number;
  setCurrentScale: React.Dispatch<React.SetStateAction<number>>;
  isLinkFiltered?: boolean;
  isClustered?: boolean;
  isGraphFullScreen?: boolean;
  isEditor?: boolean;
  isLargeGraph: boolean;
  focusedNode: CustomNodeType | undefined;
  setFocusedNode: React.Dispatch<
    React.SetStateAction<CustomNodeType | undefined>
  >;
  focusedLink: CustomLinkType | undefined;
  setFocusedLink: React.Dispatch<
    React.SetStateAction<CustomLinkType | undefined>
  >;
  onNodeContextMenu?: (node: CustomNodeType) => void;
  onLinkContextMenu?: (link: CustomLinkType) => void;
  onGraphUpdate?: (additionalGraph: GraphDocumentForFrontend) => void;
  graphIdentifier?: string;
}) => {
  const { nodes, relationships } = graphDocument;
  const initLinks = relationships as CustomLinkType[];
  const initNodes = isLinkFiltered ? linkFilter(nodes, initLinks) : nodes;

  const newLinks = useMemo(() => {
    return initLinks.map((d) => {
      const source = getNodeByIdForFrontend(
        d.sourceId,
        initNodes,
      ) as CustomNodeType;
      const target = getNodeByIdForFrontend(
        d.targetId,
        initNodes,
      ) as CustomNodeType;
      return {
        ...d,
        source: source,
        target: target,
      };
    });
  }, [initLinks, initNodes]);

  const [currentTransformX, setCurrentTransformX] = useState<number>(0);
  const [currentTransformY, setCurrentTransformY] = useState<number>(0);
  const [graphNodes, setGraphNodes] = useState<CustomNodeType[]>(initNodes);
  const [graphLinks, setGraphLinks] = useState<CustomLinkType[]>(newLinks);
  const tempLineRef = useRef<SVGLineElement>(null);
  const tempCircleRef = useRef<SVGCircleElement>(null);
  const nodeRef = useRef<SVGSVGElement>(null);
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    sourceNode: null,
    targetNode: null,
  });

  const distance = (d: CustomLinkType) => {
    return !!d.properties.distance ? Number(d.properties.distance) : 0;
  };

  useEffect(() => {
    const centerX = (width ?? 10) / 2;
    const centerY = (height ?? 10) / 2;
    const simulation = forceSimulation<CustomNodeType, CustomLinkType>(
      initNodes,
    )
      .force(
        "link",
        forceLink<CustomNodeType, CustomLinkType>(newLinks)
          .id((d) => d.id)
          .distance(
            (d) =>
              20 *
              (distance(d) * distance(d) * distance(d) * distance(d) * 3 || 1),
          )
          .strength((d) => 0.15 / (distance(d) * distance(d) || 1)),
      )
      .force("center", forceCenter(centerX, centerY))
      .force("charge", forceManyBody().strength(-40))
      .force(
        "x",
        forceX().x(function (d) {
          return (
            centerX +
            (isClustered
              ? graphNodes.find((n) => n.index === d.index)?.clustered?.x ?? 0
              : 0)
          );
        }),
      )
      .force(
        "y",
        forceY().y(function (d) {
          return (
            centerY +
            (isClustered
              ? graphNodes.find((n) => n.index === d.index)?.clustered?.y ?? 0
              : 0)
          );
        }),
      )
      .force("collision", forceCollide(1));

    simulation.alpha(0.5);
    simulation.alphaDecay(0.2);

    simulation.on("tick", () => {
      setGraphNodes([
        ...initNodes.map((d) => {
          // const neighborLinkCount = initLinks.filter((link) => {
          //   return link.sourceId === d.id || link.targetId === d.id;
          // }).length;
          const visibleByScaling =
            currentScale > 4
              ? 0
              : currentScale > 3
                ? 0
                : currentScale > 2
                  ? 4
                  : currentScale > 1
                    ? 6
                    : currentScale > 0.9
                      ? 8
                      : 10;
          const nodeVisible =
            isGraphFullScreen ||
            !(isLargeGraph && (d.neighborLinkCount ?? 0) <= visibleByScaling);

          return {
            ...d,
            // neighborLinkCount: neighborLinkCount,
            visible: nodeVisible,
          };
        }),
      ]);
      setGraphLinks([...newLinks]);
    });

    if (isEditor && !!onGraphUpdate && !!dragState) {
      dragEditorExtension({
        tempLineRef,
        tempCircleRef,
        simulation,
        graphDocument,
        dragState,
        setDragState,
        onGraphUpdate,
        graphIdentifier,
      });
    }

    return () => {
      simulation.stop();
    };
  }, [
    graphNodes,
    newLinks,
    initNodes,
    width,
    height,
    initLinks,
    currentScale,
    nodes.length,
    isClustered,
  ]);

  return (
    <div className="flex flex-col">
      <div className={`h-[${String(height)}px] w-[${String(width)}px]`}>
        {toolComponent}
        {nodes.length === 0 && relationships.length === 0 ? (
          <div className="mt-60 flex flex-col items-center">
            <div>グラフデータがありません</div>
          </div>
        ) : (
          <svg
            ref={svgRef}
            width={width}
            height={height}
            viewBox={`0 0 ${String(width)} ${String(height)}`}
          >
            <D3ZoomProvider
              svgRef={svgRef}
              setCurrentScale={setCurrentScale}
              setCurrentTransformX={setCurrentTransformX}
              setCurrentTransformY={setCurrentTransformY}
              currentScale={currentScale}
              currentTransformX={currentTransformX}
              currentTransformY={currentTransformY}
            >
              {graphLinks.map((graphLink) => {
                const { source, target, type } = graphLink;
                const modSource = source as CustomNodeType;
                const modTarget = target as CustomNodeType;
                const isFocused = graphLink.id === focusedLink?.id;
                const isPathLink = selectedPathData?.relationships
                  .map((relationship) => relationship.id)
                  .includes(graphLink.id);

                const sourceNode = getNodeByIdForFrontend(
                  modSource.id,
                  graphNodes,
                );
                const targetNode = getNodeByIdForFrontend(
                  modTarget.id,
                  graphNodes,
                );
                const sourceNodeVisible = sourceNode?.visible ?? false;
                const targetNodeVisible = targetNode?.visible ?? false;

                if (
                  (sourceNodeVisible || targetNodeVisible) &&
                  modSource.x !== undefined &&
                  modTarget.x !== undefined &&
                  modSource.y !== undefined &&
                  modTarget.y !== undefined
                ) {
                  const isGradient = sourceNodeVisible !== targetNodeVisible;
                  // const gradientTo: number | undefined =
                  //   isGradient && targetNodeVisible
                  //     ? sourceNode?.id
                  //     : targetNode?.id;

                  // const gradientFrom: number | undefined =
                  //   gradientTo === sourceNode?.id
                  //     ? targetNode?.id
                  //     : sourceNode?.id;

                  // console.log("-----");
                  // console.log(
                  //   "sourceNode: ",
                  //   sourceNode?.id,
                  //   sourceNode?.visible,
                  // );
                  // console.log(
                  //   "targetNode: ",
                  //   targetNode?.id,
                  //   targetNode?.visible,
                  // );
                  // console.log(gradientFrom, " -> ", gradientTo);

                  return (
                    <g
                      className="link cursor-pointer"
                      key={`${modSource.id}-${type}-${modTarget.id}`}
                      onClick={() => {
                        if (graphLink.id === focusedLink?.id) {
                          setFocusedLink(undefined);
                        } else {
                          setFocusedLink(graphLink);
                        }
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        onLinkContextMenu?.(graphLink);
                      }}
                    >
                      <line
                        stroke={
                          isFocused
                            ? "#ef7234"
                            : isPathLink
                              ? "#eae80c"
                              : "white"
                        }
                        // stroke={
                        //   isFocused
                        //     ? "#ef7234"
                        //     : isPathLink
                        //       ? "#eae80c"
                        //       : isGradient
                        //         ? `url(#gradient-${graphLink.id})`
                        //         : "white"
                        // }
                        strokeWidth={isFocused ? 3 : 2}
                        strokeOpacity={
                          isFocused
                            ? 1
                            : isGradient
                              ? 0.04
                              : (distance(graphLink) ? 0.6 : 0.4) /
                                (distance(graphLink) * distance(graphLink) || 1)
                        }
                        // strokeOpacity={isFocused ? 1 : isGradient ? 0.3 : 0.4}
                        x1={modSource.x}
                        y1={modSource.y}
                        x2={modTarget.x}
                        y2={modTarget.y}
                      />
                      {/* <defs>
                      <linearGradient
                        id={`gradient-${graphLink.id}`}
                        x1={gradientTo === modSource.id ? "0%" : "100%"}
                        y1={gradientTo === modSource.id ? "0%" : "100%"}
                        x2={gradientTo === modTarget.id ? "0%" : "100%"}
                        y2={gradientTo === modTarget.id ? "0%" : "100%"}
                      >
                        <stop offset="0%" stopColor="white" stopOpacity={0} />
                        <stop
                          offset="100%"
                          stopColor="white"
                          stopOpacity={0.3}
                        />
                      </linearGradient>
                    </defs> */}
                      {currentScale > 3.5 && (
                        <text
                          x={(modSource.x + modTarget.x) / 2}
                          y={(modSource.y + modTarget.y) / 2}
                          textAnchor="middle"
                          fill={"darkgray"}
                          fontSize={2.5}
                        >
                          {graphLink.type}
                        </text>
                      )}
                    </g>
                  );
                }
              })}
              {graphNodes.map((graphNode) => {
                const isFocused = graphNode.id === focusedNode?.id;
                const isPathNode = selectedPathData?.nodes
                  .map((node) => node.id)
                  .includes(graphNode.id);
                const graphUnselected = selectedGraphData
                  ? !selectedGraphData.nodes.some((node) => {
                      return node.name === graphNode.name;
                    })
                  : false;
                const queryFiltered =
                  !!nodeSearchQuery &&
                  nodeSearchQuery !== "" &&
                  graphNode.name
                    .toLowerCase()
                    .includes(nodeSearchQuery.toLowerCase());

                const isDragEditorTarget =
                  isEditor &&
                  dragState.isDragging &&
                  (dragState.targetNode?.id === graphNode.id ||
                    dragState.sourceNode?.id === graphNode.id);

                if (
                  (graphNode.visible ?? false) ||
                  queryFiltered ||
                  isFocused ||
                  isPathNode
                ) {
                  return (
                    <g
                      key={graphNode.id}
                      ref={nodeRef}
                      className={`${graphIdentifier}-node cursor-pointer`}
                      onClick={() => {
                        if (graphNode.id === focusedNode?.id) {
                          setFocusedNode(undefined);
                        } else {
                          setFocusedNode(graphNode);
                        }
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        onNodeContextMenu?.(graphNode);
                      }}
                    >
                      <circle
                        r={
                          1.6 *
                          ((graphNode.neighborLinkCount ?? 0) * 0.1 + 3.6) *
                          (isNodeFiltered(graphNode, filterOption) ? 1 : 0.5)
                        }
                        fill={
                          isFocused || isDragEditorTarget
                            ? "#ef7234"
                            : isPathNode
                              ? "#eae80c"
                              : graphUnselected
                                ? "#324557"
                                : isClustered && graphNode.nodeColor
                                  ? graphNode.nodeColor
                                  : "whitesmoke"
                        }
                        opacity={
                          isNodeFiltered(graphNode, filterOption) ? 0.95 : 0.6
                        }
                        cx={graphNode.x}
                        cy={graphNode.y}
                        stroke="#eae80c"
                        strokeWidth={queryFiltered ? 2.5 : 0}
                      />
                      {(currentScale > 0.7 || isGraphFullScreen) && (
                        <text
                          x={graphNode.x}
                          y={graphNode.y}
                          textAnchor="middle"
                          fill={
                            queryFiltered
                              ? "#eab000"
                              : isClustered
                                ? "whitesmoke"
                                : "dimgray"
                          }
                          fontSize={
                            currentScale > 4 ? 4 : currentScale > 3 ? 6 : 8
                          }
                        >
                          {graphNode.name}
                        </text>
                      )}
                    </g>
                  );
                } else {
                  return;
                }
              })}
              {isEditor && (
                <>
                  <line
                    ref={tempLineRef}
                    style={{
                      display: "none",
                      stroke: "#ef7234",
                      strokeWidth: 2,
                      strokeDasharray: "5,5",
                      pointerEvents: "none",
                      opacity: 0.5,
                    }}
                  />
                  <circle
                    ref={tempCircleRef}
                    r={5}
                    style={{
                      display: "none",
                      fill: "#ef7234",
                      opacity: 0.5,
                    }}
                  />
                </>
              )}
            </D3ZoomProvider>
          </svg>
        )}
      </div>
    </div>
  );
};
