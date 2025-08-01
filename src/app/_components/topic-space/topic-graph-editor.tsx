"use client";
import { api } from "@/trpc/react";
import { TabsContainer } from "../tab/tab";
import { useWindowSize } from "@/app/_hooks/use-window-size";
import type {
  DocumentResponseWithGraphData,
  GraphDocumentForFrontend,
} from "@/app/const/types";
import type {
  DocumentResponse,
  TopicGraphFilterOption,
} from "@/app/const/types";
import { useEffect, useState } from "react";
import { TopicGraphDocumentList } from "../list/topic-graph-document-list";
import { Toolbar } from "../toolbar/toolbar";
import { RelationPathSearch } from "../toolbar/relation-path-search";
import { circleColor } from "./topic-graph-detail";
import { useSession } from "next-auth/react";
import { Switch } from "@headlessui/react";
import { useSearchParams } from "next/navigation";
import { MultiDocumentGraphEditor } from "../view/graph-edit/multi-document-graph-editor";

type TopicGraphDetailProps = {
  id: string;
  filterOption?: TopicGraphFilterOption;
};

export const TopicGraphEditor = ({
  id,
  filterOption,
}: TopicGraphDetailProps) => {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const cutOff = searchParams.get("cut-off");
  const withBetweenNodes = searchParams.get("with-between-nodes");
  const { data: topicSpace, refetch } = api.topicSpaces.getById.useQuery(
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

  const [selectedDocumentId, setSelectedDocumentId] = useState<string>("");
  const [selectedGraphData, setSelectedGraphData] =
    useState<GraphDocumentForFrontend | null>(null);
  const [isLinkFiltered, setIsLinkFiltered] = useState<boolean>(false);
  const [nodeSearchQuery, setNodeSearchQuery] = useState<string>("");
  const [pathData, setPathData] = useState<GraphDocumentForFrontend>();
  const [isClustered, setIsClustered] = useState<boolean>(false);
  const [graphData, setGraphData] = useState<GraphDocumentForFrontend>();

  useEffect(() => {
    console.log("graphData: ", topicSpace?.graphData);
    setGraphData(topicSpace?.graphData as GraphDocumentForFrontend);
  }, [topicSpace]);

  useEffect(() => {
    setSelectedGraphData(
      (topicSpace?.sourceDocuments?.find((document) => {
        return document.id === selectedDocumentId;
      })?.graph?.dataJson as GraphDocumentForFrontend) ?? null,
    );
  }, [selectedDocumentId, topicSpace]);

  useEffect(() => {
    const clusteredGraphData = {
      ...(topicSpace?.graphData as GraphDocumentForFrontend),
    };
    if (isClustered) {
      const documents = topicSpace?.sourceDocuments ?? [];
      setGraphData(
        // TODO: JsonValueのカラムを消した後に 型を修正する
        circleColor(
          clusteredGraphData,
          documents as DocumentResponseWithGraphData[],
        ),
      );
    } else if (graphData?.nodes) {
      clusteredGraphData.nodes.forEach((node) => {
        node.clustered = { x: 0, y: 0 };
        node.nodeColor = undefined;
      });
      setGraphData(clusteredGraphData);
    }
  }, [isClustered, topicSpace]);

  if (!session || !topicSpace) return null;
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

            <div className="flex flex-col gap-1">
              <div className="flex w-full flex-row items-center justify-between">
                <div className="font-semibold">ドキュメント</div>
                <div className="flex flex-row items-center gap-2">
                  <div className="text-sm">色分け</div>
                  <div>
                    <Switch
                      checked={isClustered}
                      onChange={setIsClustered}
                      className="group inline-flex h-6 w-11 items-center rounded-full bg-slate-400 transition data-[checked]:bg-orange-400"
                    >
                      <span className="size-4 translate-x-1 rounded-full bg-white transition group-data-[checked]:translate-x-6" />
                    </Switch>
                  </div>
                </div>
              </div>

              <TopicGraphDocumentList
                documents={topicSpace.sourceDocuments as DocumentResponse[]}
                selectedDocumentId={selectedDocumentId}
                setSelectedDocumentId={setSelectedDocumentId}
                isClustered={isClustered}
              />
            </div>
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
            <MultiDocumentGraphEditor
              graphDocument={graphData}
              topicSpaceId={id}
              refetch={refetch}
              isGraphFullScreen={graphFullScreen}
              setIsGraphFullScreen={setGraphFullScreen}
              isClustered={isClustered}
              selectedGraphData={selectedGraphData ?? undefined}
              selectedPathData={pathData}
              isLinkFiltered={isLinkFiltered}
              nodeSearchQuery={nodeSearchQuery}
            />
          ) : (
            <div className="flex w-full flex-col items-center p-4">
              <div>まだグラフが作成されていません</div>
              <div>{topicSpace.graphDataStatus}</div>
            </div>
          )}
        </div>
      </div>
    </TabsContainer>
  );
};
