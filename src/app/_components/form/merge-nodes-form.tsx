import { api } from "@/trpc/react";
import { Button } from "../button/button";
import type { CustomNodeType } from "@/app/const/types";
import { Modal } from "../modal/modal";
import { PropertiesSummaryPanel } from "../d3/force/graph-info-panel";

export const MergeNodesForm = ({
  isOpen,
  setIsOpen,
  mergeNodes,
  setMergeNodes,
  topicSpaceId,
  refetch,
  setIsNodeMergeMode,
}: {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  mergeNodes: CustomNodeType[];
  setMergeNodes: React.Dispatch<
    React.SetStateAction<CustomNodeType[] | undefined>
  >;
  topicSpaceId: string;
  refetch: () => void;
  setIsNodeMergeMode: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  const mergeGraphNodes = api.topicSpaces.mergeGraphNodes.useMutation();

  const submitMergeNodes = () => {
    mergeGraphNodes.mutate(
      {
        nodes: mergeNodes,
        id: topicSpaceId,
      },
      {
        onSuccess: () => {
          setIsOpen(false);
          setMergeNodes(undefined);
          setIsNodeMergeMode(false);
          refetch();
        },
        onError: (error) => {
          console.error(error);
        },
      },
    );
  };
  return (
    <Modal isOpen={isOpen} setIsOpen={setIsOpen} title="ノードの統合">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div>下記のノードを統合します</div>
          <div className="flex flex-col gap-1 ">
            {mergeNodes.map((node) => {
              return (
                <div
                  className="flex flex-col gap-2 rounded-md bg-slate-700 p-2 text-sm"
                  key={node.id}
                >
                  <div className="flex flex-row items-center gap-2">
                    <div className="font-semibold">{node.name}</div>
                    <div className="text-xs">{node.label}</div>
                  </div>
                  <PropertiesSummaryPanel
                    node={node}
                    contextId={topicSpaceId}
                    contextType="topicSpace"
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div>統合後のノード</div>

          <div className="flex flex-col gap-2 rounded-md bg-slate-700 p-2 text-sm">
            <div className="flex flex-row items-center gap-2">
              {mergeNodes[0] && (
                <div className="font-semibold">{mergeNodes[0].name}</div>
              )}
              {mergeNodes[0] && (
                <div className="text-xs">{mergeNodes[0].label}</div>
              )}
            </div>
            {mergeNodes[0] && (
              <PropertiesSummaryPanel
                node={mergeNodes[0]}
                contextId={topicSpaceId}
                contextType="topicSpace"
              />
            )}
          </div>
        </div>
        <div className="flex flex-row justify-end gap-2">
          <Button
            type="button"
            className="text-sm"
            onClick={() => setIsOpen(false)}
          >
            キャンセル
          </Button>
          <Button
            type="button"
            className="text-sm"
            onClick={() => submitMergeNodes()}
          >
            統合する
          </Button>
        </div>
      </div>
    </Modal>
  );
};
