import React, { useState, useMemo } from "react";
import { Button } from "../../button/button";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  TriangleRightIcon,
  ClipboardIcon,
  Pencil2Icon,
} from "../../icons";
import type { CustomLinkType, CustomNodeType } from "@/app/const/types";
import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from "@headlessui/react";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import { usePathname, useRouter } from "next/navigation";
import { getNodeByIdForFrontend } from "@/app/_utils/kg/filter";

import { calculateGraphStatistics } from "@/app/_utils/kg/graph-statistics";

type GraphInfoPanelProps = {
  focusedNode: CustomNodeType | undefined;
  focusedLink: CustomLinkType | undefined;
  setFocusNode: React.Dispatch<
    React.SetStateAction<CustomNodeType | undefined>
  >;
  graphDocument: GraphDocumentForFrontend;
  contextId: string;
  contextType: "topicSpace" | "document";
  // maxHeight: number;
};

export const GraphInfoPanel = ({
  focusedNode,
  focusedLink,
  setFocusNode,
  graphDocument,
  contextId,
  contextType,
  // maxHeight,
}: GraphInfoPanelProps) => {
  const [isPanelOpen, setIsPanelOpen] = useState<boolean>(true);
  const { nodes: graphNodes, relationships: graphLinks } = graphDocument;

  const graphStatistics = useMemo(() => {
    return calculateGraphStatistics(graphDocument);
  }, [graphDocument]);

  // グラフ統計情報の計算
  const nodeCount = graphNodes.length;
  const linkCount = graphLinks.length;

  const nodeTypeCounts = graphNodes.reduce(
    (acc, node) => {
      acc[node.label] = (acc[node.label] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const linkTypeCounts = graphLinks.reduce(
    (acc, link) => {
      acc[link.type] = (acc[link.type] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const neighborLinks = graphLinks.filter((link) => {
    return (
      link.sourceId === focusedNode?.id || link.targetId === focusedNode?.id
    );
  });

  const neighborNodes = neighborLinks.map((link) => {
    const neighborId =
      link.targetId === focusedNode?.id ? link.sourceId : link.targetId;
    return getNodeByIdForFrontend(neighborId, graphNodes);
  });

  const handleCopyStatistics = async () => {
    const data = {
      summary: {
        nodeCount,
        edgeCount: linkCount,
        diameter: graphStatistics.diameter,
        avgPathLength: graphStatistics.avgPathLength,
        avgClusteringCoeff: graphStatistics.avgClusteringCoeff,
        globalClusteringCoeff: graphStatistics.globalClusteringCoeff,
      },
      distributions: {
        nodeTypes: nodeTypeCounts,
        edgeTypes: linkTypeCounts,
      },
      topDegreeNodes: graphStatistics.topDegreeNodes.map((n) => ({
        id: n.id,
        name: n.name,
        label: n.label,
        degree: n.degree,
      })),
      timestamp: new Date().toISOString(),
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      alert("グラフ統計情報をクリップボードにコピーしました");
    } catch (err) {
      console.error("Failed to copy:", err);
      alert("コピーに失敗しました");
    }
  };

  return (
    <div
      className={`absolute flex max-h-[500px] flex-row items-start gap-2 overflow-y-scroll rounded-l-lg bg-black/20 p-4 backdrop-blur-sm ${isPanelOpen ? "right-[9px] w-[400px] pr-14" : "right-[9px] w-0 pr-12"}`}
    >
      <Button
        onClick={() => {
          setIsPanelOpen(!isPanelOpen);
        }}
        className="sticky top-0 !h-8 !w-8 !p-2"
      >
        {isPanelOpen ? (
          <ChevronRightIcon width={16} height={16} color="white" />
        ) : (
          <ChevronLeftIcon width={16} height={16} color="white" />
        )}
      </Button>

      {isPanelOpen && (
        <div className="flex w-full flex-col gap-6 overflow-x-hidden">
          {/* グラフ全体情報 */}
          <div className="flex w-full flex-col gap-2 rounded-md border border-slate-400 p-2">
            <div className="flex w-full items-center justify-between font-semibold text-slate-50">
              <div>グラフ基本情報</div>
              <button
                onClick={() => {
                  void handleCopyStatistics();
                }}
                className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-700 p-1 text-slate-50 hover:bg-slate-600"
                title="分析用データをコピー"
              >
                <ClipboardIcon width={14} height={14} color="white" />
              </button>
            </div>
            <Disclosure defaultOpen={false}>
              <DisclosureButton className="group flex w-full flex-row items-center gap-2 text-sm text-slate-200">
                <div className="group-data-[open]:rotate-90">
                  <TriangleRightIcon height={16} width={16} color="white" />
                </div>
                <div>概要を表示</div>
              </DisclosureButton>
              <DisclosurePanel className="flex flex-col gap-2 pl-6 text-sm text-slate-200">
                <div>ノード数: {nodeCount}</div>
                <div>エッジ数: {linkCount}</div>
                <div>
                  平均ホップ数: {graphStatistics.avgPathLength.toFixed(2)}
                </div>
                <div>直径: {graphStatistics.diameter}</div>
                <div>
                  大域的クラスター係数:{" "}
                  {graphStatistics.globalClusteringCoeff?.toFixed(3)}
                </div>
                <div>
                  平均クラスター係数:{" "}
                  {graphStatistics.avgClusteringCoeff?.toFixed(3)}
                </div>

                <div className="font-semibold text-slate-400">
                  重要エンティティ（ハブ）:
                </div>
                <div className="flex flex-col gap-1 pl-2">
                  {graphStatistics.topDegreeNodes.map((node) => (
                    <button
                      key={node.id}
                      className="flex w-full cursor-pointer items-center justify-between rounded p-1 text-left hover:bg-white/10"
                      onClick={() => setFocusNode(node)}
                    >
                      <span className="flex-1 truncate text-xs">
                        {node.name}
                      </span>
                      <span className="ml-2 rounded bg-slate-600 px-1 text-xs">
                        {node.degree}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="font-semibold text-slate-400">
                  ノードタイプ内訳:
                </div>
                <div className="pl-2">
                  {Object.entries(nodeTypeCounts).map(([type, count]) => (
                    <div key={type} className="flex justify-between">
                      <span>{type}</span>
                      <span>{count}</span>
                    </div>
                  ))}
                </div>

                <div className="font-semibold text-slate-400">
                  エッジタイプ内訳:
                </div>
                <div className="pl-2">
                  {Object.entries(linkTypeCounts).map(([type, count]) => (
                    <div key={type} className="flex justify-between">
                      <span>{type}</span>
                      <span>{count}</span>
                    </div>
                  ))}
                </div>
              </DisclosurePanel>
            </Disclosure>
          </div>

          <div className="flex h-full w-full flex-col gap-2 rounded-md border border-slate-400 p-2">
            <div className="w-full font-semibold text-slate-50">
              選択中のノード
            </div>

            <Disclosure>
              <DisclosureButton className="group w-full">
                <>
                  {focusedNode && (
                    <div className="flex w-full flex-col text-orange-500">
                      <div className="flex w-full flex-row items-center gap-2">
                        <div className="flex flex-row items-center">
                          <div className="group-data-[open]:rotate-90">
                            <TriangleRightIcon
                              height={20}
                              width={20}
                              color="white"
                            />
                          </div>
                          <div className="flex w-max flex-col items-center justify-center truncate rounded-full bg-white px-2 py-1 text-sm font-semibold text-orange-500">
                            {focusedNode.name}
                          </div>
                        </div>

                        <div className="flex w-max flex-row items-center justify-center rounded-md bg-white px-2 text-sm text-slate-900">
                          {focusedNode.label}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              </DisclosureButton>

              {/* {focusedNode && (
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex flex-row items-center gap-1">
                    <div className="font-semibold">プロパティ</div> */}

              {/*　MEMO: Info Panelからの編集は体験として微妙なので一旦編集できないようにする */}
              {/* {isEditor ? (
                      <Button
                        className="!p-1 !text-sm"
                        onClick={() => setIsEditing(!isEditing)}
                      >
                        {isEditing ? "キャンセル" : "編集"}
                      </Button>
                    ) : (
                      <></>
                    )} */}
              {/* </div> */}

              {/* <PropertiesDetailPanel
                    data={focusedNode}
                    topicSpaceId={topicSpaceId}
                  /> */}

              {/*　MEMO: Info Panelからの編集は体験として微妙なので一旦編集できないようにする */}
              {/* {isEditor && isEditing && topicSpaceId && refetch ? (
                    <div className="flex flex-col gap-1">
                      <NodePropertiesForm
                        node={focusedNode}
                        topicSpaceId={topicSpaceId}
                        refetch={refetch}
                        setIsEditing={setIsEditing}
                        width="short"
                      />
                    </div>
                  ) : (
                    <PropertyInfo
                      data={focusedNode}
                      topicSpaceId={topicSpaceId}
                    />
                  )} */}
              {/* </div> */}
              {/* )} */}

              <DisclosurePanel className="flex w-full flex-col gap-2 pl-5">
                {contextType === "topicSpace" && (
                  <a
                    className="w-max cursor-pointer rounded-md bg-slate-500 p-2 text-sm text-white"
                    href={`/topic-spaces/${contextId}/tree/${focusedNode?.id}`}
                  >
                    ツリー表示
                  </a>
                )}

                <div className="text-sm">隣接しているノード</div>
                <div className="flex w-full flex-col divide-y divide-slate-400">
                  {neighborNodes.map((node, index) => {
                    return (
                      <button
                        key={index}
                        className="flex w-full cursor-pointer flex-col gap-1 p-1 hover:bg-slate-50/10"
                        onClick={() => {
                          if (!!node) setFocusNode(node);
                        }}
                      >
                        <div className="flex w-max flex-col items-center justify-center truncate rounded-full bg-white px-2 py-1 text-sm font-semibold text-orange-500">
                          {node?.name}
                        </div>
                        <div className="truncate text-xs">
                          {neighborLinks[index]?.type}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </DisclosurePanel>
            </Disclosure>
          </div>

          <div className="flex w-full flex-col gap-2 rounded-md border border-slate-400 p-2">
            <div className="font-semibold text-slate-50">選択中のリンク</div>
            {focusedLink && (
              <div className="flex max-w-[300px] flex-col gap-2">
                <div className="font-semibold text-orange-500">
                  <div className="flex w-max flex-col items-center">
                    <div className="flex w-max flex-col items-center justify-center truncate rounded-md bg-white p-1 text-sm">
                      {
                        getNodeByIdForFrontend(focusedLink.sourceId, graphNodes)
                          ?.name
                      }
                    </div>
                    <div>|</div>
                    <div className="truncate text-sm">{focusedLink.type}</div>
                    <div>↓</div>
                    <div className="flex w-max flex-col items-center justify-center truncate rounded-md bg-white p-1 text-sm">
                      {
                        getNodeByIdForFrontend(focusedLink.targetId, graphNodes)
                          ?.name
                      }
                    </div>
                  </div>
                </div>

                {/* <div className="flex flex-col gap-2 text-sm">
                  <div className="flex flex-row items-center gap-1">
                    <div className="font-semibold">プロパティ</div>
                  </div>
                  <PropertiesDetailPanel
                    data={focusedLink}
                    topicSpaceId={topicSpaceId}
                  />
                </div> */}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const PropertiesSummaryPanel = ({
  node,
  contextId,
  contextType,
  withDetail = false,
  onEditNode,
}: {
  node: CustomNodeType;
  contextId: string;
  contextType: "topicSpace" | "document";
  withDetail?: boolean;
  /** リストからノード編集モーダルを開く場合に指定（「詳細」と同様のボタンで編集を開く） */
  onEditNode?: (node: CustomNodeType) => void;
}) => {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-row items-center gap-2">
        <div className="text-xs">プロパティ</div>
        {withDetail && (
          <Button
            className="!p-1 !text-sm"
            onClick={() =>
              router.push(`${pathname}?list=true&nodeId=${node.id}`)
            }
          >
            詳細
          </Button>
        )}
        {onEditNode && (
          <button
            type="button"
            className="rounded-md bg-slate-700 px-2 py-1.5 text-sm text-slate-50 hover:bg-slate-600 focus:outline-none focus:ring-1 focus:ring-white/50"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEditNode(node);
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEditNode(node);
            }}
          >
            <Pencil2Icon width={16} height={16} color="white" />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1 text-sm">
        {Object.entries(node.properties ?? {}).map(([key, value], index) => (
          <div key={index} className="flex flex-row gap-1">
            <div className="w-32 text-xs text-slate-400">{key}</div>
            <div className="w-full truncate">
              {value?.startsWith("http://") || value?.startsWith("https://") ? (
                <a
                  href={value}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:no-underline"
                >
                  {value}
                </a>
              ) : (
                <>
                  {key == "tag" && contextType === "topicSpace" ? (
                    <a
                      href={`/topic-spaces/${contextId}/tags/${value}?cut-off=2`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:no-underline"
                    >
                      {value}
                    </a>
                  ) : (
                    value
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const PropertiesDetailPanel = ({
  data,
  contextId,
  contextType,
}: {
  data: CustomNodeType | CustomLinkType;
  contextId: string;
  contextType: "topicSpace" | "document";
}) => {
  return (
    <div className="flex flex-col gap-3">
      {Object.entries(data.properties ?? {}).map(([key, value], index) => (
        <div key={index} className="flex flex-row gap-2">
          <div className="w-32 text-sm text-slate-400">{key}</div>
          <div className="w-full whitespace-pre-wrap">
            {value?.startsWith("http://") || value?.startsWith("https://") ? (
              <a
                href={value}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:no-underline"
              >
                {value}
              </a>
            ) : (
              <>
                {key == "tag" && contextType === "topicSpace" ? (
                  <a
                    href={`/topic-spaces/${contextId}/tags/${value}?cut-off=2`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:no-underline"
                  >
                    {value}
                  </a>
                ) : (
                  value
                )}
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
