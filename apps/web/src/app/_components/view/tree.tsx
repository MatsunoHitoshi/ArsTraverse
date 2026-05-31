"use client";
import { api } from "@/trpc/react";
import { TabsContainer } from "../tab/tab";
import { useWindowSize } from "@/app/_hooks/use-window-size";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import type { DocumentResponse } from "@/app/const/types";
import { useEffect, useRef, useState } from "react";
import { TopicGraphDocumentList } from "../list/topic-graph-document-list";
import { Toolbar } from "../toolbar/toolbar";
import { D3RadialTree } from "../d3/tree/radial-tree";
import Slider from "react-input-slider";
import { ExportGraphButton } from "../d3/export-graph-button";
import { Switch } from "@headlessui/react";
import type { EdgeType } from "@/app/_utils/kg/get-tree-layout-data";

export const TreeViewer = ({
  topicSpaceId,
  nodeId,
}: {
  topicSpaceId: string;
  nodeId: string;
}) => {
  const [edgeType, setEdgeType] = useState<EdgeType>("OUT");
  const { data: topicSpace } = api.topicSpaces.getByIdPublic.useQuery({
    id: topicSpaceId,
  });
  const { data: treeData, refetch } = api.treeGraph.getByNodeId.useQuery({
    topicSpaceId: topicSpaceId,
    nodeId: nodeId,
    edgeType: edgeType,
  });
  const [innerWidth, innerHeight] = useWindowSize();
  const graphAreaWidth = (2 * (innerWidth ?? 100)) / 3 - 22;
  const graphAreaHeight = (innerHeight ?? 300) - 128;
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>("");
  const [selectedGraphData, setSelectedGraphData] =
    useState<GraphDocumentForFrontend | null>(null);
  const [nodeSearchQuery, setNodeSearchQuery] = useState<string>("");
  const [treeRadius, setTreeRadius] = useState<number>(80);
  const [currentScale, setCurrentScale] = useState<number>(1);
  const svgRef = useRef<SVGSVGElement>(null);
  const [bgLight, setBgLight] = useState<boolean>(false);

  useEffect(() => {
    refetch;
  }, [edgeType]);

  useEffect(() => {
    setSelectedGraphData(
      (topicSpace?.sourceDocuments?.find((document) => {
        return document.id === selectedDocumentId;
      })?.graph?.dataJson as GraphDocumentForFrontend) ?? null,
    );
  }, [selectedDocumentId, topicSpace]);

  if (!topicSpace) return null;
  return (
    <TabsContainer>
      <div className="grid  h-full grid-flow-row grid-cols-3 gap-8 overflow-hidden ">
        <div className="flex flex-col gap-6 overflow-scroll p-4">
          <a href={`/topic-spaces/${topicSpaceId}/graph`} className="w-max">
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
          <div className="flex flex-col gap-4">
            <Toolbar
              setNodeSearchQuery={setNodeSearchQuery}
              edgeType={edgeType}
              setEdgeType={setEdgeType}
            />
            <div className="flex flex-row items-center gap-2 px-4">
              <div className="text-sm">ツリーの広さ</div>
              <Slider
                styles={{
                  active: {
                    backgroundColor: "#fb923c",
                  },
                  track: {
                    backgroundColor: "#555",
                    height: 5,
                  },
                }}
                axis="x"
                x={treeRadius}
                onChange={(d) => {
                  setTreeRadius(d.x);
                }}
                xmin={10}
                xmax={500}
              />
            </div>
          </div>

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
        </div>
        <div className={`col-span-2 ${bgLight ? "bg-white" : ""}`}>
          {topicSpace.graphData && treeData ? (
            <D3RadialTree
              bgMode={bgLight ? "light" : "dark"}
              svgRef={svgRef}
              width={graphAreaWidth}
              height={graphAreaHeight}
              nodeSearchQuery={nodeSearchQuery}
              data={treeData}
              selectedGraphData={selectedGraphData}
              treeRadius={treeRadius}
              setCurrentScale={setCurrentScale}
              currentScale={currentScale}
              toolComponent={
                <div className="absolute flex flex-row items-center gap-2">
                  <ExportGraphButton
                    svgRef={svgRef}
                    currentScale={currentScale}
                  />

                  <div className="flex flex-row items-center gap-2">
                    <div
                      className={`text-xs ${bgLight ? "text-slate-900" : ""}`}
                    >
                      背景色
                    </div>
                    <Switch
                      checked={bgLight}
                      onChange={setBgLight}
                      className="group inline-flex h-4 w-7 items-center rounded-full bg-slate-400 transition data-[checked]:bg-orange-400"
                    >
                      <span className="size-3 translate-x-1/3 rounded-full bg-white transition group-data-[checked]:translate-x-3" />
                    </Switch>
                  </div>
                </div>
              }
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center p-4">
              <div>グラフがありません</div>
              <div>{topicSpace.graphDataStatus}</div>
            </div>
          )}
        </div>
      </div>
    </TabsContainer>
  );
};
