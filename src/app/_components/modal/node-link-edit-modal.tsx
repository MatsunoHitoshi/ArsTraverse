import type { GraphDocumentForFrontend } from "@/app/const/types";
import { Modal } from "./modal";
import { Button } from "../button/button";
import { Input } from "@headlessui/react";
import clsx from "clsx";
import { getNodeByIdForFrontend } from "@/app/_utils/kg/filter";

export const NodeLinkEditModal = ({
  isOpen,
  setIsOpen,
  graphDocument,
  setGraphDocument,
  additionalGraph,
  setAdditionalGraph,
}: {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  graphDocument: GraphDocumentForFrontend | null;
  setGraphDocument: React.Dispatch<
    React.SetStateAction<GraphDocumentForFrontend | null>
  >;
  additionalGraph: GraphDocumentForFrontend | undefined;
  setAdditionalGraph: React.Dispatch<
    React.SetStateAction<GraphDocumentForFrontend | undefined>
  >;
}) => {
  return (
    <Modal isOpen={isOpen} setIsOpen={setIsOpen} title="ノード・リンクを追加">
      <div className="flex flex-col divide-y divide-gray-500">
        {additionalGraph?.nodes?.length && additionalGraph.nodes.length > 0 ? (
          <div className="flex flex-col gap-1 py-4">
            <div className="text-sm font-bold">ノード</div>

            <div className="flex flex-col gap-2">
              {additionalGraph.nodes.map((node) => (
                <div
                  key={node.id}
                  className="flex flex-col gap-1 rounded-xl bg-slate-700 p-4"
                >
                  <div>
                    <div className="text-xs text-gray-400">名前</div>
                    <Input
                      type="text"
                      placeholder="ノードの名前"
                      autoFocus
                      className={clsx(
                        "block w-full rounded-lg border-none bg-white/5 px-3 py-1.5 text-sm/6",
                        "focus:outline-none data-[focus]:outline-1 data-[focus]:-outline-offset-2 data-[focus]:outline-slate-400",
                      )}
                      value={node.name}
                      defaultValue={node.name}
                      onChange={(e) => {
                        setAdditionalGraph({
                          ...additionalGraph,
                          nodes: additionalGraph.nodes.map((n) =>
                            n.id === node.id
                              ? { ...n, name: e.target.value }
                              : n,
                          ),
                          relationships: additionalGraph.relationships.map(
                            (r) =>
                              r.targetId === node.id
                                ? { ...r, targetName: e.target.value }
                                : r,
                          ),
                        });
                      }}
                    />
                  </div>

                  <div>
                    <div className="text-xs text-gray-400">ラベル</div>
                    <Input
                      type="text"
                      placeholder="ノードのラベル"
                      className={clsx(
                        "block w-max rounded-md border-none bg-white/5 px-3 py-1.5 text-xs",
                        "focus:outline-none data-[focus]:outline-1 data-[focus]:-outline-offset-2 data-[focus]:outline-slate-400",
                      )}
                      value={node.label}
                      defaultValue={node.label}
                      onChange={(e) => {
                        setAdditionalGraph({
                          ...additionalGraph,
                          nodes: additionalGraph.nodes.map((n) =>
                            n.id === node.id
                              ? { ...n, label: e.target.value }
                              : n,
                          ),
                        });
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <></>
        )}
        {additionalGraph?.relationships?.length &&
        additionalGraph.relationships.length > 0 ? (
          <div className="flex flex-col gap-1 py-4">
            <div className="text-sm font-bold">リンク</div>
            <div className="flex flex-col gap-2">
              {additionalGraph.relationships.map((relationship) => (
                <div
                  key={relationship.id}
                  className="flex flex-row items-center rounded-xl bg-slate-900 p-2"
                >
                  <div className="rounded-xl border border-slate-500 p-2 text-xs text-gray-400">
                    {
                      getNodeByIdForFrontend(relationship.sourceId, [
                        ...(graphDocument?.nodes ?? []),
                        ...(additionalGraph?.nodes ?? []),
                      ])?.name
                    }
                  </div>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <path
                      d="M0 12H24"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                  </svg>
                  <Input
                    type="text"
                    autoFocus
                    placeholder="リンクのタイプ"
                    className={clsx(
                      "block !max-w-32 rounded-lg border-none bg-white/5 px-3 py-1.5 text-sm/6",
                      "focus:outline-none data-[focus]:outline-1 data-[focus]:-outline-offset-2 data-[focus]:outline-slate-400",
                    )}
                    value={relationship.type}
                    defaultValue={relationship.type}
                    onChange={(e) => {
                      setAdditionalGraph({
                        ...additionalGraph,
                        relationships: additionalGraph.relationships.map((r) =>
                          r.id === relationship.id
                            ? { ...r, type: e.target.value }
                            : r,
                        ),
                      });
                    }}
                  />
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <path
                      d="M0 12H24"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    <path
                      d="M15 4L24 12M24 12L15 20"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                  </svg>
                  <div className="rounded-xl border border-slate-700 bg-slate-700 p-2 text-xs text-gray-400">
                    {
                      getNodeByIdForFrontend(relationship.targetId, [
                        ...(graphDocument?.nodes ?? []),
                        ...(additionalGraph?.nodes ?? []),
                      ])?.name
                    }
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <></>
        )}
      </div>

      <div className="flex flex-row justify-end gap-2">
        <Button
          type="button"
          className="text-sm"
          onClick={() => {
            setAdditionalGraph(undefined);
            setIsOpen(false);
          }}
        >
          キャンセル
        </Button>
        <Button
          type="button"
          className="text-sm"
          onClick={() => {
            const newGraphDocument: GraphDocumentForFrontend = {
              nodes: [
                ...(graphDocument?.nodes ?? []),
                ...(additionalGraph?.nodes?.map((node) => ({
                  ...node,
                  isAdditional: true,
                })) ?? []),
              ],
              relationships: [
                ...(graphDocument?.relationships ?? []),
                ...(additionalGraph?.relationships?.map((relationship) => ({
                  ...relationship,
                  isAdditional: true,
                })) ?? []),
              ],
            };
            setGraphDocument(newGraphDocument);
            setAdditionalGraph(undefined);
            setIsOpen(false);
          }}
        >
          追加
        </Button>
      </div>
    </Modal>
  );
};
