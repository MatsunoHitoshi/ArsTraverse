import { GraphIcon } from "@/app/_components/icons";
import type { CustomNodeType } from "@/app/const/types";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../button/button";
import { CheckboxInput } from "../input/checkbox-input";
import { MergeNodesForm } from "../form/merge-nodes-form";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import { PropertiesSummaryPanel } from "../d3/force/graph-info-panel";
import { useRouter, useSearchParams } from "next/navigation";

type NodesSortType = "name" | "centrality" | "none";

export const NodeLinkList = ({
  graphDocument,
  focusedNode,
  topicSpaceId,
  isEditor = false,
  refetch,
  isClustered = false,
  nodeSearchQuery,
  toolComponent,
}: {
  graphDocument: GraphDocumentForFrontend;
  topicSpaceId: string;
  focusedNode: CustomNodeType | undefined;
  nodeSearchQuery?: string;
  toolComponent?: React.ReactNode;
  isClustered?: boolean;
  isEditor?: boolean;
  refetch?: () => void;
}) => {
  const [isNodeMergeMode, setIsNodeMergeMode] = useState<boolean>(false);
  const [mergeNodes, setMergeNodes] = useState<CustomNodeType[]>();
  const [isMergeNodesEditModalOpen, setIsMergeNodesEditModalOpen] =
    useState<boolean>(false);
  const [sortType, setSortType] = useState<NodesSortType>("none");
  const graphNodes = graphDocument.nodes;

  const sortedGraphNodes = useMemo(() => {
    if (sortType === "name") {
      return graphNodes.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortType === "centrality") {
      return graphNodes.sort(
        (a, b) => (b.neighborLinkCount ?? 0) - (a.neighborLinkCount ?? 0),
      );
    } else {
      return graphNodes;
    }
  }, [sortType, graphDocument]);
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="sticky top-2 z-10 mt-2 flex flex-row items-center gap-2">
        {toolComponent}
        <button
          className="rounded-lg bg-black/20 p-2 backdrop-blur-sm"
          onClick={() => {
            const isListOpen = searchParams.get("list") === "true";
            if (isListOpen) {
              router.replace("?list=false", { scroll: false });
            } else {
              router.replace("?list=true", { scroll: false });
            }
          }}
        >
          <GraphIcon width={16} height={16} color="white" />
        </button>

        {isEditor && (
          <>
            <Button
              className="!text-xs"
              onClick={() => setIsNodeMergeMode(!isNodeMergeMode)}
            >
              {isNodeMergeMode ? "統合をキャンセル" : "ノードの統合"}
            </Button>

            {isNodeMergeMode && mergeNodes && mergeNodes.length > 0 && (
              <Button
                className="!text-xs"
                onClick={() => setIsMergeNodesEditModalOpen(true)}
              >
                統合
              </Button>
            )}
          </>
        )}

        <Button
          onClick={() =>
            setSortType(
              sortType === "name"
                ? "centrality"
                : sortType === "centrality"
                  ? "none"
                  : "name",
            )
          }
          className={`!text-xs ${sortType === "none" ? "" : "!text-orange-500"}`}
        >
          {sortType === "name" && "名称順"}
          {sortType === "centrality" && "中心度順"}
          {sortType === "none" && "並び替え"}
        </Button>
      </div>

      <div className="flex w-full flex-col divide-y divide-slate-400">
        {sortedGraphNodes.map((node) => {
          const queryFiltered =
            !!nodeSearchQuery &&
            nodeSearchQuery !== "" &&
            node.name.toLowerCase().includes(nodeSearchQuery.toLowerCase());
          return (
            <div
              key={node.id}
              className={`flex w-full flex-row items-center p-2 ${
                focusedNode?.id === node.id
                  ? "bg-slate-600"
                  : queryFiltered
                    ? "bg-slate-700"
                    : ""
              }`}
            >
              {isNodeMergeMode && (
                <MergeCheck
                  node={node}
                  mergeNodes={mergeNodes}
                  setMergeNodes={setMergeNodes}
                />
              )}
              <div className="flex w-full flex-col gap-2">
                <div className="flex flex-row items-center gap-2">
                  <div>{node.name}</div>
                  <div className="flex w-max flex-row items-center justify-center rounded-md bg-white px-2 text-sm text-slate-900">
                    {node.label}
                  </div>
                  {isClustered ? (
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{
                        backgroundColor: node.nodeColor?.replaceAll(" ", ""),
                      }}
                    ></div>
                  ) : (
                    <></>
                  )}
                </div>

                <PropertiesSummaryPanel
                  node={node}
                  topicSpaceId={topicSpaceId}
                  withDetail={true}
                />
              </div>
            </div>
          );
        })}
      </div>
      {mergeNodes && setMergeNodes && topicSpaceId && refetch && (
        <MergeNodesForm
          isOpen={isMergeNodesEditModalOpen}
          setIsOpen={setIsMergeNodesEditModalOpen}
          mergeNodes={mergeNodes}
          setMergeNodes={setMergeNodes}
          topicSpaceId={topicSpaceId}
          refetch={refetch}
          setIsNodeMergeMode={setIsNodeMergeMode}
        />
      )}
    </div>
  );
};

const MergeCheck = ({
  node,
  mergeNodes,
  setMergeNodes,
}: {
  node: CustomNodeType;
  mergeNodes: CustomNodeType[] | undefined;
  setMergeNodes: React.Dispatch<
    React.SetStateAction<CustomNodeType[] | undefined>
  >;
}) => {
  const [isNodeMerge, setIsNodeMerge] = useState<boolean>(false);

  useEffect(() => {
    if (isNodeMerge) {
      setMergeNodes([...(mergeNodes ?? []), node]);
    } else {
      setMergeNodes(mergeNodes?.filter((n) => n.id !== node.id));
    }
  }, [isNodeMerge]);

  return (
    <div className="mr-2 h-6 w-6">
      <CheckboxInput enabled={isNodeMerge} setEnabled={setIsNodeMerge} />
    </div>
  );
};
