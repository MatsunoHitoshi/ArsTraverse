"use client";
import { useRef, useState } from "react";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import { D3ForceGraph } from "@/app/_components/d3/force/graph";
import { Toolbar } from "@/app/_components/toolbar/toolbar";
import { api } from "@/trpc/react";
import {
  Link2Icon,
  ListBulletIcon,
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
import { GraphSyncedText } from "../../document/graph-synced-text";
import { useGraphEditor } from "@/app/_hooks/use-graph-editor";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { NodeLinkList } from "../../list/node-link-list";
import { NodePropertiesDetail } from "../node/node-properties-detail";

export const SingleDocumentGraphViewer = ({ graphId }: { graphId: string }) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const isList = searchParams.get("list") === "true";

  const { data: graphData, refetch } = api.documentGraph.getById.useQuery({
    id: graphId,
  });
  const updateGraph = api.documentGraph.updateGraph.useMutation();
  const defaultGraphData = graphData?.dataJson;

  // カスタムフックを使用
  const {
    graphDocument,
    setGraphDocument,
    isEditor,
    setIsEditor,
    isGraphUpdated,
    isNodePropertyEditModalOpen,
    setIsNodePropertyEditModalOpen,
    isLinkPropertyEditModalOpen,
    setIsLinkPropertyEditModalOpen,
    isNodeLinkAttachModalOpen,
    setIsNodeLinkAttachModalOpen,
    focusedNode,
    setFocusedNode,
    focusedLink,
    setFocusedLink,
    additionalGraph,
    setAdditionalGraph,
    onNodeContextMenu,
    onLinkContextMenu,
    onGraphUpdate,
    resetGraphUpdated,
  } = useGraphEditor({
    defaultGraphDocument: defaultGraphData,
    onUpdateSuccess: () => {
      void refetch();
      setIsEditor(false);
    },
    onUpdateError: (error) => {
      console.error("グラフの更新に失敗しました", error);
    },
  });

  const [isLinkFiltered, setIsLinkFiltered] = useState<boolean>(false);
  const [nodeSearchQuery, setNodeSearchQuery] = useState<string>("");
  const [innerWidth, innerHeight] = useWindowSize();
  const graphAreaWidth = (innerWidth ?? 100) - 18;
  const graphAreaHeight = (innerHeight ?? 300) - 130;
  const svgRef = useRef<SVGSVGElement>(null);
  const [currentScale, setCurrentScale] = useState<number>(1);
  const [textPanelFull, setTextPanelFull] = useState<boolean>(false);
  const [magnifierMode, setMagnifierMode] = useState(0);

  const nodeId = searchParams.get("nodeId");
  const node = graphDocument?.nodes.find((n) => String(n.id) === nodeId);

  const onGraphFormUpdate = (additionalGraph: GraphDocumentForFrontend) => {
    console.log("onGraphUpdate", additionalGraph);
    if (isEditor) {
      onGraphUpdate(additionalGraph);
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
          resetGraphUpdated();
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
              magnifierMode={magnifierMode}
              setMagnifierMode={setMagnifierMode}
              rightArea={
                <div className="flex flex-row items-center gap-4">
                  <button
                    onClick={() => {
                      const newSearchParams = new URLSearchParams(searchParams);
                      if (isList) {
                        newSearchParams.set("list", "false");
                      } else {
                        newSearchParams.set("list", "true");
                      }
                      router.replace(
                        `${pathname}?${newSearchParams.toString()}`,
                        { scroll: false },
                      );
                    }}
                    className={`flex items-center justify-center rounded-lg p-2 hover:bg-white/10 ${
                      isList ? "bg-white/20" : ""
                    }`}
                  >
                    <ListBulletIcon width={16} height={16} color="white" />
                  </button>
                  <UrlCopy
                    messagePosition="inButton"
                    className="flex !h-8 !w-8 flex-row items-center justify-center px-0 py-0"
                  >
                    <div className="h-4 w-4">
                      <Link2Icon height={16} width={16} color="white" />
                    </div>
                  </UrlCopy>
                  <div className="w-full max-w-[200px] truncate">
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

          {isList && graphDocument ? (
            <div className="flex h-full w-full flex-row gap-1 overflow-hidden bg-white/20">
              <div
                className={`overflow-scroll bg-slate-900 ${nodeId ? "w-1/3" : "w-full"}`}
              >
                <NodeLinkList
                  graphDocument={graphDocument}
                  topicSpaceId={""}
                  refetch={refetch}
                  focusedNode={focusedNode}
                  isEditor={isEditor}
                  nodeSearchQuery={nodeSearchQuery}
                />
              </div>
              {node && (
                <div className="w-2/3 overflow-scroll bg-slate-900">
                  <NodePropertiesDetail
                    node={node}
                    topicSpaceId={""}
                    refetch={refetch}
                    enableEdit={isEditor}
                  />
                </div>
              )}
            </div>
          ) : (
            graphDocument && (
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
                magnifierMode={magnifierMode}
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
                      topicSpaceId=""
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
            )
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
