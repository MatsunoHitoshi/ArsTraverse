import type { GraphDocumentForFrontend } from "@/app/const/types";
import { Button } from "../../button/button";
import { ChevronRightIcon, Pencil2Icon } from "../../icons";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { useEffect, useState } from "react";
import { Loading } from "../../loading/loading";
import { PropertiesDetailPanel } from "../../d3/force/graph-info-panel";
import { NodePropertiesForm } from "../../form/node-properties-form";
import AdditionalGraphViewer from "../graph-view/additional-graph-viewer";
import type { CustomNodeType } from "@/app/const/types";
import { RelatedNodesAndLinksViewer } from "../graph-view/related-nodes-viewer";
import { NodeAnnotationSection } from "./node-annotation-section";

export const NodePropertiesDetail = ({
  node,
  contextId,
  contextType,
  refetch,
  enableEdit = false,
}: {
  node: CustomNodeType | undefined;
  contextId: string;
  contextType: "topicSpace" | "document";
  refetch?: () => void;
  enableEdit?: boolean;
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const extractKG = api.kg.extractKG.useMutation();
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [newGraphDocument, setNewGraphDocument] =
    useState<GraphDocumentForFrontend | null>(null);

  const [onEdit, setOnEdit] = useState<boolean>(false);
  const [isGraphEditorMode, setIsGraphEditorMode] = useState<boolean>(false);
  const [focusedNode, setFocusedNode] = useState<CustomNodeType | undefined>(
    undefined,
  );

  useEffect(() => {
    router.push(`${pathname}?list=true&nodeId=${focusedNode?.id}`);
  }, [focusedNode]);

  if (!node) {
    return null;
  }

  const generateGraphFromDescription = () => {
    setIsExtracting(true);
    const textContent = `${node.name}:${node.label}\n${node.properties.description}`;
    if (!textContent) return;
    const fileUrl = `data:text/plain;base64,${Buffer.from(textContent).toString("base64")}`;

    extractKG.mutate(
      {
        fileUrl: fileUrl,
        extractMode: "langChain",
        isPlaneTextMode: true,
      },
      {
        onSuccess: (res) => {
          setNewGraphDocument(res.data.graph);
          setIsExtracting(false);
        },
        onError: (e) => {
          console.log(e);
          setIsExtracting(false);
        },
      },
    );
  };

  const onGraphUpdate = (additionalGraph: GraphDocumentForFrontend) => {
    setNewGraphDocument(additionalGraph);
    setIsGraphEditorMode(true);
  };

  return (
    <div className="flex w-full flex-col gap-4 px-6 py-2">
      <div className="flex flex-col gap-8">
        <Button
          className="!h-6 !p-1"
          onClick={() => router.push(`${pathname}?list=true`)}
        >
          <ChevronRightIcon width={16} height={16} />
        </Button>
        <div className="flex w-full flex-col gap-4">
          <div className="flex flex-col gap-1">
            <div className="text-lg font-bold">{node.name}</div>
            <div className="text-sm text-gray-500">{node.label}</div>
          </div>

          {node.properties?.imageUrl && (
            <div className="flex flex-col gap-1">
              <img
                src={node.properties.imageUrl}
                alt={node.properties.imageAlt ?? node.name}
                className="max-h-64 w-full max-w-md rounded object-contain bg-slate-800"
              />
              {node.properties.imageCaption && (
                <p className="text-sm text-slate-400">
                  {node.properties.imageCaption}
                </p>
              )}
            </div>
          )}

          <div className="flex w-full flex-col gap-4">
            <div className="flex w-full flex-col items-start gap-1">
              <RelatedNodesAndLinksViewer
                node={node}
                contextId={contextId}
                contextType={contextType}
                setFocusedNode={setFocusedNode}
                focusedNode={focusedNode}
                className="flex w-full flex-col gap-1 rounded-md border border-gray-600"
              />
              {contextType === "topicSpace" && (
                <a
                  className="w-max cursor-pointer rounded-md bg-slate-500 p-2 text-sm text-white"
                  href={`/topic-spaces/${contextId}/tree/${node.id}`}
                >
                  ツリー表示
                </a>
              )}
            </div>

            <div className="flex flex-row items-center gap-3">
              <div className="text-xs">プロパティ</div>

              {enableEdit && (
                <>
                  <Button
                    className="!p-1 !text-sm"
                    onClick={() => setOnEdit(!onEdit)}
                  >
                    {onEdit ? (
                      "キャンセル"
                    ) : (
                      <Pencil2Icon width={18} height={18} color="white" />
                    )}
                  </Button>
                  {node.properties.description && (
                    <Button
                      onClick={generateGraphFromDescription}
                      className="!p-1 !text-sm"
                      disabled={isExtracting}
                    >
                      {isExtracting ? (
                        <Loading color="white" size={12} />
                      ) : (
                        <>
                          {newGraphDocument
                            ? "グラフの再生成"
                            : "知識グラフを拡張"}
                        </>
                      )}
                    </Button>
                  )}
                </>
              )}
            </div>

            {onEdit && enableEdit && refetch ? (
              <div className="flex w-full flex-col gap-1">
                <NodePropertiesForm
                  node={node}
                  topicSpaceId={contextType === "topicSpace" ? contextId : ""}
                  refetch={refetch}
                  setIsEditing={setOnEdit}
                  enableProposalMode={true}
                />
              </div>
            ) : (
              <PropertiesDetailPanel
                data={node}
                contextId={contextId}
                contextType={contextType}
              />
            )}

            {contextType === "topicSpace" && (
              <div className="flex w-full flex-col gap-4">
                <NodeAnnotationSection
                  node={node}
                  topicSpaceId={contextType === "topicSpace" ? contextId : ""}
                  setFocusedNode={setFocusedNode}
                  setIsGraphEditor={setIsGraphEditorMode}
                  onGraphUpdate={onGraphUpdate}
                />
              </div>
            )}

            {contextType === "topicSpace" &&
              refetch &&
              newGraphDocument &&
              isGraphEditorMode && (
                <AdditionalGraphViewer
                  graphDocument={newGraphDocument}
                  setGraphDocument={setNewGraphDocument}
                  topicSpaceId={contextId}
                  refetch={refetch}
                />
              )}
          </div>
        </div>
      </div>
    </div>
  );
};
