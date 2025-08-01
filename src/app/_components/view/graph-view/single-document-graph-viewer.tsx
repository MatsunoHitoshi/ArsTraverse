"use client";
import { useEffect, useRef, useState } from "react";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import { D3ForceGraph } from "@/app/_components/d3/force/graph";
import type { CustomNodeType, CustomLinkType } from "@/app/const/types";
import { Toolbar } from "@/app/_components/toolbar/toolbar";
import { api } from "@/trpc/react";
import {
  Link2Icon,
  TriangleDownIcon,
  TriangleRightIcon,
} from "@/app/_components/icons";
import { UrlCopy } from "@/app/_components/url-copy/url-copy";
import { useWindowSize } from "@/app/_hooks/use-window-size";
import { exportTxt } from "@/app/_utils/sys/svg";
import { GraphInfoPanel } from "../../d3/force/graph-info-panel";
import {
  LinkPropertyEditModal,
  NodePropertyEditModal,
} from "../../modal/node-link-property-edit-modal";
import { NodeLinkEditModal } from "../../modal/node-link-edit-modal";
import { Button } from "../../button/button";
import { diffNodes, diffRelationships } from "@/app/_utils/kg/diff";
import { GraphSyncedText } from "../../document/graph-synced-text";

export const SingleDocumentGraphViewer = ({ graphId }: { graphId: string }) => {
  const { data: graphData, refetch } = api.documentGraph.getById.useQuery({
    id: graphId,
  });
  const updateGraph = api.documentGraph.updateGraph.useMutation();
  const defaultGraphData = graphData?.dataJson;
  const [isEditor, setIsEditor] = useState<boolean>(false);
  const [isLinkFiltered, setIsLinkFiltered] = useState<boolean>(false);
  const [nodeSearchQuery, setNodeSearchQuery] = useState<string>("");
  const [innerWidth, innerHeight] = useWindowSize();
  const graphAreaWidth = (innerWidth ?? 100) - 18;
  const graphAreaHeight = (innerHeight ?? 300) - 130;
  const svgRef = useRef<SVGSVGElement>(null);
  const [currentScale, setCurrentScale] = useState<number>(1);
  const [focusedNode, setFocusedNode] = useState<CustomNodeType | undefined>(
    undefined,
  );
  const [focusedLink, setFocusedLink] = useState<CustomLinkType | undefined>(
    undefined,
  );

  const [graphDocument, setGraphDocument] =
    useState<GraphDocumentForFrontend | null>(null);
  useEffect(() => {
    setGraphDocument(defaultGraphData ?? null);
  }, [defaultGraphData]);
  const [isGraphUpdated, setIsGraphUpdated] = useState<boolean>(false);
  useEffect(() => {
    const nodeDiff = diffNodes(
      defaultGraphData?.nodes ?? [],
      graphDocument?.nodes ?? [],
    );
    const relationshipDiff = diffRelationships(
      defaultGraphData?.relationships ?? [],
      graphDocument?.relationships ?? [],
    );
    setIsGraphUpdated(nodeDiff.length > 0 || relationshipDiff.length > 0);
  }, [graphDocument, defaultGraphData]);

  const onNodeContextMenu = (graphNode: CustomNodeType) => {
    console.log("onNodeContextMenu", graphNode);
    setFocusedNode(graphNode);
    setIsNodePropertyEditModalOpen(true);
  };

  const onLinkContextMenu = (graphLink: CustomLinkType) => {
    console.log("onLinkContextMenu", graphLink);
    setFocusedLink(graphLink);
    setIsLinkPropertyEditModalOpen(true);
  };

  const [additionalGraph, setAdditionalGraph] = useState<
    GraphDocumentForFrontend | undefined
  >();
  const [isNodeLinkAttachModalOpen, setIsNodeLinkAttachModalOpen] =
    useState<boolean>(false);
  const [isNodePropertyEditModalOpen, setIsNodePropertyEditModalOpen] =
    useState<boolean>(false);
  const [isLinkPropertyEditModalOpen, setIsLinkPropertyEditModalOpen] =
    useState<boolean>(false);

  const [textPanelFull, setTextPanelFull] = useState<boolean>(false);

  const onGraphFormUpdate = (additionalGraph: GraphDocumentForFrontend) => {
    console.log("onGraphUpdate", additionalGraph);
    if (isEditor) {
      setAdditionalGraph(additionalGraph);
      setIsNodeLinkAttachModalOpen(true);
    }
  };

  const onUpdateRecord = () => {
    if (!graphDocument) return;
    updateGraph.mutate(
      {
        id: graphId,
        dataJson: graphDocument,
      },
      {
        onSuccess: (res) => {
          void refetch();
          setIsEditor(false);
        },
        onError: () => {
          console.error("グラフの更新に失敗しました");
        },
      },
    );
  };

  if (!graphData) return null;
  return (
    <div>
      <div className="flex h-full w-full flex-row p-2">
        {/* <div className="w-1/3 overflow-y-hidden text-sm text-white">
          <div className="text-sm">{graphData.sourceDocument.text}</div>
        </div> */}
        <div className="flex h-full w-full flex-col divide-y divide-slate-400 overflow-hidden rounded-md border border-slate-400  text-slate-50">
          <div className="px-4">
            <Toolbar
              isLinkFiltered={isLinkFiltered}
              setIsLinkFiltered={setIsLinkFiltered}
              isEditor={isEditor}
              setIsEditing={setIsEditor}
              setNodeSearchQuery={setNodeSearchQuery}
              rightArea={
                <div className="flex w-full max-w-[300px] flex-row items-center gap-4">
                  <UrlCopy
                    messagePosition="inButton"
                    className="flex !h-8 !w-8 flex-row items-center justify-center px-0 py-0"
                  >
                    <div className="h-4 w-4">
                      <Link2Icon height={16} width={16} color="white" />
                    </div>
                  </UrlCopy>
                  <div className="w-full truncate">
                    参照：
                    {graphData.sourceDocument.url.includes("/input-txt/") ? (
                      <button
                        onClick={() => {
                          exportTxt(
                            graphData.sourceDocument.url,
                            graphData.sourceDocument.name,
                          );
                        }}
                        className="underline hover:no-underline"
                      >
                        {graphData.sourceDocument.name}
                      </button>
                    ) : (
                      <a
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full underline hover:no-underline"
                        href={graphData.sourceDocument.url}
                      >
                        {graphData.sourceDocument.name}
                      </a>
                    )}
                  </div>
                </div>
              }
            />
          </div>

          {graphDocument && (
            <D3ForceGraph
              svgRef={svgRef}
              width={graphAreaWidth}
              height={graphAreaHeight}
              graphDocument={graphDocument}
              isLinkFiltered={isLinkFiltered}
              nodeSearchQuery={nodeSearchQuery}
              currentScale={currentScale}
              setCurrentScale={setCurrentScale}
              setFocusedNode={setFocusedNode}
              focusedNode={focusedNode}
              setFocusedLink={setFocusedLink}
              focusedLink={focusedLink}
              isLargeGraph={false}
              isEditor={isEditor}
              onGraphUpdate={isEditor ? onGraphFormUpdate : undefined}
              onNodeContextMenu={isEditor ? onNodeContextMenu : undefined}
              onLinkContextMenu={isEditor ? onLinkContextMenu : undefined}
              toolComponent={
                <>
                  {isEditor && isGraphUpdated && (
                    <div className="p-2">
                      <Button
                        type="button"
                        className="!w-max text-sm"
                        isLoading={updateGraph.isPending}
                        onClick={() => {
                          onUpdateRecord();
                        }}
                      >
                        グラフを更新
                      </Button>
                    </div>
                  )}

                  <GraphInfoPanel
                    focusedNode={focusedNode}
                    focusedLink={focusedLink}
                    graphDocument={graphDocument}
                    setFocusNode={setFocusedNode}
                  />

                  <div className="absolute flex w-1/3 flex-row gap-2 rounded-r-lg bg-black/20 px-4 py-3 text-sm text-white backdrop-blur-sm">
                    <div>
                      <button
                        onClick={() => {
                          setTextPanelFull(!textPanelFull);
                        }}
                      >
                        {textPanelFull ? (
                          <TriangleDownIcon
                            height={18}
                            width={18}
                            color="white"
                          />
                        ) : (
                          <TriangleRightIcon
                            height={18}
                            width={18}
                            color="white"
                          />
                        )}
                      </button>
                    </div>
                    <div
                      className={`overflow-y-scroll whitespace-pre-wrap text-sm ${textPanelFull ? "max-h-[500px]" : "max-h-[60px]"}`}
                    >
                      <GraphSyncedText
                        focusedLink={focusedLink}
                        focusedNode={focusedNode}
                        text={graphData.sourceDocument.text}
                        graphNodes={defaultGraphData?.nodes ?? []}
                      />
                    </div>
                  </div>
                </>
              }
            />
          )}
          {isEditor && graphDocument && (
            <>
              <NodePropertyEditModal
                isOpen={isNodePropertyEditModalOpen}
                setIsOpen={setIsNodePropertyEditModalOpen}
                graphDocument={graphDocument}
                setGraphDocument={setGraphDocument}
                graphNode={focusedNode}
              />
              <LinkPropertyEditModal
                isOpen={isLinkPropertyEditModalOpen}
                setIsOpen={setIsLinkPropertyEditModalOpen}
                graphDocument={graphDocument}
                setGraphDocument={setGraphDocument}
                graphLink={focusedLink}
              />
              <NodeLinkEditModal
                isOpen={isNodeLinkAttachModalOpen}
                setIsOpen={setIsNodeLinkAttachModalOpen}
                graphDocument={graphDocument}
                setGraphDocument={setGraphDocument}
                additionalGraph={additionalGraph}
                setAdditionalGraph={setAdditionalGraph}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};
