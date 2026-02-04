"use client";
import { api } from "@/trpc/react";
import { TabsContainer } from "../tab/tab";
import type { CustomLinkType, CustomNodeType } from "@/app/const/types";
import { useWindowSize } from "@/app/_hooks/use-window-size";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import type {
  DocumentResponse,
  DocumentResponseWithGraphData,
  TopicGraphFilterOption,
} from "@/app/const/types";
import { useEffect, useRef, useState } from "react";
import { TopicGraphDocumentList } from "../list/topic-graph-document-list";
import { Toolbar } from "../toolbar/toolbar";
import { RelationPathSearch } from "../toolbar/relation-path-search";
import { interpolateRainbow } from "d3";
import { useSearchParams } from "next/navigation";
import { Switch } from "@headlessui/react";
import { useSession } from "next-auth/react";
import { MultiDocumentGraphDetailViewer } from "../view/graph-view/multi-document-graph-detail-viewer";
import { TopicSpaceDocumentListSection } from "./document-list-section";

export const circlePosition = (
  index: number,
  length: number,
  type: "sin" | "cos",
) => {
  const dig = index / length - 1;
  const radius = 400;
  const angle = dig * Math.PI * 2;
  return type === "sin" ? radius * Math.sin(angle) : radius * Math.cos(angle);
};

export const circleColor = (
  clusteredGraphData: GraphDocumentForFrontend,
  documents: DocumentResponseWithGraphData[],
) => {
  const documentIdArray = documents.map((d) => d.id);
  documents.forEach((document, index) => {
    const documentGraph = document.graph?.dataJson;
    clusteredGraphData.nodes.forEach((node) => {
      if (documentGraph?.nodes.map((n) => n.name).includes(node.name)) {
        node.clustered = node.clustered ?? { x: 0, y: 0 };
        node.clustered = {
          x:
            node.clustered.x +
            circlePosition(index, documentIdArray?.length, "cos"),
          y:
            node.clustered.y +
            circlePosition(index, documentIdArray?.length, "sin"),
        };
        if (!node.nodeColor && node.nodeColor !== "") {
          node.nodeColor = interpolateRainbow(index / documentIdArray?.length);
        } else {
          const color = node.nodeColor?.split(",") ?? [];
          const r = parseInt(color[0]?.split(`(`)[1] ?? "0", 10);
          const g = parseInt(color[1] ?? "0", 10);
          const b = parseInt(color[2]?.split(`)`)[0] ?? "0", 10);
          const addColor =
            interpolateRainbow(index / documentIdArray?.length).split(",") ??
            [];
          const addR = parseInt(addColor[0]?.split("(")[1] ?? "0", 10);
          const addG = parseInt(addColor[1] ?? "0", 10);
          const addB = parseInt(addColor[2]?.split(`)`)[0] ?? "0", 10);
          const avgR = Math.floor((r + addR) / 2);
          const avgG = Math.floor((g + addG) / 2);
          const avgB = Math.floor((b + addB) / 2);
          node.nodeColor = `rgb(${avgR}, ${avgG}, ${avgB})`;
        }
      }
    });
  });
  return clusteredGraphData;
};

type TopicGraphDetailProps = {
  id: string;
  filterOption?: TopicGraphFilterOption;
};

export const TopicGraphDetail = ({
  id,
  filterOption,
}: TopicGraphDetailProps) => {
  const searchParams = useSearchParams();
  const cutOff = searchParams.get("cut-off");
  const withBetweenNodes = searchParams.get("with-between-nodes");
  const { data: topicSpace, refetch } = api.topicSpaces.getByIdPublic.useQuery(
    filterOption
      ? {
          id: id,
          filterOption: {
            ...filterOption,
            cutOff: cutOff ?? undefined,
            withBetweenNodes: withBetweenNodes === "true",
          },
        }
      : {
          id: id,
        },
  );

  const [innerWidth, innerHeight] = useWindowSize();
  const [graphFullScreen, setGraphFullScreen] = useState<boolean>(false);
  const { data: session } = useSession();
  const graphAreaWidth =
    (2 * (innerWidth ?? 100)) / (graphFullScreen ? 2 : 3) - 36;
  const graphAreaHeight = (innerHeight ?? 300) - (session ? 160 : 108);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>("");
  const [selectedGraphData, setSelectedGraphData] =
    useState<GraphDocumentForFrontend | null>(null);
  const [isLinkFiltered, setIsLinkFiltered] = useState<boolean>(false);
  const [nodeSearchQuery, setNodeSearchQuery] = useState<string>("");
  const [pathData, setPathData] = useState<GraphDocumentForFrontend>();
  const [isClustered, setIsClustered] = useState<boolean>(false);
  const [graphData, setGraphData] = useState<GraphDocumentForFrontend>();
  const svgRef = useRef<SVGSVGElement>(null);
  const [currentScale, setCurrentScale] = useState<number>(1);
  const [focusedNode, setFocusedNode] = useState<CustomNodeType | undefined>(
    undefined,
  );
  const [focusedLink, setFocusedLink] = useState<CustomLinkType | undefined>(
    undefined,
  );
  useEffect(() => {
    setGraphData(topicSpace?.graphData);
  }, [topicSpace]);

  useEffect(() => {
    setSelectedGraphData(
      (topicSpace?.sourceDocuments?.find((document) => {
        return document.id === selectedDocumentId;
      })?.graph?.dataJson as GraphDocumentForFrontend) ?? null,
    );
  }, [selectedDocumentId, topicSpace]);

  useEffect(() => {
    if (!topicSpace?.graphData) return;

    const clusteredGraphData = {
      ...topicSpace.graphData,
    };
    if (isClustered) {
      const documents = topicSpace?.sourceDocuments ?? [];
      // TODO: JsonValueのカラムを消した後に 型を修正する
      setGraphData(
        circleColor(
          clusteredGraphData,
          documents as DocumentResponseWithGraphData[],
        ),
      );
    } else if (clusteredGraphData.nodes) {
      clusteredGraphData.nodes.forEach((node) => {
        node.clustered = { x: 0, y: 0 };
        node.nodeColor = undefined;
      });
      setGraphData(clusteredGraphData);
    }
  }, [isClustered, topicSpace]);

  if (!topicSpace) return null;
  console.log("graphData: ", selectedGraphData);

  return (
    <TabsContainer>
      <div className="grid h-full grid-flow-row grid-cols-3 gap-8 overflow-hidden">
        {!graphFullScreen ? (
          <div className="flex flex-col gap-6 overflow-scroll p-4">
            <a href={`/topic-spaces/${id}/graph`} className="w-max">
              <div className="text-lg font-semibold">{topicSpace.name}</div>
            </a>

            <div className="flex flex-col gap-3">
              <div className="text-sm">{topicSpace.description}</div>

              <div className="flex flex-row items-center gap-1">
                {topicSpace.tags?.map((tag) => {
                  return (
                    <div
                      key={tag.id}
                      className="rounded-sm bg-slate-50/10 p-1 text-sm"
                    >
                      {tag.name}
                    </div>
                  );
                })}
              </div>
            </div>
            <Toolbar
              isLinkFiltered={isLinkFiltered}
              setIsLinkFiltered={setIsLinkFiltered}
              setNodeSearchQuery={setNodeSearchQuery}
            />
            <div>
              {!!graphData ? (
                <>
                  <RelationPathSearch
                    graphData={graphData}
                    setPathData={setPathData}
                    pathData={pathData}
                  />
                  {pathData && pathData.nodes.length !== 0 ? (
                    <div className="flex w-full flex-col items-end">
                      <a
                        className="text-sm underline hover:no-underline"
                        href={`/topic-spaces/${id}/path/${pathData.nodes[0]?.id}/${pathData.nodes[pathData.nodes.length - 1]?.id}`}
                      >
                        詳細
                      </a>
                    </div>
                  ) : (
                    <></>
                  )}
                </>
              ) : (
                <></>
              )}
            </div>

            <TopicSpaceDocumentListSection
              documents={topicSpace.sourceDocuments as DocumentResponse[]}
              selectedDocumentId={selectedDocumentId}
              setSelectedDocumentId={setSelectedDocumentId}
              isClustered={isClustered}
              setIsClustered={setIsClustered}
            />
          </div>
        ) : (
          <div className="absolute bottom-3 w-40 rounded-lg bg-black/20 p-2 backdrop-blur-sm">
            <TopicGraphDocumentList
              documents={topicSpace.sourceDocuments as DocumentResponse[]}
              selectedDocumentId={selectedDocumentId}
              setSelectedDocumentId={setSelectedDocumentId}
              isClustered={isClustered}
            />
          </div>
        )}

        <div className="col-span-2 h-full overflow-scroll">
          {graphData ? (
            <MultiDocumentGraphDetailViewer
              topicSpaceId={id}
              graphDocument={graphData}
              isGraphFullScreen={graphFullScreen}
              setIsGraphFullScreen={setGraphFullScreen}
              isClustered={isClustered}
              selectedPathData={pathData}
              selectedGraphData={selectedGraphData ?? undefined}
              isLinkFiltered={isLinkFiltered}
              nodeSearchQuery={nodeSearchQuery}
              sourceDocuments={topicSpace.sourceDocuments?.map((doc) => ({
                id: doc.id,
                graph: doc.graph
                  ? {
                      id: doc.graph.id,
                      dataJson: doc.graph.dataJson as GraphDocumentForFrontend,
                    }
                  : null,
              }))}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center p-4">
              <div>まだグラフが作成されていません</div>
              <div>{topicSpace.graphDataStatus}</div>
            </div>
          )}
        </div>
      </div>
    </TabsContainer>
  );
};
