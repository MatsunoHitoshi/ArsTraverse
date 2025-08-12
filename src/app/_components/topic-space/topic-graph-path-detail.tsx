"use client";
import { api } from "@/trpc/react";
import { TabsContainer } from "../tab/tab";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import type { DocumentResponse } from "@/app/const/types";
import { useEffect, useState } from "react";
import { TopicGraphDocumentList } from "../list/topic-graph-document-list";
import { Toolbar } from "../toolbar/toolbar";
import { RelationPathSearch } from "../toolbar/relation-path-search";
import { GraphSummaryGenerator } from "../summary-generator/graph-smmary-generator";
import { MultiDocumentGraphDetailViewer } from "../view/graph-view/multi-document-graph-detail-viewer";

export const TopicGraphPathDetail = ({
  id,
  startId,
  endId,
}: {
  id: string;
  startId: string;
  endId: string;
}) => {
  const { data: topicSpace } = api.topicSpaces.getPath.useQuery({
    id: id,
    startId: startId,
    endId: endId,
  });
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>("");
  const [selectedGraphData, setSelectedGraphData] =
    useState<GraphDocumentForFrontend | null>(null);
  const [nodeSearchQuery, setNodeSearchQuery] = useState<string>("");
  const [pathData, setPathData] = useState<GraphDocumentForFrontend>();

  useEffect(() => {
    setSelectedGraphData(
      (topicSpace?.sourceDocuments.find((document) => {
        return document.id === selectedDocumentId;
      })?.graph?.dataJson as GraphDocumentForFrontend) ?? null,
    );
  }, [selectedDocumentId, topicSpace]);

  if (!topicSpace) return null;

  return (
    <TabsContainer>
      <div className="grid h-full grid-flow-row grid-cols-3 gap-8 overflow-hidden">
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
          <Toolbar setNodeSearchQuery={setNodeSearchQuery} />
          <RelationPathSearch
            defaultStartNodeId={startId}
            defaultEndNodeId={endId}
            graphData={topicSpace.graphData}
            setPathData={setPathData}
            pathData={pathData}
          />

          <div className="flex flex-col gap-1">
            <div className="flex w-full flex-row items-center justify-between">
              <div className="font-semibold">ドキュメント</div>
            </div>
            <TopicGraphDocumentList
              documents={topicSpace.sourceDocuments as DocumentResponse[]}
              selectedDocumentId={selectedDocumentId}
              setSelectedDocumentId={setSelectedDocumentId}
            />
          </div>

          <GraphSummaryGenerator
            graphData={topicSpace.graphData}
            defaultStartNodeId={startId}
            defaultEndNodeId={endId}
          />
        </div>

        <div className="col-span-2 h-full overflow-scroll">
          {topicSpace.graphData ? (
            <MultiDocumentGraphDetailViewer
              graphDocument={topicSpace.graphData}
              selectedGraphData={selectedGraphData ?? undefined}
              selectedPathData={pathData ?? undefined}
              topicSpaceId={id}
              nodeSearchQuery={nodeSearchQuery}
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
