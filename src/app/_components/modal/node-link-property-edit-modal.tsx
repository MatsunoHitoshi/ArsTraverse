"use client";

import type { GraphDocumentForFrontend } from "@/app/const/types";
import { useTranslations } from "next-intl";
import { Modal } from "./modal";
import { Button } from "../button/button";
import { Input } from "@headlessui/react";
import clsx from "clsx";
import type { CustomNodeType, CustomLinkType } from "@/app/const/types";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
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
  const t = useTranslations("modal.nodeLink");
  const tCommon = useTranslations("common");
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
    <Modal isOpen={isOpen} setIsOpen={setIsOpen} title={t("editNode")}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 rounded-xl bg-slate-700 p-4">
          <div>
            <div className="text-xs text-gray-400">{t("name")}</div>
            <Input
              type="text"
              placeholder={t("nodeNamePlaceholder")}
              autoFocus
              className={clsx(
                "block w-full rounded-lg border-none bg-white/5 px-3 py-1.5 text-sm/6",
                "focus:outline-none data-[focus]:outline-1 data-[focus]:-outline-offset-2 data-[focus]:outline-slate-400",
              )}
              value={graphNodeField.name}
              defaultValue={graphNodeField.name}
              onChange={(e) => {
                const newName = e.target.value;
                setGraphNodeField({
                  ...graphNodeField,
                  name: newName,
                  properties: {
                    ...graphNodeField.properties,
                    name_ja: newName,
                  },
                });
              }}
            />
          </div>

          <div>
            <div className="text-xs text-gray-400">{t("label")}</div>
            <Input
              type="text"
              placeholder={t("nodeLabelPlaceholder")}
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
            {t("deleteNode")}
          </Button>
          <div className="flex flex-row justify-end gap-2">
            <Button
              type="button"
              className="text-sm"
              onClick={() => {
                setIsOpen(false);
              }}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              type="button"
              className="text-sm"
              onClick={() => {
                const updatedNode = {
                  ...graphNodeField,
                  properties: {
                    ...graphNodeField.properties,
                    name_ja: graphNodeField.name,
                  },
                };
                const newNodes =
                  graphDocument?.nodes.map((node) =>
                    node.id === graphNodeField.id ? updatedNode : node,
                  ) ?? [];

                const newGraphDocument: GraphDocumentForFrontend = {
                  nodes: newNodes,
                  relationships: [...(graphDocument?.relationships ?? [])],
                };
                setGraphDocument(newGraphDocument);

                setIsOpen(false);
              }}
            >
              {t("change")}
            </Button>
          </div>
        </div>

        <DeleteNodeLinkModal
          isOpen={isDeleteNodeModalOpen}
          setIsOpen={setIsDeleteNodeModalOpen}
          typeKey="node"
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
  const t = useTranslations("modal.nodeLink");
  const tCommon = useTranslations("common");
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
    <Modal isOpen={isOpen} setIsOpen={setIsOpen} title={t("editLink")}>
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
            placeholder={t("linkTypePlaceholder")}
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
            {t("deleteLink")}
          </Button>

          <div className="flex flex-row justify-end gap-2">
            <Button
              type="button"
              className="text-sm"
              onClick={() => {
                setIsOpen(false);
              }}
            >
              {tCommon("cancel")}
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
              {t("change")}
            </Button>
          </div>
        </div>
      </div>
      <DeleteNodeLinkModal
        isOpen={isDeleteLinkModalOpen}
        setIsOpen={setIsDeleteLinkModalOpen}
        typeKey="link"
        onDelete={onDeleteLink}
      />
    </Modal>
  );
};

const DeleteNodeLinkModal = ({
  isOpen,
  setIsOpen,
  typeKey,
  onDelete,
}: {
  isOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  typeKey: "node" | "link";
  onDelete: () => void;
}) => {
  const t = useTranslations("modal.nodeLink");
  const tCommon = useTranslations("common");
  const typeLabel = t(typeKey);

  return (
    <Modal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title={t("deleteConfirmTitle", { type: typeLabel })}
    >
      <div className="flex flex-col gap-6">
        <div>{t("deleteConfirmMessage", { type: typeLabel })}</div>
        <div className="flex flex-row justify-end gap-2">
          <Button
            type="button"
            className="text-sm"
            onClick={() => setIsOpen(false)}
          >
            {tCommon("cancel")}
          </Button>
          <Button
            type="button"
            className="text-sm !text-error-red"
            onClick={() => {
              onDelete();
              setIsOpen(false);
            }}
          >
            {t("confirmDelete")}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
