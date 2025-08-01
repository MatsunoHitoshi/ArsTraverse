import type { GraphDocumentForFrontend } from "@/app/const/types";
import { Modal } from "./modal";
import { Button } from "../button/button";
import { Input } from "@headlessui/react";
import clsx from "clsx";
import type { CustomNodeType, CustomLinkType } from "@/app/const/types";
import { useEffect, useState } from "react";
import { getNodeByIdForFrontend } from "@/app/_utils/kg/filter";

export const NodePropertyEditModal = ({
  isOpen,
  setIsOpen,
  graphDocument,
  setGraphDocument,
  graphNode,
}: {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  graphDocument: GraphDocumentForFrontend | null;
  setGraphDocument: React.Dispatch<
    React.SetStateAction<GraphDocumentForFrontend | null>
  >;
  graphNode: CustomNodeType | undefined;
}) => {
  const [graphNodeField, setGraphNodeField] = useState<
    CustomNodeType | undefined
  >();
  useEffect(() => {
    setGraphNodeField(graphNode);
  }, [graphNode]);

  const [isDeleteNodeModalOpen, setIsDeleteNodeModalOpen] =
    useState<boolean>(false);

  const onDeleteNode = () => {
    const newNodes = graphDocument?.nodes.filter(
      (node) => node.id !== graphNodeField?.id,
    );

    const newRelationships = graphDocument?.relationships.filter(
      (relationship) =>
        relationship.sourceId !== graphNodeField?.id &&
        relationship.targetId !== graphNodeField?.id,
    );

    const newGraphDocument: GraphDocumentForFrontend = {
      nodes: newNodes ?? [],
      relationships: newRelationships ?? [],
    };
    setGraphDocument(newGraphDocument);
    setIsOpen(false);
  };

  if (!graphNodeField) return null;

  return (
    <Modal isOpen={isOpen} setIsOpen={setIsOpen} title="ノードを編集">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 rounded-xl bg-slate-700 p-4">
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
              value={graphNodeField.name}
              defaultValue={graphNodeField.name}
              onChange={(e) => {
                setGraphNodeField({
                  ...graphNodeField,
                  name: e.target.value,
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
              value={graphNodeField.label}
              defaultValue={graphNodeField.label}
              onChange={(e) => {
                setGraphNodeField({
                  ...graphNodeField,
                  label: e.target.value,
                });
              }}
            />
          </div>
        </div>

        <div className="flex flex-row justify-between gap-2">
          <Button
            type="button"
            className="text-sm !text-error-red"
            onClick={() => setIsDeleteNodeModalOpen(true)}
          >
            ノードを削除
          </Button>
          <div className="flex flex-row justify-end gap-2">
            <Button
              type="button"
              className="text-sm"
              onClick={() => {
                setIsOpen(false);
              }}
            >
              キャンセル
            </Button>
            <Button
              type="button"
              className="text-sm"
              onClick={() => {
                const newNodes =
                  graphDocument?.nodes.map((node) =>
                    node.id === graphNodeField.id ? graphNodeField : node,
                  ) ?? [];

                const newGraphDocument: GraphDocumentForFrontend = {
                  nodes: newNodes,
                  relationships: [...(graphDocument?.relationships ?? [])],
                };
                setGraphDocument(newGraphDocument);

                setIsOpen(false);
              }}
            >
              保存
            </Button>
          </div>
        </div>

        <DeleteNodeLinkModal
          isOpen={isDeleteNodeModalOpen}
          setIsOpen={setIsDeleteNodeModalOpen}
          title="ノード"
          onDelete={onDeleteNode}
        />
      </div>
    </Modal>
  );
};

export const LinkPropertyEditModal = ({
  isOpen,
  setIsOpen,
  graphDocument,
  setGraphDocument,
  graphLink,
}: {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  graphDocument: GraphDocumentForFrontend | null;
  setGraphDocument: React.Dispatch<
    React.SetStateAction<GraphDocumentForFrontend | null>
  >;
  graphLink: CustomLinkType | undefined;
}) => {
  const [graphLinkField, setGraphLinkField] = useState<
    CustomLinkType | undefined
  >();
  useEffect(() => {
    setGraphLinkField(graphLink);
  }, [graphLink]);

  const [isDeleteLinkModalOpen, setIsDeleteLinkModalOpen] =
    useState<boolean>(false);

  const onDeleteLink = () => {
    const newRelationships = graphDocument?.relationships.filter(
      (relationship) => relationship.id !== graphLinkField?.id,
    );

    const newGraphDocument: GraphDocumentForFrontend = {
      nodes: [...(graphDocument?.nodes ?? [])],
      relationships: newRelationships ?? [],
    };
    setGraphDocument(newGraphDocument);
    setIsOpen(false);
  };

  if (!graphLinkField) return null;

  return (
    <Modal isOpen={isOpen} setIsOpen={setIsOpen} title="リンクを編集">
      <div className="flex flex-col gap-4">
        <div className="flex flex-row items-center rounded-xl bg-slate-900 p-2">
          <div className="rounded-xl border border-slate-500 p-2 text-xs text-gray-400">
            {
              getNodeByIdForFrontend(
                graphLinkField.sourceId,
                graphDocument?.nodes ?? [],
              )?.name
            }
          </div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
          >
            <path d="M0 12H24" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <Input
            type="text"
            autoFocus
            placeholder="リンクのタイプ"
            className={clsx(
              "block !max-w-32 rounded-lg border-none bg-white/5 px-3 py-1.5 text-sm/6",
              "focus:outline-none data-[focus]:outline-1 data-[focus]:-outline-offset-2 data-[focus]:outline-slate-400",
            )}
            value={graphLinkField.type}
            defaultValue={graphLinkField.type}
            onChange={(e) => {
              setGraphLinkField({
                ...graphLinkField,
                type: e.target.value,
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
            <path d="M0 12H24" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M15 4L24 12M24 12L15 20"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
          <div className="rounded-xl border border-slate-700 bg-slate-700 p-2 text-xs text-gray-400">
            {
              getNodeByIdForFrontend(
                graphLinkField.targetId,
                graphDocument?.nodes ?? [],
              )?.name
            }
          </div>
        </div>

        <div className="flex flex-row justify-between gap-2">
          <Button
            type="button"
            className="text-sm !text-error-red"
            onClick={() => setIsDeleteLinkModalOpen(true)}
          >
            リンクを削除
          </Button>

          <div className="flex flex-row justify-end gap-2">
            <Button
              type="button"
              className="text-sm"
              onClick={() => {
                setIsOpen(false);
              }}
            >
              キャンセル
            </Button>
            <Button
              type="button"
              className="text-sm"
              onClick={() => {
                const newRelationships =
                  graphDocument?.relationships.map((relationship) =>
                    relationship.id === graphLinkField.id
                      ? graphLinkField
                      : relationship,
                  ) ?? [];

                const newGraphDocument: GraphDocumentForFrontend = {
                  nodes: [...(graphDocument?.nodes ?? [])],
                  relationships: newRelationships,
                };
                setGraphDocument(newGraphDocument);
                setIsOpen(false);
              }}
            >
              保存
            </Button>
          </div>
        </div>
      </div>
      <DeleteNodeLinkModal
        isOpen={isDeleteLinkModalOpen}
        setIsOpen={setIsDeleteLinkModalOpen}
        title="リンク"
        onDelete={onDeleteLink}
      />
    </Modal>
  );
};

const DeleteNodeLinkModal = ({
  isOpen,
  setIsOpen,
  title,
  onDelete,
}: {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  title: string;
  onDelete: () => void;
}) => {
  return (
    <Modal isOpen={isOpen} setIsOpen={setIsOpen} title={`${title}を削除する`}>
      <div className="flex flex-col gap-6">
        <div>{`1件の${title}を削除してもよろしいですか？`}</div>
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
            className="text-sm !text-error-red"
            onClick={() => {
              onDelete();
              setIsOpen(false);
            }}
          >
            削除する
          </Button>
        </div>
      </div>
    </Modal>
  );
};
