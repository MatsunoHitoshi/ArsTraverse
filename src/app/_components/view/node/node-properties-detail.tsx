import type { GraphDocumentForFrontend } from "@/app/const/types";
import { Button } from "../../button/button";
import { ChevronRightIcon, Pencil2Icon } from "../../icons";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { useState } from "react";
import { Loading } from "../../loading/loading";
import { PropertiesDetailPanel } from "../../d3/force/graph-info-panel";
import { NodePropertiesForm } from "../../form/node-properties-form";
import AdditionalGraphViewer from "../graph-view/additional-graph-viewer";
import type { CustomNodeType } from "@/app/const/types";
import { RelatedNodesAndLinksViewer } from "../graph-view/related-nodes-viewer";

export const NodePropertiesDetail = ({
  node,
  topicSpaceId,
  refetch,
  enableEdit = false,
}: {
  node: CustomNodeType | undefined;
  topicSpaceId: string;
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

          <div className="flex flex-col gap-4">
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
                            : "descriptionからグラフを生成"}
                        </>
                      )}
                    </Button>
                  )}
                </>
              )}
            </div>

            {topicSpaceId && refetch && newGraphDocument && (
              <AdditionalGraphViewer
                graphDocument={newGraphDocument}
                setGraphDocument={setNewGraphDocument}
                topicSpaceId={topicSpaceId}
                refetch={refetch}
              />
            )}

            <RelatedNodesAndLinksViewer
              node={node}
              topicSpaceId={topicSpaceId}
              className="flex flex-col gap-1 rounded-md border border-gray-600"
            />

            {onEdit && enableEdit && refetch ? (
              <div className="flex w-full flex-col gap-1">
                <NodePropertiesForm
                  node={node}
                  topicSpaceId={topicSpaceId}
                  refetch={refetch}
                  setIsEditing={setOnEdit}
                />
              </div>
            ) : (
              <PropertiesDetailPanel data={node} topicSpaceId={topicSpaceId} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
